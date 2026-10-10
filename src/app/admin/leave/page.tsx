// 관리자 「연차 관리」 (②-2 게이트 5). 직원별 잔여 + 부여 입력 + 승인된 휴가 취소.
// 위 줄(2026-10-11 의뢰인: 시프티의 휴가 「전체」처럼): 이름 검색 · 부서로 거르기 · 기준일 · [내 휴가]. 폰 목록은 권한(관리자 · 직원)별 묶음.
// 기준일을 바꾸면 그날 적용되는 부여 기준의 받은 · 사용 · 잔여를 본다. 입력 칸의 계산값은 언제나 오늘 기준이다.
// ★ 4-7: 발생일수는 관리자가 직접 입력. 참고 계산값은 옆에 "참고용"으로만 보여 주고 입력 칸에 미리 채우지 않는다.
import { ChevronRight } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Help } from '@/components/Help';
import { ListBar } from '@/components/ListBar';
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

export default async function AdminLeavePage({ searchParams }: { searchParams: Promise<{ live?: string; e?: string; q?: string; g?: string; to?: string }> }) {
  const t = await getTranslations('admin.leave');
  const tl = await getTranslations('leave');
  const tc = await getTranslations('common');
  const f = await getFormatter();
  const sp = await searchParams;
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
  const shown = (ppl ?? []).filter((p) => (!scope || (p.group_id && scope.has(p.group_id as string))) && (!q || (p.name as string).toLowerCase().includes(q.toLowerCase())));
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
  const approved = requests.filter((r) => r.status === 'approved' && r.endDate >= addDays(today, -31)).sort((a, b) => (a.startDate < b.startDate ? -1 : 1));

  return (
    <PageShell wide flush>
      <h1 className="sr-only">{t('title')}</h1>
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
        gear={{ href: '/admin/leave/types', label: t('toTypes') }}
        labels={{ menu: tc('menu'), search: t('search'), filter: t('filter'), period: t('asOf'), from: '', to: t('asOf'), apply: t('apply'), groupAll: t('groupAll') }}
      />
      <div className="hidden flex-wrap items-center gap-x-1 px-1 lg:flex">
        <span className="text-sm text-muted">{t('title')}</span>
        <Help>{t('intro')}</Help>
        <Link href="/admin/leave/types" className="ml-auto inline-flex min-h-11 items-center text-sm font-medium text-primary">
          {t('toTypes')} ›
        </Link>
      </div>

      {/* PC: 직원 한 명 = 표 한 줄 (2026-10-06 의뢰인: 직원이 20명이면 카드 20장이 쌓인다). 「입력·수정」을 누른 직원의 입력 칸만 표 아래에 열린다 · 폰: 직원별 카드 */}
      <Card className="hidden overflow-x-auto p-0 lg:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium whitespace-nowrap text-faint">{t('colName')}</th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium whitespace-nowrap text-faint">{t('colHired')}</th>
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
              <JoinedOnForm employeeId={p.id} joinedOn={hiredOn} today={today} />
              {ref && (
                <p className="rounded-button bg-surface p-2 text-xs text-muted">
                  <span className="font-semibold">{t('reference', { n: ref.days })}</span> ({ref.periodLabel}) — {ref.note}
                </p>
              )}
              <GrantForm
                employeeId={p.id}
                current={
                  bal.grant
                    ? { periodLabel: bal.grant.periodLabel, effectiveFrom: bal.grant.effectiveFrom, basis: bal.grant.basis, grantedDays: String(bal.grant.grantedDays), carriedDays: String(bal.grant.carriedDays) }
                    : null
                }
                suggested={ref ? { days: ref.days, periodLabel: ref.periodLabel, effectiveFrom: ref.effectiveFrom } : null}
              />
            </Card>
          );
        })}
      </section>

      <section className="mt-3 flex flex-col gap-2 lg:mt-0">
        <div className="flex flex-wrap items-center gap-x-1">
          <h2 className="font-semibold">{t('approvedTitle')}</h2>
          <Help>{t('approvedHint')}</Help>
        </div>
        {approved.length === 0 && <p className="text-sm text-faint">{t('approvedNone')}</p>}
        {approved.length > 0 && (
          <Card className="hidden overflow-x-auto p-0 lg:block">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {approved.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3 font-semibold whitespace-nowrap"><Link href={`/admin/leave/req/${r.id}`}>{name.get(r.employeeId)}</Link></td>
                    <td className="px-4 py-3 num whitespace-nowrap">{leaveName(r.typeCode)} · {tl('days', { n: n(r.days) })}{r.startTime && ` · ${r.startTime}-${r.endTime}`}</td>
                    <td className="px-4 py-3 num text-muted">{r.startDate === r.endDate ? day(r.startDate) : `${day(r.startDate)} ~ ${day(r.endDate)}`}</td>
                    <td className="px-4 py-3">
                      <span className="flex flex-col items-end">
                        <LeaveCancel id={r.id} name={name.get(r.employeeId) ?? ''} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
        {approved.map((r) => (
          <Card key={r.id} className="flex flex-col gap-2 lg:hidden">
            <div className="flex items-baseline justify-between gap-2">
              <Link href={`/admin/leave/req/${r.id}`} className="font-semibold text-primary">{name.get(r.employeeId)} ›</Link>
              <span className="num text-sm text-muted">
                {leaveName(r.typeCode)} · {tl('days', { n: n(r.days) })}{r.startTime && ` · ${r.startTime}-${r.endTime}`}
              </span>
            </div>
            <p className="num text-sm">{r.startDate === r.endDate ? day(r.startDate) : `${day(r.startDate)} ~ ${day(r.endDate)}`}</p>
            <LeaveCancel id={r.id} name={name.get(r.employeeId) ?? ''} />
          </Card>
        ))}
      </section>
    </PageShell>
  );
}
