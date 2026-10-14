// 관리자 「연차 관리」 (②-2 게이트 5). 직원별 잔여 + 부여 입력 + 승인된 휴가 취소.
// 위 줄(2026-10-11 의뢰인: 시프티의 휴가 「전체」처럼): 이름 검색 · 부서로 거르기 · 기준일 · [내 휴가]. 폰 목록은 권한(관리자 · 직원)별 묶음.
// 기준일을 바꾸면 그날 적용되는 부여 기준의 받은 · 사용 · 잔여를 본다. 입력 칸의 계산값은 언제나 오늘 기준이다.
// ★ 4-7: 발생일수는 관리자가 직접 입력. 참고 계산값은 옆에 "참고용"으로만 보여 주고 입력 칸에 미리 채우지 않는다.
import { getMe } from '@/lib/auth';
import { scopeFilter } from '@/lib/scope';
import { ChevronRight, Download } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Help, HelpTip } from '@/components/Help';
import { ListBar } from '@/components/ListBar';
import { PcTable } from '@/components/PcTable';
import { Pager, pageOf } from '@/components/Pager';
import { Card, Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { addDays } from '@/lib/calendar';
import { leaveTypeName, calcLeaveBalance, suggestGrant } from '@/lib/leave';
import { loadAllLeaveTypes, loadLeaveGrants, loadLeaveRequests } from '@/lib/leave-data';
import { buildOrgTree, groupScope } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';
import { LeaveCancel } from '../inbox/Decisions';
import { GrantForm, JoinedOnForm } from './GrantForm';

export default async function AdminLeavePage({ searchParams }: { searchParams: Promise<{ live?: string; e?: string; q?: string; g?: string; to?: string; v?: string; y?: string; ap?: string }> }) {
  const t = await getTranslations('admin.leave');
  const tl = await getTranslations('leave');
  const tc = await getTranslations('common');
  const f = await getFormatter();
  const sp = await searchParams;
  const admin = (await getMe())?.role === 'admin'; // 지점관리자는 보기만 (manager-rules.ts) — 받은 연차 입력 · 휴가 취소 · 다운로드는 관리자만
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
  const groupOptions = buildOrgTree(groups).flatMap((d) => [{ id: d.id, label: d.name }, ...d.teams.map((x) => ({ id: x.id, label: `${d.name} › ${x.name}` }))]);
  const g = groupOptions.some((o) => o.id === sp.g) ? sp.g! : '';
  const scope = g ? groupScope(groups, g) : null;
  const q = (sp.q ?? '').trim().slice(0, 40);
  const shown = (ppl ?? []).filter((p) => inScope(p.id as string) && (!scope || (p.group_id && scope.has(p.group_id as string))) && (!q || (p.name as string).toLowerCase().includes(q.toLowerCase())));
  const byRole = (['admin', 'employee'] as const).map((role) => ({ role, list: shown.filter((p) => (p.role === 'admin') === (role === 'admin')) })).filter((x) => x.list.length > 0);
  const balOf = (id: string) => calcLeaveBalance({ grants: grants.filter((x) => x.employeeId === id), requests: requests.filter((r) => r.employeeId === id), types, asOf });
  // 직원을 눌러도 검색 · 거르기 · 기준일은 그대로 둔다
  const pick = (id: string) => {
    const u = new URLSearchParams({ e: id });
    for (const [k, v] of Object.entries({ q, g, to: asOf === today ? '' : asOf, live: sp.live === '1' ? '1' : '' })) if (v) u.set(k, v);
    return `?${u}#edit`;
  };
  const n = (v: number) => f.number(v, { maximumFractionDigits: 4 });
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
  const viewBtn = (on: boolean) => `inline-flex h-8 items-center border px-3 text-sm first:rounded-l-button last:rounded-r-button ${on ? 'z-10 border-primary bg-primary-tint font-bold text-primary' : 'border-border bg-bg text-muted'}`;
  const approved = requests.filter((r) => r.status === 'approved' && r.endDate >= addDays(today, -31)).sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
  const approvedPage = pageOf(approved, sp.ap, 10); // 폰 목록은 10건씩 (2026-10-15)

  return (
    <PageShell wide flush>
      <h1 className="sr-only lg:hidden">{t('title')}</h1>
      {/* ── PC 머리: 제목 + 설명 / [휴가 유형] ── */}
      <div className="hidden items-start gap-4 lg:flex">
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-x-1 text-2xl font-bold">{t(view === 'accrual' ? 'pcAccrual' : 'pcHistory')}<HelpTip>{t(view === 'accrual' ? 'pcAccrualIntro' : 'pcHistoryIntro')}</HelpTip></h1>
        </div>
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
              <select name="y" defaultValue={year} aria-label={t('yearOf', { y: year })} className="num h-8 rounded-button border border-border bg-bg px-2">
                {years.map((y) => (
                  <option key={y} value={y}>
                    {t('yearOf', { y })}
                  </option>
                ))}
              </select>
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
                    act: { text: '', node: admin ? <span className="inline-flex flex-col items-end"><LeaveCancel id={r.id} name={name.get(r.employeeId) ?? ''} /></span> : null },
                  },
                };
              })}
            />
          ) : (
            <div className="overflow-x-auto border-t border-l border-border bg-bg">
              <table className="num w-full border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    <th scope="col" className="w-40 border-r border-b border-border px-3 py-2 text-left">{t('colName')}</th>
                    {[...Array(12)].map((_, i) => (
                      <th key={i} scope="col" className="border-r border-b border-border px-2 py-2 text-center">{t('monthOf', { m: i + 1 })}</th>
                    ))}
                    <th scope="col" className="border-r border-b border-border px-3 py-2 text-center">{t('totalCount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((p) => {
                    const mine = inYear.filter((r) => r.employeeId === p.id);
                    return (
                      <tr key={p.id}>
                        <th scope="row" className="border-r border-b border-border px-3 py-2 text-left font-bold">{p.name}</th>
                        {[...Array(12)].map((_, i) => {
                          const c = mine.filter((r) => Number(r.startDate.slice(5, 7)) === i + 1).length;
                          return (
                            <td key={i} className="border-r border-b border-border px-2 py-2 text-center">
                              {c > 0 ? <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-button bg-primary-tint px-1 font-bold text-primary">{c}</span> : <span className="text-border">+</span>}
                            </td>
                          );
                        })}
                        <td className="border-r border-b border-border px-3 py-2 text-center font-bold">{mine.length}</td>
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
                  {bal.grant ? (
                    ([bal.granted, bal.used, bal.pending, bal.remaining] as const).map((v, i) => (
                      <td key={i} className={`px-4 py-3 num text-right ${i === 3 ? 'font-bold text-primary' : ''}`}>{n(v)}</td>
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
      {shown.length === 0 && <p className="mt-3 rounded-card bg-bg p-5 text-sm text-faint">{t('emptyPeople')}</p>}
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
                      {bal.grant ? (
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
        {(ppl ?? []).map((p) => {
          const mine = grants.filter((g) => g.employeeId === p.id);
          const bal = calcLeaveBalance({ grants: mine, requests: requests.filter((r) => r.employeeId === p.id), types, asOf: today });
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
              {bal.grant ? (
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
        {approvedPage.items.map((r) => (
          <Card key={r.id} className="flex flex-col gap-2 lg:hidden">
            <div className="flex items-baseline justify-between gap-2">
              <Link href={`/admin/leave/req/${r.id}`} className="font-semibold text-primary">{name.get(r.employeeId)} ›</Link>
              <span className="num text-sm text-muted">
                {leaveName(r.typeCode)} · {tl('days', { n: n(r.days) })}{r.startTime && ` · ${r.startTime}-${r.endTime}`}
              </span>
            </div>
            <p className="num text-sm">{r.startDate === r.endDate ? day(r.startDate) : `${day(r.startDate)} ~ ${day(r.endDate)}`}</p>
            {admin && <LeaveCancel id={r.id} name={name.get(r.employeeId) ?? ''} />}
          </Card>
        ))}
        <Pager page={approvedPage.page} pages={approvedPage.pages} param="ap" params={sp} anchor="approved" label={tc('pages')} />
      </section>
    </PageShell>
  );
}
