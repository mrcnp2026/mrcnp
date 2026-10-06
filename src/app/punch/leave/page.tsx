// 직원 「연차」 탭 (②-2 게이트 5, 시프티 대조 우선 반영 ①). 잔여 · 신청 · 내 신청.
// 대기 일수는 잔여에서 빼지 않고 따로 보여 준다 (7-3 요점 5). 사유는 선택 (4-7).
import { CalendarDays } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Help } from '@/components/Help';
import { Card, CardTitle, Chip, PageShell } from '@/components/ui';
import { getMe } from '@/lib/auth';
import { calcLeaveBalance } from '@/lib/leave';
import { loadLeaveGrants, loadLeaveRequests, loadLeaveTypes } from '@/lib/leave-data';
import { toKstDate } from '@/lib/time';
import { loadWorkRequests } from '@/lib/work-data';
import { CancelLeave, LeaveForm } from './LeaveForm';
import { CancelWork, WorkForm } from './WorkForm';

export default async function LeavePage({ searchParams }: { searchParams: Promise<{ workDate?: string }> }) {
  const me = await getMe();
  if (!me) redirect('/login');
  const t = await getTranslations('leave');
  const tw = await getTranslations('work');
  const f = await getFormatter();
  const sp = await searchParams;
  const today = toKstDate(new Date());
  const [types, grants, requests, works] = await Promise.all([loadLeaveTypes(), loadLeaveGrants(me.id), loadLeaveRequests({ employeeId: me.id }), loadWorkRequests({ employeeId: me.id })]);
  const bal = calcLeaveBalance({ grants, requests, types, asOf: today });
  const nameOf = (code: string) => (t.has(`type.${code}`) ? t(`type.${code}`) : (types.find((x) => x.code === code)?.name ?? code));
  // 올해가 아니면 연도도 (지난해·먼 미래 신청이 올해로 읽히지 않게)
  const day = (d: string) => f.dateTime(new Date(`${d}T12:00:00+09:00`), { year: d.slice(0, 4) === today.slice(0, 4) ? undefined : 'numeric', month: 'short', day: 'numeric', weekday: 'short' });
  const n = (v: number) => f.number(v, { maximumFractionDigits: 2 });

  return (
    <PageShell wide>
      <h1 className="text-2xl font-semibold text-primary-deep">{t('title')}</h1>

      {/* PC: 왼쪽 = 휴가, 오른쪽 = 외근·출장·재택 (2026-10-06 의뢰인) · 폰: 한 칸 */}
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4">
      <div className="flex flex-col gap-3">

      <Card className="flex flex-col gap-3 p-6">
        <CardTitle icon={CalendarDays} aside={bal.grant && <span className="text-sm text-faint">{bal.grant.periodLabel}</span>}>
          {t('balanceTitle')}
        </CardTitle>
        {bal.grant ? (
          <>
            <p className="num text-3xl font-extrabold tracking-tight">{t('days', { n: n(bal.remaining) })}</p>
            <dl className="num grid grid-cols-3 gap-2 text-center">
              {(
                [
                  ['granted', bal.granted],
                  ['used', bal.used],
                  ['pending', bal.pending],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="rounded-button bg-surface p-2">
                  <dt className="text-xs text-muted">{t(k)}</dt>
                  <dd className={`text-lg font-bold ${k === 'pending' && v > 0 ? 'text-warn' : ''}`}>{n(v)}</dd>
                </div>
              ))}
            </dl>
            {bal.pending > 0 && <p className="text-sm text-muted">{t('pendingHint')}</p>}
          </>
        ) : (
          <p className="text-sm text-muted">{t('noGrant')}</p>
        )}
      </Card>

      <LeaveForm today={today} types={types.map((x) => ({ code: x.code, name: nameOf(x.code), unit: x.dayUnit, deducts: x.deductsBalance }))} />

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">{t('mine')}</h2>
        {requests.length === 0 && <p className="text-sm text-faint">{t('none')}</p>}
        {requests.map((r) => (
          <Card key={r.id} className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">
                {nameOf(r.typeCode)} · <span className="num">{t('days', { n: n(r.days) })}</span>
              </span>
              <Chip tone={r.status === 'approved' ? 'ok' : r.status === 'pending' ? 'warn' : 'neutral'}>{t(`status.${r.status}`)}</Chip>
            </div>
            <p className="num text-sm">{r.startDate === r.endDate ? day(r.startDate) : `${day(r.startDate)} ~ ${day(r.endDate)}`}</p>
            {r.reason && <p className="text-sm text-muted">{r.reason}</p>}
            {r.status === 'pending' && <CancelLeave id={r.id} />}
          </Card>
        ))}
      </section>

      </div>

      {/* 외근·출장·재택 (②-3 7-11) — 연차와 같은 화면 */}
      <section id="work" className="flex scroll-mt-16 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-1">
          <h2 className="text-xl font-semibold">{tw('title')}</h2>
          <Help>{tw('intro')}</Help>
        </div>
        <WorkForm today={today} initialDate={sp.workDate && /^\d{4}-\d{2}-\d{2}$/.test(sp.workDate) ? sp.workDate : null} />
        <h3 className="font-semibold">{tw('mine')}</h3>
        {works.length === 0 && <p className="text-sm text-faint">{tw('none')}</p>}
        {works.map((w) => (
          <Card key={w.id} className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">
                {tw(`kind.${w.kind}`)} · {w.place}
              </span>
              <Chip tone={w.status === 'approved' ? 'ok' : w.status === 'pending' ? 'warn' : 'neutral'}>{tw(`status.${w.status}`)}</Chip>
            </div>
            <p className="num text-sm">
              {w.startDate === w.endDate ? day(w.startDate) : `${day(w.startDate)} ~ ${day(w.endDate)}`}
              {w.startTime && ` · ${w.startTime}~${w.endTime}`}
            </p>
            {w.reason && <p className="text-sm text-muted">{w.reason}</p>}
            {w.status === 'pending' && <CancelWork id={w.id} />}
          </Card>
        ))}
      </section>
      </div>
    </PageShell>
  );
}
