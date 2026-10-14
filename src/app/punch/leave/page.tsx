// 직원 「연차」 탭 (②-2 게이트 5, 시프티 대조 우선 반영 ①). 잔여 · 신청 · 내 신청.
// 대기 일수는 잔여에서 빼지 않고 따로 보여 준다 (7-3 요점 5). 사유는 선택 (4-7).
import { SheetOpener } from '@/components/SheetOpener';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AddSheet } from '@/components/AddSheet';
import { Fab } from '@/components/Fab';
import { createAdminClient } from '@/lib/supabase/admin';
import { MineBar } from '@/components/MineBar';
import { Row, RowList } from '@/components/list';
import { Card, CardTitle, Chip, PageShell } from '@/components/ui';
import { getMe } from '@/lib/auth';
import { calcLeaveBalance, leaveTypeName, monthlyLeaveUse } from '@/lib/leave';
import { loadAllLeaveTypes, loadLeaveGrants, loadLeaveRequests } from '@/lib/leave-data';
import { endingSoonest, entriesFor, isTypeTarget, ledgerBalance, lotRemaining, minutesToDays } from '@/lib/leave-ledger';
import { groupScope } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { loadEntries, loadLots, loadTypeRules } from '@/lib/leave-ledger-data';
import { OFFICE } from '@/config/office';
import { toKstDate } from '@/lib/time';
import { loadWorkRequests } from '@/lib/work-data';
import { CancelLeave, DeleteLeaveRequest, LeaveForm } from './LeaveForm';
import { CancelWork, WorkForm } from './WorkForm';
import { loadMyOpenTargets } from '@/lib/leave-promotion';

export default async function LeavePage({ searchParams }: { searchParams: Promise<{ workDate?: string; new?: string; y?: string }> }) {
  const me = await getMe();
  if (!me) redirect('/login');
  const t = await getTranslations('leave');
  const tw = await getTranslations('work');
  const tc = await getTranslations('common');
  const ta = await getTranslations('admin.leave');
  const f = await getFormatter();
  const sp = await searchParams;
  const today = toKstDate(new Date());
  const [types, grants, requests, works] = await Promise.all([loadAllLeaveTypes(), loadLeaveGrants(me.id), loadLeaveRequests({ employeeId: me.id }), loadWorkRequests({ employeeId: me.id })]);
  const bal = calcLeaveBalance({ grants, requests, types, asOf: today });
  // 적용 대상이 아닌 종류는 신청 양식에 내놓지 않는다 (L13 — 서버도 다시 막는다)
  const [rules, orgGroups, { data: prof }] = await Promise.all([loadTypeRules(), loadOrgGroups(), createAdminClient().from('profiles').select('group_id').eq('id', me.id).maybeSingle()]);
  const mayUse = (code: string) => {
    const r = rules.get(code)?.rule;
    return !r || isTypeTarget(r, { id: me.id, groupId: (prof?.group_id as string | null) ?? null }, new Map(r.targets.groupIds.map((g) => [g, groupScope(orgGroups, g)])));
  };
  // 휴가 원장(지급 건이 승인된 직원만): 받은 연차 · 사용 · 잔여 · 소진율 · 곧 끝나는 연차 (PRD 37.5, L21). 위의 잔여 카드는 아직 예전 계산이다(대조 단계)
  const [lots, ledgerAll] = await Promise.all([loadLots({ employeeId: me.id, states: ['APPROVED'] }), loadEntries(me.id)]);
  const ledger = entriesFor(ledgerAll, OFFICE.practiceMode);
  const lb = lots.length > 0 ? ledgerBalance(lots, ledger, today) : null;
  const rem = lotRemaining(lots, ledger);
  const ending = endingSoonest(lots, rem, today);
  const nameOf = (code: string) => leaveTypeName(types, code, t);
  // 올해가 아니면 연도도 (지난해·먼 미래 신청이 올해로 읽히지 않게)
  const day = (d: string) => f.dateTime(new Date(`${d}T12:00:00+09:00`), { year: d.slice(0, 4) === today.slice(0, 4) ? undefined : 'numeric', month: 'short', day: 'numeric', weekday: 'short' });
  const n = (v: number) => f.number(v, { maximumFractionDigits: 4 });
  // 달별 사용 표 (2026-10-14 직원 화면 보강): 고른 해(없으면 올해)
  const year = /^\d{4}$/.test(sp.y ?? '') ? sp.y! : today.slice(0, 4);
  const monthly = monthlyLeaveUse(requests, types, year);
  const total = monthly.reduce((a, m) => ({ deducted: a.deducted + m.deducted, other: a.other + m.other, pending: a.pending + m.pending }), { deducted: 0, other: 0, pending: 0 });
  const cell = (v: number) => (v === 0 ? <span className="text-faint">–</span> : n(v));

  // 대기 중인 내 휴가 삭제 요청 (휴가 id → 요청 id)
  const { data: changes } = await createAdminClient().from('leave_change_requests').select('id, leave_id').eq('employee_id', me.id).eq('status', 'pending');
  const deleteOf = new Map((changes ?? []).map((c) => [c.leave_id as string, c.id as string]));
  // 회사가 보낸 연차 사용 촉진 가운데 내가 계획을 내야 하는 것
  const promos = await loadMyOpenTargets(me.id);

  return (
    <PageShell wide>
      {promos.map((p) => (
        <Link key={p.id} href={`/punch/leave/promotion/${p.id}`} className={`num flex min-h-11 items-center justify-between gap-3 rounded-card border p-3 text-sm font-bold ${p.state === 'NOTIFIED' ? 'border-warn bg-warn-tint text-warn' : 'border-border bg-bg text-muted'}`}>
          <span>{t(p.state === 'NOTIFIED' ? 'promoBanner' : 'promoBannerDone', { title: p.title, due: p.planDueOn })}</span>
          <span className="shrink-0 underline">{t('promoOpen')}</span>
        </Link>
      ))}
      <MineBar menu={tc('menu')} title={t('title')}>
        {me.role === 'admin' && (
          <nav className="flex border-t border-border">
            {(['mine', 'all'] as const).map((k) => (
              <Link key={k} href={k === 'mine' ? '/punch/leave' : '/admin/leave'} aria-current={k === 'mine' ? 'page' : undefined} className={`flex min-h-12 flex-1 items-center justify-center border-b-2 text-base font-bold ${k === 'mine' ? 'border-text text-text' : 'border-transparent text-muted'}`}>
                {ta(k)}
              </Link>
            ))}
          </nav>
        )}
      </MineBar>
      <div className="flex items-center gap-2">
        <h1 className="sr-only lg:not-sr-only lg:text-2xl lg:font-semibold lg:text-primary-deep">{t('title')}</h1>
        <SheetOpener id="leave" label={t('request')} className="ml-auto hidden lg:inline-flex" />
        <SheetOpener id="work" label={tw('title')} className="hidden lg:inline-flex" />
      </div>

      {lb && (
        <Card className="flex flex-col gap-2 p-6">
          <CardTitle icon={CalendarDays}>{t('usageTitle')}</CardTitle>
          <dl className="num grid grid-cols-2 gap-x-6 gap-y-1 text-sm md:grid-cols-4">
            {([['usageGranted', minutesToDays(lb.granted)], ['usageUsed', minutesToDays(lb.used)], ['usageRemaining', minutesToDays(lb.remaining)], ['usageExpired', minutesToDays(lb.expired)]] as const).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-muted">{t(k)}</dt>
                <dd className="font-bold">{t('days', { n: n(v) })}</dd>
              </div>
            ))}
          </dl>
          <p className="num text-sm">
            {lb.granted > 0 ? t('usageRate', { pct: n(Math.round((lb.used / lb.granted) * 1000) / 10) }) : t('usageRateNone')}
            {lb.advance > 0 && ` · ${t('usageAdvance', { n: n(minutesToDays(lb.advance)) })}`}
          </p>
          {ending && <p className="num text-sm text-warn">{t('usageEnding', { n: n(minutesToDays(rem.get(ending.id) ?? 0)), date: day(ending.usableTo!) })}</p>}
          <p className="text-xs text-faint">{t('usageNote')}</p>
        </Card>
      )}

      <section className="flex flex-col gap-2 rounded-card border border-border bg-bg p-4 lg:p-6">
        <div className="flex items-center gap-2">
          <h2 className="flex-1 font-bold">{t('monthlyTitle')}</h2>
          <Link href={`/punch/leave?y=${Number(year) - 1}`} aria-label={t('prevYear')} className="flex size-9 items-center justify-center rounded-button border border-border text-muted">
            <ChevronLeft aria-hidden size={16} />
          </Link>
          <span className="num min-w-14 text-center font-bold">{year}</span>
          <Link href={`/punch/leave?y=${Number(year) + 1}`} aria-label={t('nextYear')} className="flex size-9 items-center justify-center rounded-button border border-border text-muted">
            <ChevronRight aria-hidden size={16} />
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="num w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface">
                <th scope="col" className="px-2 py-2 text-left text-xs font-semibold whitespace-nowrap text-muted">{t('monthlyKind')}</th>
                {monthly.map((m) => (
                  <th key={m.month} scope="col" className="px-2 py-2 text-right text-xs font-semibold whitespace-nowrap text-muted">{t('monthN', { n: m.month })}</th>
                ))}
                <th scope="col" className="px-2 py-2 text-right text-xs font-semibold whitespace-nowrap text-muted">{t('monthlyTotal')}</th>
              </tr>
            </thead>
            <tbody>
              {(['deducted', 'other', 'pending'] as const).map((k) => (
                <tr key={k} className="border-b border-border last:border-b-0">
                  <th scope="row" className="px-2 py-2.5 text-left font-semibold whitespace-nowrap">{t(`monthly.${k}`)}</th>
                  {monthly.map((m) => (
                    <td key={m.month} className={`px-2 py-2.5 text-right ${k === 'pending' && m[k] > 0 ? 'text-warn' : ''}`}>{cell(m[k])}</td>
                  ))}
                  <td className="px-2 py-2.5 text-right font-bold">{cell(total[k])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-faint">{t('monthlyNote')}</p>
      </section>

      {/* PC: 왼쪽 = 휴가, 오른쪽 = 외근·출장·재택. 줄마다 좌우 높이를 맞춘다 — ① 요약 ② 신청 ③ 내 신청 (2026-10-06 의뢰인: 위쪽이 어긋났다) · 폰: 휴가 3칸 뒤에 외근 3칸 (order) */}
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4">

      <Card className="order-1 flex flex-col gap-3 p-6">
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

      {/* 폰: 양식은 + 버튼을 누르면 올라온다 (2026-10-10 의뢰인) · PC: 제자리에 펼쳐 둔다 */}
      <AddSheet id="leave" title={t('request')} defaultOpen={sp.new === 'leave'} modal>
        <LeaveForm today={today} types={types.filter((x) => x.active && mayUse(x.code)).map((x) => ({ code: x.code, name: nameOf(x.code), unit: x.dayUnit, deducts: x.deductsBalance, hours: x.hours ?? x.dayUnit * 8, startTime: x.startTime ?? null, endTime: x.endTime ?? null, group: x.groupName ?? null }))} />
      </AddSheet>

      <section className="order-3 flex flex-col gap-2 lg:order-5">
        <h2 className="font-semibold">{t('mine')}</h2>
        {requests.length === 0 && <p className="text-sm text-faint">{t('none')}</p>}
        <RowList>
        {requests.map((r) => (
          <Row key={r.id} aside={<Chip tone={r.status === 'approved' ? 'ok' : r.status === 'pending' ? 'warn' : 'neutral'}>{t(`status.${r.status}`)}</Chip>}>
            <span className="font-semibold">
              {nameOf(r.typeCode)} · <span className="num">{t('days', { n: n(r.days) })}</span>
            </span>
            <span className="num text-sm">
              {r.startDate === r.endDate ? day(r.startDate) : `${day(r.startDate)} ~ ${day(r.endDate)}`}
              {r.startTime && ` · ${r.startTime} - ${r.endTime}`}
            </span>
            {r.reason && <span className="text-sm text-muted">{r.reason}</span>}
            {r.status === 'pending' && <CancelLeave id={r.id} />}
            {r.status === 'approved' && r.endDate >= today && <DeleteLeaveRequest leaveId={r.id} pendingId={deleteOf.get(r.id) ?? null} />}
          </Row>
        ))}
        </RowList>
      </section>

      {/* 외근·출장·재택 (②-3 7-11) — 연차와 같은 화면. 요약 칸은 왼쪽 「남은 연차」와 같은 줄·같은 높이 */}
      <div id="work" className="order-4 grid scroll-mt-16 lg:order-2">
        <div className="flex flex-col gap-3 px-1 pt-2 lg:rounded-card lg:bg-bg lg:p-6">
          <CardTitle help={tw('intro')}>{tw('title')}</CardTitle>
          <dl className="num hidden flex-1 grid-cols-2 content-center gap-2 text-center lg:grid">
            {(['pending', 'approved'] as const).map((k) => {
              const v = works.filter((w) => w.status === k).length;
              return (
                <div key={k} className="rounded-button bg-surface p-2">
                  <dt className="text-xs text-muted">{tw(`status.${k}`)}</dt>
                  <dd className={`text-lg font-bold ${k === 'pending' && v > 0 ? 'text-warn' : ''}`}>{v}</dd>
                </div>
              );
            })}
          </dl>
        </div>
      </div>
      {/* 홈의 "사무실 밖" 안내에서 날짜를 채워 넘어오면 열린 채로 시작한다 */}
      <AddSheet id="work" title={tw('title')} defaultOpen={!!sp.workDate || sp.new === 'work'} modal>
        <WorkForm today={today} initialDate={sp.workDate && /^\d{4}-\d{2}-\d{2}$/.test(sp.workDate) ? sp.workDate : null} />
      </AddSheet>
      <section className="order-6 flex flex-col gap-2">
        <h3 className="font-semibold">{tw('mine')}</h3>
        {works.length === 0 && <p className="text-sm text-faint">{tw('none')}</p>}
        <RowList>
        {works.map((w) => (
          <Row key={w.id} aside={<Chip tone={w.status === 'approved' ? 'ok' : w.status === 'pending' ? 'warn' : 'neutral'}>{tw(`status.${w.status}`)}</Chip>}>
            <span className="font-semibold">
              {tw(`kind.${w.kind}`)} · {w.place}
            </span>
            <span className="num text-sm">
              {w.startDate === w.endDate ? day(w.startDate) : `${day(w.startDate)} ~ ${day(w.endDate)}`}
              {w.startTime && ` · ${w.startTime}~${w.endTime}`}
            </span>
            {w.reason && <span className="text-sm text-muted">{w.reason}</span>}
            {w.status === 'pending' && <CancelWork id={w.id} />}
          </Row>
        ))}
        </RowList>
      </section>
      </div>
      <Fab label={tc('add')} items={[{ id: 'leave', label: t('request') }, { id: 'work', label: tw('title') }]} />
    </PageShell>
  );
}
