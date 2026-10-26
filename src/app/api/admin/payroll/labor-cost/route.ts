// 인건비 현황 엑셀 (2026-10-14 인건비 표 확장). 급여 담당 관리자만. 화면과 같은 계산 · 같은 조건(해 · 종류 · 부서 · 검토 중 포함)으로 만든다.
// 내려주기 전에 반출 기록(download_logs)을 남긴다 — 금액이 담긴 파일이다.
import { randomUUID } from 'node:crypto';
import { getTranslations } from 'next-intl/server';
import { BRAND } from '@/config/brand';
import { OFFICE } from '@/config/office';
import { getMe } from '@/lib/auth';
import { deny } from '@/lib/csv-response';
import { groupPath } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { buildLaborCost, type LaborKind } from '@/lib/payroll/labor-cost';
import { laborWorkbook } from '@/lib/payroll/labor-xlsx';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';

export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  const me = await getMe();
  if (!me || me.role !== 'admin' || !me.canViewPayroll) return deny(403, 'forbidden');
  const u = new URL(req.url);
  const thisYear = Number(toKstDate(new Date()).slice(0, 4));
  const y = u.searchParams.get('y') ?? '';
  const year = /^\d{4}$/.test(y) && Number(y) >= 2000 && Number(y) <= 2100 ? Number(y) : thisYear;
  const k = u.searchParams.get('k');
  const kind: LaborKind | null = k === 'REGULAR' || k === 'BONUS' || k === 'DAILY' ? k : null;
  const groups = await loadOrgGroups();
  const g = u.searchParams.get('g');
  const groupId = g && groups.some((x) => x.id === g) ? g : null;
  const practice = OFFICE.practiceMode && u.searchParams.get('live') !== '1';
  const withDraft = u.searchParams.get('draft') === '1';
  const t = await getTranslations({ locale: 'ko', namespace: 'admin.laborCost' });
  const r = await buildLaborCost({ year, practice, kind, groupId, withDraft, testViewer: !!me.employeeNo?.startsWith('e2e-'), unassigned: t('unassigned'), daily: { group: t('daily.group'), wage: t('daily.wage'), nontax: t('daily.nontax'), incomeTax: t('daily.incomeTax'), localTax: t('daily.localTax'), other: t('daily.other') } });
  const fileName = `${t('file', { year })}.xlsx`;
  const { error } = await createAdminClient().from('download_logs').insert({ actor_id: me.id, kind: 'labor_cost', scope: `${year}${kind ? `/${kind}` : ''}${groupId ? `/${groupId}` : ''}${withDraft ? '/draft' : ''}`, file_name: fileName });
  if (error) return deny(500, 'download_log_failed');
  const conditions = [t('xYear', { year }), kind ? t(`kind.${kind}`) : t('all'), groupId ? (groupPath(groups, groupId) ?? '') : t('all'), withDraft ? t('fDraft') : '', BRAND.name, me.name].filter(Boolean).join(' · ');
  const wb = laborWorkbook(r, {
    title: t('title'),
    conditions,
    sum: t('sum'),
    sheets: { summary: t('xSummary'), month: t('cMonth'), group: t('cGroup'), job: t('cJob'), employee: t('cEmployee'), pay: t('byPayItem'), deduction: t('byDeductionItem') },
    cols: { name: t('cEmployee'), statements: t('cStatements'), pay: t('cPay'), taxable: t('cTaxable'), exempt: t('cExempt'), deduction: t('cDeduction'), net: t('cNet'), employer: t('cEmployer'), total: t('cTotal'), people: t('sPeople'), average: t('sAverage'), item: t('cItem'), amount: t('cAmount'), code: t('cCode') },
  });
  return new Response((await wb.xlsx.writeBuffer()) as ArrayBuffer, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="labor-cost_${year}.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'cache-control': 'no-store',
      'x-request-id': randomUUID(),
    },
  });
}
