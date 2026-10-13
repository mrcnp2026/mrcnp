// 급여대장 엑셀 내려받기 (PRD v1.3 23.4). 급여 담당 관리자만. 내려주기 전에 급여 전용 기록에 남긴다.
// 초안 · 계산됨 · 검토됨 대장도 받을 수 있지만 시트마다 「검토용」이라고 적힌다. 이체용 파일이 아니다.
import { randomUUID } from 'node:crypto';
import { getTranslations } from 'next-intl/server';
import { BRAND } from '@/config/brand';
import { ApiError } from '@/lib/api';
import { deny } from '@/lib/csv-response';
import { requirePayroll } from '@/lib/payroll/data';
import { loadRun } from '@/lib/payroll/run-data';
import { buildRunWorkbook } from '@/lib/payroll/run-export';
import { payrollAudit } from '@/lib/payroll/staff-data';

export const maxDuration = 60;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  let me;
  try {
    me = await requirePayroll();
  } catch (e) {
    return deny(e instanceof ApiError ? e.status : 500, e instanceof ApiError ? e.code : 'generic');
  }
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return deny(400, 'invalid_input');
  const run = await loadRun(id);
  if (!run) return deny(404, 'not_found');
  if (!run.generationId) return deny(409, 'payroll_not_calculated');
  // 파일은 회사 안에서 보는 문서라 한국어로 고정한다
  const t = await getTranslations({ locale: 'ko', namespace: 'admin.payRuns' });
  const requestId = randomUUID();
  const { wb, statements } = await buildRunWorkbook({
    run, company: BRAND.name, by: me.name, now: new Date().toISOString(),
    labels: {
      status: t(`status.${run.status}`), kind: t(`kind.${run.kind}`), mode: t(run.isTest ? 'practiceChip' : 'liveChip'), line: (code, fallback) => (t.has(`line.${code}`) ? t(`line.${code}`) : fallback),
      pay: t('kindPay'), deduction: t('kindDeduct'), employer: t('colEmployer'), auto: t('source.AUTO'), manual: t('source.MANUAL'), override: t('source.OVERRIDE'), blocked: t('exportBlocked'), ok: t('resultOk'), draftBanner: t('exportDraft'), finalBanner: t('status.FINALIZED'),
    },
  });
  await payrollAudit({ actorId: me.id, action: 'run.export', table: 'payroll_runs', subjectId: run.id, runId: run.id, requestId, detail: { statements, status: run.status } });
  const month = run.periodFrom.slice(0, 7).replace('-', '');
  const name = `${t('exportFile')}_${month}_${run.kind === 'BONUS' ? `${t('kind.BONUS')}${run.sequence}_` : ''}rev${run.revision}.xlsx`;
  return new Response((await wb.xlsx.writeBuffer()) as ArrayBuffer, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="payroll_${month}_rev${run.revision}.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'cache-control': 'no-store',
      'x-request-id': requestId,
    },
  });
}
