// 사원별 급여 — 직원마다 지금 적용되는 계약과 세무 설정, 급여 계산에 더 필요한 것 (PRD v1.3 18.1 W02 계약 탭). 급여 담당 관리자만.
// 계약 금액과 월 예상 실지급은 다른 값이다 — 여기는 계약만 보인다. 고치는 것은 직원을 눌러 들어간 화면에서 한다.
import { getFormatter, getTranslations } from 'next-intl/server';
import { ListHead } from '@/components/listframe';
import { ChevronRight, FileSignature, ReceiptText } from 'lucide-react';
import Link from 'next/link';
import { Card, CardTitle, Chip, PageShell } from '@/components/ui';
import { getMe } from '@/lib/auth';
import { groupPath } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { referenceHourly, type SetupGap } from '@/lib/payroll/contract';
import { loadItems } from '@/lib/payroll/data';
import { AUTO_PAYMENT_CODES } from '@/lib/payroll/engine/reserved-items';
import { loadStaffPayBoard } from '@/lib/payroll/staff-data';
import { addDays } from '@/lib/calendar';
import { toKstDate } from '@/lib/time';
import { BulkAll, BulkCheck, BulkPanel } from './BulkPanel';
import { ImportPanel } from './ImportPanel';
import { TaxBoard } from './TaxBoard';
import { QuickFind } from '@/components/QuickFind';

export default async function StaffPayPage({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  const tGear = await getTranslations('frame');
  const tc = await getTranslations('common');
  const [t, f, me, sp] = await Promise.all([getTranslations('admin.staffPay'), getFormatter(), getMe(), searchParams]);
  const taxTab = sp.v === 'tax'; // 「세액감면 · 공제등록」 탭 (2026-10-20)
  if (!me || me.role !== 'admin' || !me.canViewPayroll) return <PageShell><p className="rounded-card bg-warn-tint p-4 text-sm text-warn">{t('forbidden')}</p></PageShell>;
  const today = toKstDate(new Date());
  const [board, groups, allItems] = await Promise.all([loadStaffPayBoard(today), loadOrgGroups(), loadItems()]);
  // 설정이 덜 된 직원을 맨 위로 (2026-10-26 의뢰인: 이슈 먼저) — 나머지 순서는 그대로
  const lines = [...board].sort((a, b) => Number(b.gaps.length > 0) - Number(a.gaps.length > 0));
  const gapLines = lines.filter((l) => l.gaps.length > 0);
  // 한 번에 붙일 수 있는 고정 수당 · 공제 — 사람이 정하는 항목만(자동 계산 항목은 뺀다), 직원 상세와 같은 기준
  const bulkItems = allItems.filter((x) => x.inUse && (x.validTo === null || x.validTo > today) && !AUTO_PAYMENT_CODES.has(x.code) && x.calcKind !== 'TIME' && x.calcKind !== 'RULE').map((x) => ({ code: x.code, label: `${x.koName} (${t(x.kind === 'PAYMENT' ? 'kindPay' : 'kindDeduct')})`, defaultAmount: x.defaultAmount }));
  const won = (v: number) => t('won', { n: f.number(v) });
  const ready = lines.filter((l) => l.gaps.length === 0).length;
  // 책갈피 모양 탭 (2026-10-22 의뢰인: 「글씨만 있어서 누르면 다음 탭으로 넘어가는지 알 수 없다 — 책갈피처럼 표시를」)
  const tab = (on: boolean) => `flex min-h-11 items-center gap-2 rounded-t-card border border-b-0 px-5 text-sm font-bold lg:min-h-10 ${on ? 'relative -mb-px border-border bg-bg text-primary' : 'border-transparent bg-surface text-muted hover:bg-primary-tint hover:text-primary'}`;
  const gapHref = (id: string, g: SetupGap) => (g === 'no_joined_on' ? `/admin/members/${id}` : g === 'no_tax' || g === 'insurance_unknown' ? `/admin/payroll/staff/${id}?tab=tax` : `/admin/payroll/staff/${id}`);

  return (
    <PageShell wide>
      <ListHead title={t('title')} desc={t('intro')} settingsHref="/admin/settings?tab=pay" settingsLabel={tGear('item.payEmployeeDefaults')} />
      <nav className="flex gap-1 border-b border-border">
        <Link href="/admin/payroll/staff" aria-current={!taxTab ? 'page' : undefined} className={tab(!taxTab)}><FileSignature aria-hidden size={16} />{t('board.tabContract')}</Link>
        <Link href="/admin/payroll/staff?v=tax" aria-current={taxTab ? 'page' : undefined} className={tab(taxTab)}><ReceiptText aria-hidden size={16} />{t('board.tabTax')}</Link>
      </nav>
      {taxTab ? (
        <TaxBoard lines={lines} today={today} />
      ) : (
      <>
      <ImportPanel
        tomorrow={addDays(today, 1)}
        labels={{
          ...Object.fromEntries((['employeeNo', 'name', 'payType', 'amount', 'timeBasis', 'monthlyHours', 'annualDivisor'] as const).map((c) => [c, t(`imp.col.${c}`)])),
          pay_MONTHLY: t('payType.MONTHLY'), pay_HOURLY: t('payType.HOURLY'), pay_ANNUAL: t('payType.ANNUAL'),
          basis_ACTUAL: t('timeBasis.ACTUAL'), basis_ROUNDED: t('timeBasis.ROUNDED'), basis_SCHEDULE: t('timeBasis.SCHEDULE'),
        }}
      />
      <BulkPanel names={Object.fromEntries(lines.map((l) => [l.employeeId, l.name]))} today={today} items={bulkItems} />
      {gapLines.length > 0 && (
        <Card>
          <CardTitle>{t('gapSummary', { n: gapLines.length })}</CardTitle>
          <ul className="flex flex-col divide-y divide-border pt-1 text-sm">
            {gapLines.slice(0, 5).map((l) => (
              <li key={l.employeeId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                <b className="shrink-0">{l.name}</b>
                <span className="min-w-0 flex-1 text-muted">{l.gaps.map((g) => t(`gap.${g}`)).join(' · ')}</span>
                <Link href={gapHref(l.employeeId, l.gaps[0])} className="inline-flex min-h-9 shrink-0 items-center rounded-button bg-primary-tint px-3 font-bold text-primary">{t('gapFix')} ›</Link>
              </li>
            ))}
          </ul>
          {gapLines.length > 5 && <p className="pt-2 text-xs text-faint">{t('gapMore', { n: gapLines.length - 5 })}</p>}
        </Card>
      )}
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
            <li key={l.employeeId} data-find={`${l.name} ${groupPath(groups, l.groupId) ?? ''}`} className="flex items-center">
              <label className="flex min-h-11 items-center pl-3"><BulkCheck id={l.employeeId} label={t('bulk.selectOne', { name: l.name })} /></label>
              <Link href={`/admin/payroll/staff/${l.employeeId}`} className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 active:bg-surface">
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
      <div className="hidden overflow-x-auto table-ruled lg:block xl:overflow-visible">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface text-left">
              <th scope="col" className="w-10 px-3 py-2.5"><BulkAll label={t('bulk.selectAll')} /></th>
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
                  <td className="px-3 py-3"><BulkCheck id={l.employeeId} label={t('bulk.selectOne', { name: l.name })} /></td>
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
                      // 마우스를 올리면(또는 눌러 고르면) 무엇이 빠졌는지 + 그 설정으로 바로 가는 링크 (2026-10-22 의뢰인: 「미설정이래 — 어떤 상태인지 나오거나 누르면 설정하는 곳으로」)
                      <span className="group relative inline-flex">
                        <Link href={gapHref(l.employeeId, l.gaps[0])} className="rounded-button focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                          <Chip tone="warn">{t('stateGap', { n: l.gaps.length })}</Chip>
                        </Link>
                        <span role="tooltip" className="invisible absolute top-full right-0 z-30 w-80 pt-1.5 opacity-0 transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                          <span className="flex flex-col gap-1 rounded-card border border-border bg-bg p-3 text-left shadow-pop">
                            <span className="px-1 pb-1 text-xs font-bold text-faint">{t('gapTitle', { name: l.name })}</span>
                            {l.gaps.map((g) => (
                              <Link key={g} href={gapHref(l.employeeId, g)} className="flex items-start gap-2 rounded-button px-2 py-1.5 text-sm hover:bg-surface">
                                <span className="min-w-0 flex-1 text-text">{t(`gap.${g}`)}</span>
                                <span className="shrink-0 text-xs font-bold whitespace-nowrap text-primary">{t('gapFix')} ›</span>
                              </Link>
                            ))}
                          </span>
                        </span>
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
      </>
      )}
    </PageShell>
  );
}
