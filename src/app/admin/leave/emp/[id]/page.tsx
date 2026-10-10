// 휴가 발생 — 직원 한 명 (의뢰인 2026-10-11: 시프티의 「휴가 발생」 화면처럼) — 기준일 · 산정 기간 · 총/사용/남은 · 발생 내역(만료됨·발생됨·예정됨) · 발생 건 추가.
// 발생 건 = 연차 부여(leave_grants) 한 줄. 기준일에 적용되는 건이 「발생됨」, 그보다 앞선 건이 「만료됨」, 시작일이 기준일 뒤인 건이 「예정됨」이다.
// ★ 발생 일수는 관리자가 넣는다 (4-7). 자동 발생(회계연도 기준·매달 1일)과 휴가 그룹별 발생은 결정 뒤에 만든다 (결정 문서 급-10).
import { getFormatter, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { DetailBar, Field, FieldList } from '@/components/detail';
import { Card, Chip, PageShell } from '@/components/ui';
import { addDays } from '@/lib/calendar';
import { calcLeaveBalance, suggestGrant } from '@/lib/leave';
import { loadAllLeaveTypes, loadLeaveGrants, loadLeaveRequests } from '@/lib/leave-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';
import { GrantForm } from '../../GrantForm';

export default async function LeaveAccrualPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ to?: string; live?: string }> }) {
  const [t, tl, f, { id }, sp] = await Promise.all([getTranslations('admin.leaveAccrual'), getTranslations('admin.leave'), getFormatter(), params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const today = toKstDate(new Date());
  const asOf = sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) && !Number.isNaN(Date.parse(`${sp.to}T00:00:00Z`)) ? sp.to : today;
  const [{ data: p }, types, grants, requests] = await Promise.all([
    createAdminClient().from('profiles').select('id, name, joined_on').eq('id', id).maybeSingle(),
    loadAllLeaveTypes(),
    loadLeaveGrants(id),
    loadLeaveRequests({ employeeId: id, practice: sp.live === '1' ? false : undefined }),
  ]);
  if (!p) notFound();
  const bal = calcLeaveBalance({ grants, requests, types, asOf });
  const sorted = [...grants].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1)); // 새 것이 위
  const asc = [...sorted].reverse();
  const until = (g: (typeof grants)[number]) => {
    const next = asc[asc.indexOf(g) + 1];
    return next ? addDays(next.effectiveFrom, -1) : null;
  };
  const n = (v: number) => f.number(v, { maximumFractionDigits: 4 });
  const dot = (d: string) => d.replaceAll('-', '.');
  const hiredOn = p.joined_on as string | null;
  const ref = hiredOn ? suggestGrant(hiredOn, today) : null;

  return (
    <PageShell>
      <DetailBar back="/admin/leave" backLabel={t('back')} title={t('title')} />
      <section className="-mx-4 -mt-3 flex flex-col gap-1 border-b border-border bg-bg px-5 py-5 lg:mx-0 lg:mt-0 lg:rounded-card lg:border">
        <p className="text-2xl font-extrabold tracking-tight">{p.name}</p>
        <p className="num text-muted">
          {t('asOf', { date: dot(asOf) })}
          {bal.grant && ` · ${t('period', { from: dot(bal.grant.effectiveFrom), to: until(bal.grant) ? dot(until(bal.grant) as string) : t('open') })}`}
        </p>
      </section>
      {bal.grant ? (
        <dl className="num -mx-4 grid grid-cols-3 divide-x divide-border border-y border-border bg-bg text-center lg:mx-0 lg:rounded-card lg:border">
          {(
            [
              ['total', bal.granted],
              ['used', bal.used],
              ['left', bal.remaining],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="flex flex-col gap-1 py-4">
              <dt className="text-sm text-muted">{t(k)}</dt>
              <dd className={`text-2xl font-extrabold ${k === 'left' ? (v < 0 ? 'text-danger' : 'text-primary') : ''}`}>{n(v)}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="rounded-card bg-bg p-5 text-sm text-muted">{t('noGrant')}</p>
      )}
      {bal.pending > 0 && <p className="num px-1 text-sm text-muted">{t('pending', { n: n(bal.pending) })}</p>}

      <section className="flex flex-col gap-2">
        <h2 className="px-1 font-bold">{t('history')}</h2>
        {sorted.length === 0 && <p className="rounded-card bg-bg p-5 text-sm text-faint">{t('historyNone')}</p>}
        {sorted.length > 0 && (
          <ul className="-mx-4 divide-y divide-border border-y border-border bg-bg lg:mx-0 lg:rounded-card lg:border">
            {sorted.map((g) => {
              const state = g.effectiveFrom > asOf ? 'planned' : g.id === bal.grant?.id ? 'active' : 'expired';
              const end = until(g);
              return (
                <li key={g.id} className="flex min-h-16 items-center gap-3 px-5 py-2">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="num font-bold">
                      {dot(g.effectiveFrom)} - {end ? dot(end) : t('open')}
                    </span>
                    <span className="truncate text-sm text-muted">
                      {g.periodLabel}
                      {g.carriedDays > 0 && ` · ${t('carried', { n: n(g.carriedDays) })}`}
                      {g.note && ` · ${g.note}`}
                    </span>
                  </span>
                  <span className="num shrink-0 font-bold">{tl('granted')} {n(g.grantedDays + g.carriedDays)}</span>
                  <Chip tone={state === 'active' ? 'ok' : state === 'planned' ? 'warn' : 'neutral'}>{t(state)}</Chip>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Card className="flex flex-col gap-3">
        <h2 className="font-bold">{t('add')}</h2>
        <p className="text-sm text-muted">{t('addHint')}</p>
        <GrantForm employeeId={id} current={null} suggested={ref ? { days: ref.days, periodLabel: ref.periodLabel, effectiveFrom: ref.effectiveFrom } : null} />
      </Card>
      <FieldList>
        <Field label={t('hired')} value={hiredOn ?? t('none')} />
        <Field label={t('toManage')} value={t('toManageValue')} href={`/admin/leave?e=${id}#edit`} />
      </FieldList>
      <p className="px-1 text-sm text-faint">{t('hint')}</p>
    </PageShell>
  );
}
