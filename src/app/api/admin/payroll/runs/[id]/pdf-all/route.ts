// 대장 전체 명세서 PDF 한 파일 (PRD v1.3 23.3 · 미구현 17번, 2026-10-15). 급여 담당 관리자만.
// 계산된(OK) 사람마다 한 사람 명세서와 똑같은 면을 만들어 이름 순으로 이어 붙인다. 막힌 사람 · 대상에서 뺀 사람은 넣지 않는다. 확정 전이면 쪽마다 「검토용」.
import { randomUUID } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { ApiError } from '@/lib/api';
import { deny } from '@/lib/csv-response';
import { requirePayroll } from '@/lib/payroll/data';
import { loadRun, loadRunBoard, loadStatement } from '@/lib/payroll/run-data';
import { asSlipTime, slipPdfBytes, slipTax } from '@/lib/payroll/slip-pdf-response';
import { payrollAudit } from '@/lib/payroll/staff-data';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 60;
const MAX_PEOPLE = 300; // 한 파일에 너무 많으면 시간 안에 못 만든다 — 그때는 한 사람씩

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  let me;
  try {
    me = await requirePayroll();
  } catch (e) {
    return deny(e instanceof ApiError ? e.status : 500, e instanceof ApiError ? e.code : 'generic');
  }
  const { id } = await ctx.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return deny(400, 'invalid_input');
  const run = await loadRun(id);
  if (!run || run.kind === 'DAILY') return deny(404, 'not_found');
  if (!run.generationId) return deny(409, 'payroll_not_calculated');
  const { lines } = await loadRunBoard(run);
  const ok = lines.filter((l) => l.included && l.state === 'OK').sort((a, b) => a.name.localeCompare(b.name));
  if (ok.length === 0) return deny(409, 'payroll_blocked');
  if (ok.length > MAX_PEOPLE) return deny(413, 'too_many');
  const db = createAdminClient();
  const { data: rows } = await db.from('payroll_statements').select('id, employee_id').eq('generation_id', run.generationId).in('employee_id', ok.map((l) => l.employeeId));
  const sid = new Map((rows ?? []).map((r) => [r.employee_id as string, r.id as string]));
  const month = run.periodFrom.slice(0, 7);
  const requestId = randomUUID();
  const out = await PDFDocument.create();
  let labels = { draft: '', file: '' };
  for (const l of ok) {
    const { statement: s } = await loadStatement(run, l.employeeId);
    if (!s || s.state !== 'OK' || s.pay === null || s.deduction === null || s.net === null) continue;
    const one = await slipPdfBytes({
      locale: 'ko', no: `${month.replace('-', '')}-${run.kind[0]}${run.sequence}-${(sid.get(l.employeeId) ?? '').slice(0, 8).toUpperCase()}`, name: l.name, employeeNo: l.employeeNo, groupId: l.groupId, month,
      periodFrom: run.periodFrom, periodTo: new Date(Date.parse(`${run.periodTo}T00:00:00Z`) - 86400000).toISOString().slice(0, 10), payDate: run.payDate, revision: run.revision,
      pay: s.pay, deduction: s.deduction, net: s.net, draft: run.status !== 'FINALIZED', practice: run.isTest, correctionReason: run.correctionReason, requestId, tax: slipTax(s.snapshot, s.pay), lines: s.lines, time: run.kind === 'REGULAR' ? asSlipTime(s.snapshot.time) : null,
    });
    labels = { draft: one.draftLabel, file: one.fileLabel };
    const doc = await PDFDocument.load(one.bytes);
    for (const pg of await out.copyPages(doc, doc.getPageIndices())) out.addPage(pg);
  }
  out.setTitle(`${labels.file} ${month} rev${run.revision}`);
  await payrollAudit({ actorId: me.id, action: 'run.pdf_all', table: 'payroll_runs', subjectId: run.id, runId: run.id, requestId, detail: { people: ok.length, status: run.status, revision: run.revision } });
  const bytes = await out.save();
  const file = `${labels.file}_${month.replace('-', '')}_${run.kind}${run.sequence}_rev${run.revision}_${ok.length}${run.status !== 'FINALIZED' ? `_${labels.draft}` : ''}.pdf`;
  return new Response(bytes as unknown as BodyInit, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="payslips_${month.replace('-', '')}_rev${run.revision}.pdf"; filename*=UTF-8''${encodeURIComponent(file)}`,
      'cache-control': 'private, no-store',
      'x-robots-tag': 'noindex',
      'x-request-id': requestId,
    },
  });
}
