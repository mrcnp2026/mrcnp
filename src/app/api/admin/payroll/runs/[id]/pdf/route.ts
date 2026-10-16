// 대장의 한 사람 명세서 PDF (PRD v1.3 23.3). 급여 담당 관리자만. 확정 전이면 쪽마다 「검토용」이 찍힌다.
// 계산이 막힌(BLOCKED) 명세서는 만들지 않는다 — 금액이 없는 종이가 나가지 않게.
import { randomUUID } from 'node:crypto';
import { ApiError } from '@/lib/api';
import { deny } from '@/lib/csv-response';
import { requirePayroll } from '@/lib/payroll/data';
import { loadRun, loadStatement } from '@/lib/payroll/run-data';
import { asSlipTime, slipPdfResponse } from '@/lib/payroll/slip-pdf-response';
import { payrollAudit } from '@/lib/payroll/staff-data';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 60;

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  let me;
  try {
    me = await requirePayroll();
  } catch (e) {
    return deny(e instanceof ApiError ? e.status : 500, e instanceof ApiError ? e.code : 'generic');
  }
  const { id } = await ctx.params;
  const emp = new URL(req.url).searchParams.get('emp') ?? '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(emp)) return deny(400, 'invalid_input');
  const run = await loadRun(id);
  if (!run) return deny(404, 'not_found');
  if (!run.generationId) return deny(409, 'payroll_not_calculated');
  const db = createAdminClient();
  const [{ statement: s }, { data: p }, { data: row }] = await Promise.all([
    loadStatement(run, emp),
    db.from('profiles').select('name, employee_no, group_id').eq('id', emp).maybeSingle(),
    db.from('payroll_statements').select('id').eq('generation_id', run.generationId).eq('employee_id', emp).maybeSingle(),
  ]);
  if (!s || !p || !row) return deny(404, 'not_found');
  if (s.state !== 'OK' || s.pay === null || s.deduction === null || s.net === null) return deny(409, 'payroll_blocked');
  const month = run.periodFrom.slice(0, 7);
  const requestId = randomUUID();
  await payrollAudit({ actorId: me.id, action: 'statement.pdf', table: 'payroll_statements', subjectId: row.id as string, runId: run.id, employeeId: emp, requestId, detail: { status: run.status, revision: run.revision } });
  return slipPdfResponse({
    locale: 'ko', no: `${month.replace('-', '')}-${run.kind[0]}${run.sequence}-${(row.id as string).slice(0, 8).toUpperCase()}`, name: p.name as string, employeeNo: p.employee_no as string | null, groupId: p.group_id as string | null, month,
    periodFrom: run.periodFrom, periodTo: new Date(Date.parse(`${run.periodTo}T00:00:00Z`) - 86400000).toISOString().slice(0, 10), payDate: run.payDate, revision: run.revision,
    pay: s.pay, deduction: s.deduction, net: s.net, draft: run.status !== 'FINALIZED', practice: run.isTest, correctionReason: run.correctionReason, requestId, lines: s.lines, time: run.kind === 'REGULAR' ? asSlipTime(s.snapshot.time) : null,
  });
}
