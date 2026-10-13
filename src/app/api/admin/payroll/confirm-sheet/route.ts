// 노무 · 세무 확인 요청서 내려받기 (엑셀) — 프로그램에 든 급여 기준을 양식에 담아 준다 (2026-10-13 의뢰인). 급여 담당 관리자만.
// 내려주기 전에 download_logs에 먼저 쓴다(쓰기가 실패하면 내려주지 않는다). 개인정보 · 금액은 없다.
import { randomUUID } from 'node:crypto';
import { getTranslations } from 'next-intl/server';
import { BRAND } from '@/config/brand';
import { ApiError } from '@/lib/api';
import { deny } from '@/lib/csv-response';
import { buildConfirmWorkbook } from '@/lib/payroll/confirm-sheet';
import { loadItems, loadPolicies, loadReferences, loadSettingHistory, requirePayroll } from '@/lib/payroll/data';
import { REFERENCE_KINDS } from '@/lib/payroll/reference';
import { ALLOWANCE_KINDS, payDateFor } from '@/lib/payroll/settings';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';

export async function GET(): Promise<Response> {
  let me;
  try {
    me = await requirePayroll();
  } catch (e) {
    return deny(e instanceof ApiError ? e.status : 500, e instanceof ApiError ? e.code : 'generic');
  }
  // 양식은 받는 사람(노무사 · 세무사)이 읽는 문서라 한국어로 고정한다
  const t = await getTranslations({ locale: 'ko', namespace: 'admin.paySettings' });
  const today = toKstDate(new Date());
  const [references, allowances, leave, items, ledger, working] = await Promise.all([
    loadReferences(REFERENCE_KINDS, ['APPROVED', 'PENDING_ADMIN_REVIEW']),
    loadPolicies('allowance.'),
    loadPolicies('leave.'),
    loadItems(),
    loadSettingHistory('ledger'),
    loadSettingHistory('working-time'),
  ]);
  const order = (k: string) => (REFERENCE_KINDS as readonly string[]).indexOf(k);
  references.sort((a, b) => order(a.kind) - order(b.kind) || (a.state === b.state ? ((a.validFrom ?? '') < (b.validFrom ?? '') ? -1 : 1) : a.state === 'APPROVED' ? -1 : 1));
  const fileName = `급여기준_확인요청서_${today.replace(/-/g, '')}.xlsx`;
  const { error } = await createAdminClient().from('download_logs').insert({ actor_id: me.id, kind: 'payroll_confirm_sheet', scope: today, file_name: fileName });
  if (error) return deny(500, 'download_log_failed');

  const wb = buildConfirmWorkbook({
    company: BRAND.name,
    by: me.name,
    today,
    references,
    kindName: (k) => t(`ref.${k.replace('.', '_')}`),
    fieldName: (k) => (t.has(`refField.${k}`) ? t(`refField.${k}`) : null),
    warnName: (w) => (t.has(`warn.${w}`) ? t(`warn.${w}`) : w),
    allowances: ALLOWANCE_KINDS.map((k) => ({ name: t(`s07.kind.${k}`), legal: t(`s07.legalOf.${k}`), policy: allowances.find((p) => p.kind === `allowance.${k}`) ?? null })),
    annual: leave.find((p) => p.kind === 'leave.annual-accrual') ?? null,
    items,
    calcName: (k) => t(`calcKind.${k}`),
    taxName: (k) => t(`tax.${k}`),
    ordinaryName: (k) => t(`ordinary.${k}`),
    ledger: ledger[0] ?? null,
    workingTime: working[0] ?? null,
    ledgerText: (l) => [
      [t('s02.payMonth'), t(`s02.payMonthOf.${l.payMonth}`)],
      [t('s02.payDay'), `${l.payDayMode === 'MONTH_END' ? t('s02.payDayModeOf.MONTH_END') : `${l.payDay}`} (${t('s02.example', { month: today.slice(0, 7), date: payDateFor(today.slice(0, 7), l) })})`],
      [t('s02.holidayShift'), l.holidayShift ? t(`s02.holidayShiftOf.${l.holidayShift}`) : t('notChosen')],
      [t('s02.insuranceBasis'), t(`s02.insuranceBasisOf.${l.insuranceBasis}`)],
      [t('s02.withholding'), `${l.withholdingRatio}%`],
    ],
  });
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="payroll-confirm_${today.replace(/-/g, '')}.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'cache-control': 'no-store',
      'x-request-id': randomUUID(),
    },
  });
}
