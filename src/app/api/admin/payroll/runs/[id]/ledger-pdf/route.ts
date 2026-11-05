// 급여대장 PDF — 회사 대장 양식(표지 + 직원별 근무현황), 급여명세서와 같은 톤 (2026-11-05 의뢰인). 급여 담당 관리자만. 내려주기 전에 급여 전용 기록에 남긴다.
// 확정 전 대장도 받을 수 있지만 쪽마다 「검토용」이 찍힌다. 이체용 파일이 아니다.
import { randomUUID } from 'node:crypto';
import { getTranslations } from 'next-intl/server';
import { ApiError } from '@/lib/api';
import { companyName } from '@/lib/company';
import { deny } from '@/lib/csv-response';
import { requirePayroll } from '@/lib/payroll/data';
import { payFileName } from '@/lib/payroll/file-name';
import { loadLedger } from '@/lib/payroll/ledger-data';
import { buildLedgerPdf } from '@/lib/payroll/ledger-pdf';
import { loadRun } from '@/lib/payroll/run-data';
import { payrollAudit } from '@/lib/payroll/staff-data';

export const maxDuration = 300; // 직원 · 기록이 늘어도 시간 제한에 조용히 끊기지 않게 (Fluid는 실제 계산 시간만 과금)

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
  // 파일은 회사 안에서 보는 문서라 한국어로 고정한다
  const t = await getTranslations({ locale: 'ko', namespace: 'admin.payRuns' });
  const requestId = randomUUID();
  const lg = await loadLedger(run, {
    line: (code, fallback) => (t.has(`line.${code}`) ? t(`line.${code}`) : fallback),
    blocker: (code) => (t.has(`blocker.${code}`) ? t(`blocker.${code}`) : code),
    manual: t('source.MANUAL'), override: t('source.OVERRIDE'),
  });
  const bytes = await buildLedgerPdf(lg, { company: await companyName(), payDate: run.payDate, by: me.name, now: new Date().toISOString(), draft: lg.draft ? t('exportDraft') : null, practice: run.isTest ? t('practiceChip') : null, blocked: t('exportBlocked') });
  await payrollAudit({ actorId: me.id, action: 'run.ledger_pdf', table: 'payroll_runs', subjectId: run.id, runId: run.id, requestId, detail: { statements: lg.people.length, status: run.status } });
  const month = run.periodFrom.slice(0, 7).replace('-', '');
  const name = await payFileName({ ym: run.periodFrom.slice(0, 7), doc: 'ledger', bonusSeq: run.kind === 'BONUS' ? run.sequence : null, revision: run.revision, draft: lg.draft, ext: 'pdf' });
  return new Response(bytes as BodyInit, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="payroll_ledger_${month}_rev${run.revision}.pdf"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'cache-control': 'no-store',
      'x-request-id': requestId,
    },
  });
}
