// 관리자 「연차 관리」 (②-2 게이트 5). 직원별 잔여 + 부여 입력 + 승인된 휴가 취소.
// ★ 4-7: 발생일수는 관리자가 직접 입력. 참고 계산값은 옆에 "참고용"으로만 보여 주고 입력 칸에 미리 채우지 않는다.
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Help } from '@/components/Help';
import { Card, Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { addDays } from '@/lib/calendar';
import { calcLeaveBalance, suggestGrant } from '@/lib/leave';
import { loadLeaveGrants, loadLeaveRequests, loadLeaveTypes } from '@/lib/leave-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';
import { LeaveCancel } from '../inbox/Decisions';
import { GrantForm, JoinedOnForm } from './GrantForm';

export default async function AdminLeavePage({ searchParams }: { searchParams: Promise<{ live?: string; e?: string }> }) {
  const t = await getTranslations('admin.leave');
  const tl = await getTranslations('leave');
  const f = await getFormatter();
  const sp = await searchParams;
  const practice = OFFICE.practiceMode && sp.live !== '1';
  const today = toKstDate(new Date());
  const [{ data: ppl }, types, grants, requests] = await Promise.all([
    createAdminClient().from('profiles').select('id, name, employee_no, joined_on, created_at').eq('active', true).order('name'),
    loadLeaveTypes(),
    loadLeaveGrants(),
    loadLeaveRequests({ practice }),
  ]);
  const n = (v: number) => f.number(v, { maximumFractionDigits: 2 });
  const day = (d: string) => f.dateTime(new Date(`${d}T12:00:00+09:00`), { year: d.slice(0, 4) === today.slice(0, 4) ? undefined : 'numeric', month: 'short', day: 'numeric', weekday: 'short' });
  const name = new Map((ppl ?? []).map((p) => [p.id, p.name]));
  const leaveName = (code: string) => (tl.has(`type.${code}`) ? tl(`type.${code}`) : code);
  const approved = requests.filter((r) => r.status === 'approved' && r.endDate >= addDays(today, -31)).sort((a, b) => (a.startDate < b.startDate ? -1 : 1));

  return (
    <PageShell wide>
      <div className="flex flex-wrap items-center gap-x-1">
        <h1 className="text-2xl font-semibold text-primary-deep">{t('title')}</h1>
        <Help>{t('intro')}</Help>
      </div>
      {practice && <p className="rounded-card bg-primary-tint p-3 text-sm text-primary">{t('practiceBanner')}</p>}

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
            {(ppl ?? []).map((p) => {
              const bal = calcLeaveBalance({ grants: grants.filter((g) => g.employeeId === p.id), requests: requests.filter((r) => r.employeeId === p.id), types, asOf: today });
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
                    <Link href={`?e=${p.id}${sp.live === '1' ? '&live=1' : ''}#edit`} scroll={false} className="inline-flex min-h-9 items-center rounded-button bg-primary-tint px-3 text-sm font-bold whitespace-nowrap text-primary">
                      {t('manage')}
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <section id="edit" className="flex scroll-mt-16 flex-col gap-3">
        {(ppl ?? []).map((p) => {
          const mine = grants.filter((g) => g.employeeId === p.id);
          const bal = calcLeaveBalance({ grants: mine, requests: requests.filter((r) => r.employeeId === p.id), types, asOf: today });
          const hiredOn = p.joined_on as string | null;
          const ref = hiredOn ? suggestGrant(hiredOn, today) : null;
          return (
            <Card key={p.id} className={`flex flex-col gap-3 ${sp.e === p.id ? '' : 'lg:hidden'}`}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold">
                  {p.name} <span className="num text-xs font-normal text-faint">{p.employee_no}</span>
                </span>
                <span className="num text-xs text-muted">{hiredOn ? t('hired', { date: hiredOn }) : t('noHireDate')}</span>
              </div>
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

      <section className="flex flex-col gap-2">
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
                    <td className="px-4 py-3 font-semibold whitespace-nowrap">{name.get(r.employeeId)}</td>
                    <td className="px-4 py-3 num whitespace-nowrap">{leaveName(r.typeCode)} · {tl('days', { n: n(r.days) })}</td>
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
              <span className="font-semibold">{name.get(r.employeeId)}</span>
              <span className="num text-sm text-muted">
                {leaveName(r.typeCode)} · {tl('days', { n: n(r.days) })}
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
