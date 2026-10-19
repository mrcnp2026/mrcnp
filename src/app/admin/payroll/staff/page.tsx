// 사원별 급여 — 직원마다 지금 적용되는 계약과 세무 설정, 급여 계산에 더 필요한 것 (PRD v1.3 18.1 W02 계약 탭). 급여 담당 관리자만.
// 계약 금액과 월 예상 실지급은 다른 값이다 — 여기는 계약만 보인다. 고치는 것은 직원을 눌러 들어간 화면에서 한다.
import { getFormatter, getTranslations } from 'next-intl/server';
import { PayFlow } from '@/components/PayFlow';
import { ListHead } from '@/components/listframe';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { Chip, PageShell } from '@/components/ui';
import { getMe } from '@/lib/auth';
import { groupPath } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { referenceHourly } from '@/lib/payroll/contract';
import { loadStaffPayBoard } from '@/lib/payroll/staff-data';
import { addDays } from '@/lib/calendar';
import { toKstDate } from '@/lib/time';
import { ImportPanel } from './ImportPanel';
import { QuickFind } from '@/components/QuickFind';

export default async function StaffPayPage() {
  const tGear = await getTranslations('frame');
  const tc = await getTranslations('common');
  const [t, f, me] = await Promise.all([getTranslations('admin.staffPay'), getFormatter(), getMe()]);
  if (!me || me.role !== 'admin' || !me.canViewPayroll) return <PageShell><p className="rounded-card bg-warn-tint p-4 text-sm text-warn">{t('forbidden')}</p></PageShell>;
  const today = toKstDate(new Date());
  const [lines, groups] = await Promise.all([loadStaffPayBoard(today), loadOrgGroups()]);
  const won = (v: number) => t('won', { n: f.number(v) });
  const ready = lines.filter((l) => l.gaps.length === 0).length;

  return (
    <PageShell wide>
      <ListHead title={t('title')} desc={t('intro')} settingsHref="/admin/settings?tab=pay" settingsLabel={tGear('item.payEmployeeDefaults')} />
      <PayFlow now="staff" />
      <ImportPanel
        tomorrow={addDays(today, 1)}
        labels={{
          ...Object.fromEntries((['employeeNo', 'name', 'payType', 'amount', 'timeBasis', 'monthlyHours', 'annualDivisor'] as const).map((c) => [c, t(`imp.col.${c}`)])),
          pay_MONTHLY: t('payType.MONTHLY'), pay_HOURLY: t('payType.HOURLY'), pay_ANNUAL: t('payType.ANNUAL'),
          basis_ACTUAL: t('timeBasis.ACTUAL'), basis_ROUNDED: t('timeBasis.ROUNDED'), basis_SCHEDULE: t('timeBasis.SCHEDULE'),
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone="info">{t('sumAll', { n: lines.length })}</Chip>
        <Chip tone="ok">{t('sumReady', { n: ready })}</Chip>
        <Chip tone={lines.length - ready > 0 ? 'warn' : 'neutral'}>{t('sumGap', { n: lines.length - ready })}</Chip>
      </div>
      {/* 폰: 직원마다 한 줄 — 이름 · 급여 형태 · 금액 · 상태, 누르면 그 직원 화면 (2026-10-15: 표 오른쪽이 잘리던 것) */}
      {lines.length > 6 && (
        <div className="lg:hidden">
          <QuickFind target="pay-staff" placeholder={tc('findName')} clearLabel={tc('clear')} emptyText={t('empty')} />
        </div>
      )}
      <ul id="pay-staff" className="flex flex-col divide-y divide-border rounded-card border border-border bg-bg lg:hidden" data-phone-staff>
        {lines.map((l) => {
          const c = l.contract;
          return (
            <li key={l.employeeId} data-find={`${l.name} ${groupPath(groups, l.groupId) ?? ''}`}>
              <Link href={`/admin/payroll/staff/${l.employeeId}`} className="flex items-center gap-3 px-3 py-2.5 active:bg-surface">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center gap-2">
                    <b className="truncate">{l.name}</b>
                    {!l.active && <span className="text-xs text-faint">{t('inactive')}</span>}
                  </span>
                  <span className="num truncate text-xs text-muted">{c ? `${t(`payType.${c.payType}`)} · ${won(c.amount)}` : (groupPath(groups, l.groupId) ?? '')}</span>
                </span>
                {l.gaps.length === 0 ? <Chip tone="ok">{t('stateReady')}</Chip> : <Chip tone="warn">{t('stateGap', { n: l.gaps.length })}</Chip>}
                <ChevronRight aria-hidden size={18} className="shrink-0 text-faint" />
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="hidden overflow-x-auto table-ruled lg:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface text-left">
              {['colName', 'colNo', 'colGroup', 'colJoined', 'colType', 'colAmount', 'colHours', 'colHourly', 'colFrom', 'colState'].map((k) => (
                <th key={k} scope="col" className="px-3 py-2.5 text-xs font-semibold whitespace-nowrap text-muted">
                  {t(k)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const c = l.contract;
              const hourly = c ? referenceHourly(c) : null;
              return (
                <tr key={l.employeeId} className="border-b border-border align-top">
                  <td className="px-3 py-3">
                    <Link href={`/admin/payroll/staff/${l.employeeId}`} className="font-bold text-primary hover:underline">
                      {l.name}
                    </Link>
                    {!l.active && <span className="ml-2 text-xs text-faint">{t('inactive')}</span>}
                  </td>
                  <td className="num px-3 py-3 text-muted">{l.employeeNo}</td>
                  <td className="px-3 py-3 text-muted">{groupPath(groups, l.groupId) ?? ''}</td>
                  <td className="num px-3 py-3 whitespace-nowrap">{l.joinedOn ?? ''}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{c ? t(`payType.${c.payType}`) : ''}</td>
                  <td className="num px-3 py-3 whitespace-nowrap">{c ? won(c.amount) : ''}</td>
                  <td className="num px-3 py-3">{c?.monthlyHours ?? ''}</td>
                  <td className="num px-3 py-3 whitespace-nowrap">{hourly === null ? '' : won(hourly)}</td>
                  <td className="num px-3 py-3 whitespace-nowrap">
                    {c?.validFrom ?? ''}
                    {l.upcoming && <span className="block text-xs text-faint">{t('upcoming', { date: l.upcoming.validFrom })}</span>}
                  </td>
                  <td className="px-3 py-3">
                    {l.gaps.length === 0 ? (
                      <Chip tone="ok">{t('stateReady')}</Chip>
                    ) : (
                      // 무엇이 빠졌는지는 마우스를 올리면(title) · 화면 읽기 프로그램에는 글로 — 줄마다 두 문장이 반복돼 줄 높이가 두 배였다 (2026-10-19 디자인: 표 전반의 톤)
                      <span title={l.gaps.map((g) => t(`gap.${g}`)).join(' ')}>
                        <Chip tone="warn">{t('stateGap', { n: l.gaps.length })}</Chip>
                        <span className="sr-only">{l.gaps.map((g) => t(`gap.${g}`)).join(' ')}</span>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-faint">{t('note')}</p>
    </PageShell>
  );
}
