// 관리자 「연차 관리」 (②-2 게이트 5). 직원별 잔여 + 부여 입력 + 승인된 휴가 취소.
// 위 줄(2026-10-11 의뢰인: 시프티의 휴가 「전체」처럼): 이름 검색 · 부서로 거르기 · 기준일 · [내 휴가]. 폰 목록은 권한(관리자 · 직원)별 묶음.
// 기준일을 바꾸면 그날 적용되는 부여 기준의 받은 · 사용 · 잔여를 본다. 입력 칸의 계산값은 언제나 오늘 기준이다.
// ★ 4-7: 발생일수는 관리자가 직접 입력. 참고 계산값은 옆에 "참고용"으로만 보여 주고 입력 칸에 미리 채우지 않는다.
import { Select } from '@/components/Select';
import { getMe } from '@/lib/auth';
import { scopeFilter } from '@/lib/scope';
import { ChevronRight, Download } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Help, HelpTip } from '@/components/Help';
import { ListBar } from '@/components/ListBar';
import { PcTable } from '@/components/PcTable';
import { Pager, pageOf } from '@/components/Pager';
import { Card, Chip, Empty, PageShell } from '@/components/ui';
import { CountUp } from '@/components/CountUp';
import { OFFICE } from '@/config/office';
import { addDays } from '@/lib/calendar';
import { leaveTypeName, suggestGrant } from '@/lib/leave';
import { leaveBalancesFor } from '@/lib/leave-balance-data';
import { loadAllLeaveTypes, loadLeaveGrants, loadLeaveRequests } from '@/lib/leave-data';
import { groupScope, orgOptions } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';
import { LeaveCancel } from '../inbox/Decisions';
import { LeaveBulk } from './LeaveBulk';
import { GrantForm, JoinedOnForm } from './GrantForm';

export default async function AdminLeavePage({ searchParams }: { searchParams: Promise<{ live?: string; e?: string; q?: string; g?: string; to?: string; v?: string; y?: string; ap?: string }> }) {
  const t = await getTranslations('admin.leave');
  const tl = await getTranslations('leave');
  const tc = await getTranslations('common');
  const f = await getFormatter();
  const sp = await searchParams;
  const meNow = await getMe();
  const admin = meNow?.role === 'admin';
  const top = !!meNow?.top; // 휴가 엑셀 일괄 입력은 직권 휴가처럼 최고관리자만 (2026-10-20) // 지점관리자는 보기만 (manager-rules.ts) — 받은 연차 입력 · 휴가 취소 · 다운로드는 관리자만
  const inScope = await scopeFilter();
  const practice = OFFICE.practiceMode && sp.live !== '1';
  const today = toKstDate(new Date());
  const [{ data: ppl }, groups, types, grants, requests] = await Promise.all([
    createAdminClient().from('profiles').select('id, name, employee_no, joined_on, created_at, role, group_id').eq('active', true).order('name'),
    loadOrgGroups(),
    loadAllLeaveTypes(), // 꺼 둔 종류로 쓴 휴가도 잔여에서 빠진다
    loadLeaveGrants(),
    loadLeaveRequests({ practice }),
  ]);
  // 기준일 (없거나 잘못되면 오늘)
  const asOf = sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) && !Number.isNaN(Date.parse(`${sp.to}T00:00:00Z`)) ? sp.to : today;
  const groupOptions = orgOptions(groups);
  const g = groupOptions.some((o) => o.id === sp.g) ? sp.g! : '';
  const scope = g ? groupScope(groups, g) : null;
  const q = (sp.q ?? '').trim().slice(0, 40);
  const shown = (ppl ?? []).filter((p) => p.employee_no !== OFFICE.ownerEmployeeNo && inScope(p.id as string) && (!scope || (p.group_id && scope.has(p.group_id as string))) && (!q || (p.name as string).toLowerCase().includes(q.toLowerCase())));
  const byRole = (['admin', 'employee'] as const).map((role) => ({ role, list: shown.filter((p) => (p.role === 'admin') === (role === 'admin')) })).filter((x) => x.list.length > 0);
  // 직원마다 원장을 따로 읽지 않고 한 번에 (검수 R21)
  const argsFor = (d: string) => (ppl ?? []).filter((p) => inScope(p.id)).map((p) => ({ employeeId: p.id as string, practice, grants: grants.filter((x) => x.employeeId === p.id), requests: requests.filter((r) => r.employeeId === p.id), types, asOf: d }));
  const balances = await leaveBalancesFor(argsFor(asOf), asOf, practice);
  const balOf = (id: string) => balances.get(id)!;
  const todayBalances = asOf === today ? balances : await leaveBalancesFor(argsFor(today), today, practice);
  // 직원을 눌러도 검색 · 거르기 · 기준일은 그대로 둔다
  const pick = (id: string) => {
    const u = new URLSearchParams({ e: id });
    for (const [k, v] of Object.entries({ q, g, to: asOf === today ? '' : asOf, live: sp.live === '1' ? '1' : '' })) if (v) u.set(k, v);
    return `?${u}#edit`;
  };
  // 일수는 소수 둘째 자리까지(2026-10-19 의뢰인: 15분 = 0.03125일도 폰 칸을 넘지 않게) — 비례 발생처럼 떨어지지 않는 값도 같게 — 10.9896이 폰 칸을 넘었다 (2026-10-17 디자인)
  const n = (v: number) => f.number(v, { maximumFractionDigits: 2 });
  const day = (d: string) => f.dateTime(new Date(`${d}T12:00:00+09:00`), { year: d.slice(0, 4) === today.slice(0, 4) ? undefined : 'numeric', month: 'short', day: 'numeric', weekday: 'short' });
  const name = new Map((ppl ?? []).map((p) => [p.id, p.name]));
  const leaveName = (code: string) => leaveTypeName(types, code, tl);
  // PC: 시프티처럼 「휴가 내역」(목록 · 월별)과 「휴가 발생」으로 나눈다 (2026-10-11 의뢰인 스샷 `스샷/휴가내역*.png` · `휴가발생.png`). 폰은 한 화면 그대로
  const view: 'list' | 'month' | 'accrual' = sp.v === 'accrual' && admin ? 'accrual' : sp.v === 'month' ? 'month' : 'list';
  const year = sp.y && /^\d{4}$/.test(sp.y) ? sp.y : today.slice(0, 4);
  const typeOf = new Map(types.map((x) => [x.code, x]));
  const inYear = requests.filter((r) => r.status === 'approved' && r.startDate.slice(0, 4) === year && name.has(r.employeeId)).sort((a, b) => (a.startDate > b.startDate ? -1 : 1));
  const years = [...new Set([today.slice(0, 4), year, ...requests.map((r) => r.startDate.slice(0, 4))])].sort().reverse();
  const viewHref = (v: string, y = year) => {
    const u = new URLSearchParams();
    for (const [k, val] of Object.entries({ v: v === 'list' ? '' : v, y: y === today.slice(0, 4) ? '' : y, live: sp.live === '1' ? '1' : '' })) if (val) u.set(k, val);
    const qs = u.toString();
    return `/admin/leave${qs ? `?${qs}` : ''}`;
  };
  // 직권 [고치기] — 그 직원의 휴가 화면에서 이 휴가의 고치기 양식이 열린 채로 간다 (2026-10-23 의뢰인)
  const editHref = (empId: string, leaveId: string) => `/admin/leave/emp/${empId}?edit=${leaveId}#leave-${leaveId}`;
  const viewBtn = (on: boolean) => `inline-flex h-8 items-center border px-3 text-sm first:rounded-l-button last:rounded-r-button ${on ? 'z-10 border-primary bg-primary-tint font-bold text-primary' : 'border-border bg-bg text-muted'}`;
  const approved = requests.filter((r) => r.status === 'approved' && r.endDate >= addDays(today, -31)).sort((a, b) => (a.startDate > b.startDate ? -1 : 1)); // 다가오는 · 최근 휴가가 위로 (2026-10-17 디자인)
  const approvedPage = pageOf(approved, sp.ap, 10); // 폰 목록은 10건씩 (2026-10-15)

  // 올해 한눈에 — PC 목록 위 · 폰 목록 위 둘 다 (2026-10-22 의뢰인: 「휴가내역도 시프티를 그냥 베꼈다」, 「모바일에 PC 디자인이 안 들어갔다」)
  const summaryEl = (() => {
            const ym = today.slice(0, 7);
            const deducted = inYear.reduce((a, r) => a + (typeOf.get(r.typeCode)?.deductsBalance ? r.days : 0), 0);
            const people = new Set(inYear.map((r) => r.employeeId)).size;
            const thisMonth = inYear.filter((r) => r.startDate.slice(0, 7) <= ym && r.endDate.slice(0, 7) >= ym).length;
            const waiting = requests.filter((r) => r.status === 'pending' && name.has(r.employeeId)).length;
            return (
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-3">
                {([['sumCount', String(inYear.length), 'text-text'], ['sumDays', n(deducted), 'text-primary'], ['sumPeople', String(people), 'text-text'], [year === today.slice(0, 4) ? 'sumMonth' : 'sumWaiting', String(year === today.slice(0, 4) ? thisMonth : waiting), 'text-text']] as const).map(([k, v, tone]) => (
                  <div key={k} className="flex flex-col gap-1 rounded-card border border-border bg-bg px-4 py-3 lg:px-5 lg:py-4">
                    <span className="text-sm font-semibold text-muted">{t(`pcSum.${k}`, { y: year })}</span>
                    <span className={`num text-2xl font-bold lg:text-3xl ${v === '0' ? 'text-faint' : tone}`}>
                      <CountUp value={v} />
                    </span>
                  </div>
                ))}
                {waiting > 0 && year === today.slice(0, 4) && (
                  <Link href="/admin/inbox" className="col-span-2 flex lg:col-span-4 items-center justify-between rounded-card bg-warn-tint px-5 py-3 text-sm font-semibold text-warn">
                    {t('pcSum.waitingLine', { n: waiting })}
                    <ChevronRight aria-hidden size={16} />
                  </Link>
                )}
              </div>
            );
  })();

  return (
    <PageShell wide flush>
      <h1 className="sr-only lg:hidden">{t('title')}</h1>
      {/* ── PC 머리: 제목 + 설명 / [휴가 유형] ── */}
      <div className="hidden items-start gap-4 lg:flex">
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-x-1 text-2xl font-bold">{t(view === 'accrual' ? 'pcAccrual' : 'pcHistory')}<HelpTip>{t(view === 'accrual' ? 'pcAccrualIntro' : 'pcHistoryIntro')}</HelpTip></h1>
        </div>
        {view !== 'accrual' && top && <LeaveBulk />}
        {view !== 'accrual' && admin && (
          <a href={`/api/admin/export/list?kind=leave&y=${sp.y && /^\d{4}$/.test(sp.y) ? sp.y : asOf.slice(0, 4)}${sp.live === '1' ? '&live=1' : ''}`} className="inline-flex h-8 items-center gap-1 rounded-button border border-border bg-bg px-3.5 text-sm font-semibold whitespace-nowrap text-text hover:bg-surface">
            <Download aria-hidden size={16} />
            {tc('download')}
          </a>
        )}
        {admin && (
          <Link href="/admin/leave/types" className="inline-flex h-8 items-center rounded-button border border-border bg-bg px-3.5 text-sm font-semibold whitespace-nowrap text-text hover:bg-surface">
            {t('toTypes')}
          </Link>
        )}
      </div>
      {view !== 'accrual' && (
        <div className="hidden flex-col gap-3 lg:flex">
          <div className="flex items-center gap-2">
            <form action="/admin/leave" className="flex items-center gap-2">
              {view === 'month' && <input type="hidden" name="v" value="month" />}
              {sp.live === '1' && <input type="hidden" name="live" value="1" />}
              <Select name="y" defaultValue={year} aria-label={t('yearOf', { y: year })} className="num h-8 rounded-button border border-border bg-bg px-2">
                {years.map((y) => (
                  <option key={y} value={y}>
                    {t('yearOf', { y })}
                  </option>
                ))}
              </Select>
              <button type="submit" className="inline-flex h-8 items-center rounded-button border border-border bg-bg px-3 text-sm text-muted">
                {t('show')}
              </button>
            </form>
            <div className="ml-auto flex">
              <Link href={viewHref('list')} aria-current={view === 'list' ? 'page' : undefined} className={viewBtn(view === 'list')}>
                {t('viewList')}
              </Link>
              <Link href={viewHref('month')} aria-current={view === 'month' ? 'page' : undefined} className={`-ml-px ${viewBtn(view === 'month')}`}>
                {t('viewMonth')}
              </Link>
            </div>
          </div>
          {summaryEl}
          {view === 'list' ? (
            <PcTable
              total
              labels={{ search: tc('colSearch'), empty: t('emptyYear'), total: t('listTotal') }}
              cols={[
                { key: 'who', label: t('colName') },
                { key: 'period', label: t('colPeriod') },
                { key: 'group', label: t('colGroup') },
                { key: 'type', label: t('colType') },
                { key: 'hours', label: t('colPaidHours'), align: 'right' },
                { key: 'deduct', label: t('colDeduct'), align: 'right' },
                { key: 'reason', label: t('colReason') },
                { key: 'act', label: '', search: false, sort: false, align: 'right' },
              ]}
              rows={inYear.map((r) => {
                const ty = typeOf.get(r.typeCode);
                const units = ty && ty.dayUnit > 0 ? r.days / ty.dayUnit : r.days;
                const period = `${r.startDate === r.endDate ? day(r.startDate) : `${day(r.startDate)} ~ ${day(r.endDate)}`}${r.startTime ? ` ${r.startTime} - ${r.endTime}` : ''}`;
                return {
                  id: r.id,
                  cells: {
                    who: { text: name.get(r.employeeId) ?? '', node: <Link href={`/admin/leave/req/${r.id}`} className="font-bold hover:text-primary">{name.get(r.employeeId)}</Link> },
                    period: { text: `${r.startDate} ${period}`, node: <span className="num">{period}</span> },
                    group: { text: ty?.groupName ?? '' },
                    type: { text: leaveName(r.typeCode) },
                    hours: { text: ty?.isPaid ? t('hoursValue', { h: n((ty.hours ?? 8) * units) }) : t('hoursValue', { h: 0 }) },
                    deduct: { text: t('daysValue', { d: n(ty?.deductsBalance ? r.days : 0) }) },
                    reason: { text: r.reason ?? '' },
                    act: { text: '', node: admin ? <span className="inline-flex items-center justify-end gap-2">{top && <Link href={editHref(r.employeeId, r.id)} className="inline-flex min-h-9 items-center rounded-button border border-border bg-bg px-3 text-sm font-bold text-primary hover:bg-primary-tint">{tl('directEditOpen')}</Link>}<LeaveCancel id={r.id} name={name.get(r.employeeId) ?? ''} compact /></span> : null },
                  },
                };
              })}
            />
          ) : (
            <div className="overflow-x-auto rounded-card border border-border bg-bg shadow-card">
              <table className="num w-full border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    <th scope="col" className="w-48 border-b border-border px-4 py-3 text-left text-xs font-semibold text-muted">{t('colName')}</th>
                    {[...Array(12)].map((_, i) => (
                      <th key={i} scope="col" className={`border-b border-border px-1 py-3 text-center text-xs font-semibold ${year === today.slice(0, 4) && i + 1 === Number(today.slice(5, 7)) ? 'text-primary' : 'text-muted'}`}>{t('monthOf', { m: i + 1 })}</th>
                    ))}
                    <th scope="col" className="border-b border-border px-4 py-3 text-right text-xs font-semibold text-muted">{t('totalCount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((p) => {
                    const mine = inYear.filter((r) => r.employeeId === p.id);
                    return (
                      <tr key={p.id} className="group">
                        <th scope="row" className="border-b border-border px-4 py-2 text-left font-normal group-hover:bg-surface">
                          <span className="flex items-center gap-2.5">
                            <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-chip bg-primary-tint text-xs font-bold text-primary">{p.name.slice(0, 1)}</span>
                            <span className="truncate font-bold">{p.name}</span>
                          </span>
                        </th>
                        {[...Array(12)].map((_, i) => {
                          const list = mine.filter((r) => Number(r.startDate.slice(5, 7)) === i + 1);
                          const c = list.length;
                          return (
                            <td key={i} className="border-b border-border px-1 py-2 text-center group-hover:bg-surface">
                              {c > 0 && (
                                <span title={list.map((r) => `${day(r.startDate)} ${leaveName(r.typeCode)}`).join('\n')} className={`fx-pop inline-flex h-7 min-w-8 items-center justify-center rounded-button px-1.5 font-bold ${c >= 3 ? 'bg-primary text-on-primary' : c === 2 ? 'bg-primary/40 text-primary' : 'bg-primary-tint text-primary'}`}>
                                  {c}
                                </span>
                              )}
                            </td>
                          );
                        })}
                        <td className={`border-b border-border px-4 py-2 text-right font-bold group-hover:bg-surface ${mine.length ? '' : 'text-faint'}`}>{mine.length || '–'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      <div className={view === 'accrual' ? 'contents' : 'contents lg:hidden'}>
      <ListBar
        key={`${q}|${g}|${asOf}`}
        single
        q={q}
        from=""
        to={asOf}
        group={g}
        groups={groupOptions}
        keep={{ live: sp.live === '1' ? '1' : undefined }}
        tabs={[
          { href: '/punch/leave', label: t('mine'), on: false },
          { href: '/admin/leave', label: t('all'), on: true },
        ]}
        gear={admin ? { href: '/admin/leave/types', label: t('toTypes') } : undefined}
        labels={{ menu: tc('menu'), search: t('search'), filter: t('filter'), period: t('asOf'), from: '', to: t('asOf'), apply: t('apply'), groupAll: t('groupAll') }}
      />
      </div>
      {/* PC: 직원 한 명 = 표 한 줄 (2026-10-06 의뢰인: 직원이 20명이면 카드 20장이 쌓인다). 「입력·수정」을 누른 직원의 입력 칸만 표 아래에 열린다 · 폰: 직원별 카드 */}
      <Card className={`hidden overflow-x-auto p-0 ${view === 'accrual' ? 'lg:block' : ''}`}>
        {/* 칸 설명 (2026-10-25 의뢰인: 「대기는 뭐야? 산정 기간은?」) */}
        <details className="m-3 rounded-card bg-surface px-4 py-2 text-sm">
          <summary className="min-h-9 cursor-pointer py-1.5 font-bold text-muted">{t('legendTitle')}</summary>
          <ul className="flex flex-col gap-1.5 pt-1 pb-2 text-muted">
            {(['span', 'granted', 'used', 'pending', 'remaining'] as const).map((k) => (
              <li key={k}>{t(`legend.${k}`)}</li>
            ))}
          </ul>
        </details>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium whitespace-nowrap text-faint">{t('colName')}</th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium whitespace-nowrap text-faint">{t('colHired')}</th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium whitespace-nowrap text-faint">{t('colSpan')}</th>
              {(['granted', 'used', 'pending', 'remaining'] as const).map((k) => (
                <th key={k} scope="col" className="px-4 py-3 text-left text-xs font-medium whitespace-nowrap text-faint text-right">{t(k)}</th>
              ))}
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium whitespace-nowrap text-faint" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {shown.map((p) => {
              const bal = balOf(p.id);
              const on = sp.e === p.id;
              return (
                <tr key={p.id} className={on ? 'bg-primary-tint' : ''}>
                  <td className="px-4 py-3">
                    <span className="font-semibold">{p.name}</span> <span className="num text-xs text-faint">{p.employee_no}</span>
                  </td>
                  <td className="px-4 py-3 num text-muted">{(p.joined_on as string | null) ?? '–'}</td>
                  <td className="px-4 py-3 num text-muted">{bal.grant?.periodLabel ?? '–'}</td>
                  {bal.grant || bal.ledger ? (
                    ([bal.granted, bal.used, bal.pending, bal.remaining] as const).map((v, i) => (
                      <td key={i} className={`px-4 py-3 num text-right ${i === 3 ? 'font-bold text-primary' : i === 2 && v === 0 ? 'text-faint' : ''}`}>
                        {i === 2 && v === 0 ? '–' : n(v)}
                        {/* 받은 연차 중 쓴 만큼 (2026-10-22 의뢰인: 그래프가 채워지는 모습) */}
                        {i === 3 && (
                          <span aria-hidden className="mt-1 ml-auto block h-1.5 w-20 overflow-hidden rounded-chip bg-surface">
                            <span className="fx-grow-x block h-full rounded-chip bg-primary" style={{ width: `${bal.granted > 0 ? Math.min(100, (bal.used / bal.granted) * 100) : 0}%` }} />
                          </span>
                        )}
                      </td>
                    ))
                  ) : (
                    <td colSpan={4} className="px-4 py-3 text-right">
                      <Chip tone="warn">{t('noGrant')}</Chip>
                    </td>
                  )}
                  <td className="px-4 py-3 text-right">
                    <Link href={pick(p.id)} scroll={false} className="inline-flex min-h-9 items-center rounded-button bg-primary-tint px-3 text-sm font-bold whitespace-nowrap text-primary">
                      {t('manage')}
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {/* 폰: 직원 한 명 = 한 줄 (받은 · 사용 · 잔여). 누르면 그 직원의 입력 칸이 아래에 열린다 (2026-10-10 의뢰인: 시프티의 휴가 「전체」처럼) */}
      {view !== 'accrual' && <div className="mt-3 lg:hidden">{summaryEl}</div>}
      {shown.length === 0 && <div className="mt-3 lg:mt-0"><Empty title={t('emptyPeople')} /></div>}
      <div className="-mx-4 flex flex-col lg:hidden">
        {byRole.map(({ role, list }, gi) => (
          <section key={role}>
            <h2 className="num flex items-center gap-2 border-b border-border bg-surface px-5 py-3 text-sm font-bold">
              <span className="flex-1">
                {t(role === 'admin' ? 'roleAdmin' : 'roleEmployee')} <span className="font-medium text-muted">{list.length}</span>
              </span>
              {gi === 0 &&
                (['granted', 'used', 'remaining'] as const).map((k) => (
                  <span key={k} className="w-12 text-right font-medium text-muted">{t(k)}</span>
                ))}
              <span className="w-5" />
            </h2>
            <ul className="divide-y divide-border border-b border-border bg-bg">
              {list.map((p) => {
                const bal = balOf(p.id);
                const on = sp.e === p.id;
                return (
                  <li key={p.id}>
                    <Link href={pick(p.id)} scroll={false} aria-current={on ? 'true' : undefined} className={`num flex min-h-14 items-center gap-2 px-5 py-2 ${on ? 'bg-primary-tint' : ''}`}>
                      <span className="min-w-0 flex-1 truncate text-base font-bold">{p.name}</span>
                      {bal.grant || bal.ledger ? (
                        ([bal.granted, bal.used, bal.remaining] as const).map((v, i) => (
                          <span key={i} className={`w-12 text-right ${i === 2 ? (v < 0 ? 'text-danger' : 'text-primary') : ''}`}>{n(v)}</span>
                        ))
                      ) : (
                        <Chip tone="warn">{t('noGrant')}</Chip>
                      )}
                      <ChevronRight aria-hidden size={20} strokeWidth={1.75} className="w-5 shrink-0 text-faint" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {practice && <p className="mt-3 rounded-card bg-primary-tint lg:mt-0 p-3 text-sm text-primary">{t('practiceBanner')}</p>}
      <section id="edit" className="mt-3 flex scroll-mt-32 flex-col gap-3 lg:mt-0">
        {(ppl ?? []).filter((p) => inScope(p.id)).map((p) => {
          const bal = todayBalances.get(p.id)!;
          const hiredOn = p.joined_on as string | null;
          const ref = hiredOn ? suggestGrant(hiredOn, today) : null;
          return (
            <Card key={p.id} className={`flex flex-col gap-3 ${sp.e === p.id ? '' : 'hidden'}`}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold">
                  {p.name} <span className="num text-xs font-normal text-faint">{p.employee_no}</span>
                </span>
                <span className="num text-xs text-muted">{hiredOn ? t('hired', { date: hiredOn }) : t('noHireDate')}</span>
              </div>
              <Link href={`/admin/leave/emp/${p.id}${asOf === today ? '' : `?to=${asOf}`}`} className="inline-flex min-h-11 items-center self-start text-sm font-bold text-primary">
                {t('toAccrual')} ›
              </Link>
              {bal.grant || bal.ledger ? (
                <dl className="num grid grid-cols-4 gap-2 text-center">
                  {(
                    [
                      ['granted', bal.granted],
                      ['used', bal.used],
                      ['pending', bal.pending],
                      ['remaining', bal.remaining],
                    ] as const
                  ).map(([k, v]) => (
                    <div key={k} className="rounded-button bg-surface p-2">
                      <dt className="text-xs text-muted">{t(k)}</dt>
                      <dd className={`font-bold ${k === 'remaining' ? 'text-primary' : ''}`}>{n(v)}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <Chip tone="warn">{t('noGrant')}</Chip>
              )}
              {admin && <JoinedOnForm employeeId={p.id} joinedOn={hiredOn} today={today} />}
              {ref && (
                <p className="rounded-button bg-surface p-2 text-xs text-muted">
                  <span className="font-semibold">{t('reference', { n: ref.days })}</span> ({ref.periodLabel}) — {ref.note}
                </p>
              )}
              {admin && (
              <GrantForm
                employeeId={p.id}
                current={
                  bal.grant
                    ? { periodLabel: bal.grant.periodLabel, effectiveFrom: bal.grant.effectiveFrom, basis: bal.grant.basis, grantedDays: String(bal.grant.grantedDays), carriedDays: String(bal.grant.carriedDays) }
                    : null
                }
                suggested={ref ? { days: ref.days, periodLabel: ref.periodLabel, effectiveFrom: ref.effectiveFrom } : null}
              />
              )}
            </Card>
          );
        })}
      </section>

      <section id="approved" className="mt-3 flex scroll-mt-16 flex-col gap-2 lg:hidden">
        <div className="flex flex-wrap items-center gap-x-1">
          <h2 className="font-semibold">{t('approvedTitle')}</h2>
          <Help>{t('approvedHint')}</Help>
        </div>
        {approved.length === 0 && <p className="text-sm text-faint">{t('approvedNone')}</p>}
        {/* 한 건 = 두 줄(이름 · 취소 / 날짜 · 종류) — 건마다 카드와 큰 버튼이라 10건이 화면 두 장이었다 (2026-10-17 디자인) */}
        {approvedPage.items.length > 0 && (
          <Card className="divide-y divide-border px-4 py-0">
            {approvedPage.items.map((r) => (
              <div key={r.id} className="flex flex-col gap-1 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/admin/leave/req/${r.id}`} className="font-semibold">{name.get(r.employeeId)} ›</Link>
                  {admin && (
                    <span className="flex items-center gap-2">
                      {top && <Link href={editHref(r.employeeId, r.id)} className="inline-flex min-h-9 items-center rounded-button border border-border bg-bg px-3 text-sm font-bold text-primary">{tl('directEditOpen')}</Link>}
                      <LeaveCancel id={r.id} name={name.get(r.employeeId) ?? ''} compact />
                    </span>
                  )}
                </div>
                <p className="num text-sm text-muted">
                  {r.startDate === r.endDate ? day(r.startDate) : `${day(r.startDate)} ~ ${day(r.endDate)}`} · {leaveName(r.typeCode)} · {tl('days', { n: n(r.days) })}{r.startTime && ` · ${r.startTime}-${r.endTime}`}
                </p>
              </div>
            ))}
          </Card>
        )}
        <Pager page={approvedPage.page} pages={approvedPage.pages} param="ap" params={sp} anchor="approved" label={tc('pages')} />
      </section>
    </PageShell>
  );
}
