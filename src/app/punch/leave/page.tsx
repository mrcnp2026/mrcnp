// 직원 「연차」 탭 (②-2 게이트 5, 시프티 대조 우선 반영 ①). 잔여 · 신청 · 내 신청.
// 대기 일수는 잔여에서 빼지 않고 따로 보여 준다 (7-3 요점 5). 사유는 선택 (4-7).
import { SheetOpener } from '@/components/SheetOpener';
import { CalendarDays, ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import { CountUp } from '@/components/CountUp';
import { HelpTip } from '@/components/Help';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AddSheet } from '@/components/AddSheet';
import { Fab } from '@/components/Fab';
import { createAdminClient } from '@/lib/supabase/admin';
import { MineBar } from '@/components/MineBar';
import { Row, RowList } from '@/components/list';
import { Pager, pageOf } from '@/components/Pager';
import { Chip, Empty, PageShell } from '@/components/ui';
import { getMe } from '@/lib/auth';
import { switchOn } from '@/lib/switches';
import { calcLeaveBalance, leaveTypeName, monthlyLeaveUse } from '@/lib/leave';
import { loadAllLeaveTypes, loadLeaveGrants, loadLeaveRequests } from '@/lib/leave-data';
import { endingSoonest, entriesFor, isTypeTarget, ledgerBalance, lotRemaining, minutesToDays } from '@/lib/leave-ledger';
import { groupScope } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { loadEntries, loadLots, loadTypeRules } from '@/lib/leave-ledger-data';
import { OFFICE } from '@/config/office';
import { toKstDate } from '@/lib/time';
import { loadWorkRequests } from '@/lib/work-data';
import { loadRejectReasons } from '@/lib/reject-reason';
import { CancelLeave, DeleteLeaveRequest, LeaveForm } from './LeaveForm';
import { CancelWork, WorkForm } from './WorkForm';
import { loadMyOpenTargets } from '@/lib/leave-promotion';

export default async function LeavePage({ searchParams }: { searchParams: Promise<{ workDate?: string; new?: string; y?: string; lp?: string; wp?: string }> }) {
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
  // 긴 목록은 10건씩 (2026-10-15 의뢰인: 폰에서 끝없이 길어진다)
  const reqPage = pageOf(requests, sp.lp, 10);
  const workPage = pageOf(works, sp.wp, 10);
  // 거절 사유 (2026-10-21 의뢰인) — 이 쪽에 보이는 거절된 휴가 · 외근만
  const why = await loadRejectReasons([...reqPage.items.filter((r) => r.status === 'rejected').map((r) => ({ table: 'leave_requests', id: r.id })), ...workPage.items.filter((w) => w.status === 'rejected').map((w) => ({ table: 'work_requests', id: w.id }))]);
  const trq = await getTranslations('requests');
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
  // 잔여 카드: 원장을 시작한 직원은 원장 숫자(2026-10-15, 미구현 34번), 아직이면 예전 계산
  const pendingDays = requests.filter((r) => r.status === 'pending' && types.find((x) => x.code === r.typeCode)?.deductsBalance).reduce((a, r) => a + r.days, 0);
  const card = lb
    ? { label: null as string | null, remaining: minutesToDays(lb.remaining), granted: minutesToDays(lb.granted), used: minutesToDays(lb.used), pending: pendingDays }
    : bal.grant ? { label: bal.grant.periodLabel, remaining: bal.remaining, granted: bal.granted, used: bal.used, pending: bal.pending } : null;
  const rem = lotRemaining(lots, ledger);
  const ending = endingSoonest(lots, rem, today);
  const nameOf = (code: string) => leaveTypeName(types, code, t);
  // 올해가 아니면 연도도 (지난해·먼 미래 신청이 올해로 읽히지 않게)
  const day = (d: string) => f.dateTime(new Date(`${d}T12:00:00+09:00`), { year: d.slice(0, 4) === today.slice(0, 4) ? undefined : 'numeric', month: 'short', day: 'numeric', weekday: 'short' });
  const n = (v: number) => f.number(v, { maximumFractionDigits: 2 }); // 일수는 화면에 소수 둘째 자리까지 (2026-10-19 의뢰인: 15분 = 0.03125일까지 저장하지만 폰에서 칸을 넘지 않게. 저장 · 계산은 다섯째 자리 그대로)
  // 달별 사용 표 (2026-10-14 직원 화면 보강): 고른 해(없으면 올해)
  const year = /^\d{4}$/.test(sp.y ?? '') ? sp.y! : today.slice(0, 4);
  const monthly = monthlyLeaveUse(requests, types, year);
  const total = monthly.reduce((a, m) => ({ deducted: a.deducted + m.deducted, other: a.other + m.other, pending: a.pending + m.pending }), { deducted: 0, other: 0, pending: 0 });
  const cell = (v: number) => (v === 0 ? <span className="text-faint">–</span> : n(v));

  // 대기 중인 내 휴가 삭제 요청 (휴가 id → 요청 id)
  const { data: changes } = await createAdminClient().from('leave_change_requests').select('id, leave_id, kind').eq('employee_id', me.id).eq('status', 'pending');
  const deleteOf = new Map((changes ?? []).map((c) => [c.leave_id as string, { id: c.id as string, kind: c.kind as string }]));
  // 회사가 보낸 연차 사용 촉진 가운데 내가 계획을 내야 하는 것
  const promos = await loadMyOpenTargets(me.id);

  const hourlyOn = await switchOn('leave.hourly');
  const formTypes = types.filter((x) => x.active && mayUse(x.code) && (hourlyOn || x.dayUnit >= 1)).map((x) => ({ code: x.code, name: nameOf(x.code), unit: x.dayUnit, deducts: x.deductsBalance, hours: x.hours ?? x.dayUnit * 8, startTime: x.startTime ?? null, endTime: x.endTime ?? null, group: x.groupName ?? null })); // 통합설정 › 휴가 「시간 단위 휴가」를 끄면 하루 미만 종류를 고를 수 없다 (2026-10-19)
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
              <Link key={k} href={k === 'mine' ? '/punch/leave' : '/admin/leave'} aria-current={k === 'mine' ? 'page' : undefined} className={`flex min-h-12 flex-1 lg:flex-none lg:px-4 items-center justify-center border-b-2 text-base font-bold ${k === 'mine' ? 'border-text text-text lg:border-primary lg:text-primary' : 'border-transparent text-muted hover:text-text'}`}>
                {ta(k)}
              </Link>
            ))}
          </nav>
        )}
      </MineBar>
      <div className="flex items-center gap-2">
        <h1 className="sr-only lg:not-sr-only lg:text-2xl lg:font-semibold lg:text-primary-deep">{t('title')}</h1>
        <SheetOpener id="leave" label={t('request')} outline className="ml-auto hidden lg:inline-flex" />
        <SheetOpener id="work" label={tw('title')} outline className="hidden lg:inline-flex" />
      </div>

      {/* 맨 위 한 장: 남은 연차를 크게 + 사용 막대 (2026-10-22 의뢰인: 「시프티 잔재 · 고급지지 않다」 — 「연차 사용 현황」과 「남은 연차」 두 카드가 같은 숫자를 두 번 보였다) */}
      {card ? (
        <section className="flex flex-col gap-5 rounded-card border border-border bg-bg p-5 shadow-card lg:flex-row lg:items-center lg:gap-10 lg:p-7">
          <div className="flex min-w-0 flex-col gap-1 lg:w-64 lg:shrink-0">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-muted">
              <CalendarDays aria-hidden size={16} />
              {t('balanceTitle')}
              {card.label && <span className="font-normal text-faint">· {card.label}</span>}
            </p>
            <p className="flex items-baseline gap-1">
              <CountUp value={n(card.remaining)} className="num text-5xl font-extrabold tracking-tight text-primary" />
              <span className="text-lg font-bold text-muted">{t('dayUnit')}</span>
            </p>
            {ending && <p className="num text-sm font-semibold text-warn">{t('usageEnding', { n: n(minutesToDays(rem.get(ending.id) ?? 0)), date: day(ending.usableTo!) })}</p>}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            {/* 받은 연차 대비 쓴 만큼 차오르는 막대 · 승인 대기는 옅은 노랑으로 이어 붙인다 */}
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-semibold">{t('usageTitle')}</span>
              <span className="num text-muted">{card.granted > 0 ? t('usageRate', { pct: n(Math.round((card.used / card.granted) * 1000) / 10) }) : t('usageRateNone')}</span>
            </div>
            <div aria-hidden className="flex h-3 overflow-hidden rounded-chip bg-surface">
              <span className="fx-grow-x h-full bg-primary" style={{ width: `${card.granted > 0 ? Math.min(100, (card.used / card.granted) * 100) : 0}%` }} />
              {card.pending > 0 && <span className="fx-grow-x h-full bg-warn" style={{ width: `${card.granted > 0 ? Math.min(100, (card.pending / card.granted) * 100) : 0}%`, animationDelay: '500ms' }} />}
            </div>
            <dl className={`num grid grid-cols-2 gap-2 ${lb ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
              {([['granted', card.granted, 'text-text'], ['used', card.used, 'text-primary'], ['pending', card.pending, card.pending > 0 ? 'text-warn' : 'text-faint'], ...(lb ? [['usageExpired', minutesToDays(lb.expired), lb.expired > 0 ? 'text-muted' : 'text-faint'] as const] : [])] as const).map(([k, v, tone]) => (
                <div key={k} className="flex flex-col gap-0.5 rounded-button bg-surface px-4 py-3">
                  <dt className="text-xs text-muted">{t(k)}</dt>
                  <dd className={`text-xl font-bold ${tone}`}>{v ? <CountUp value={n(v)} /> : '–'}</dd>
                </div>
              ))}
            </dl>
            {(card.pending > 0 || (lb && lb.advance > 0)) && (
              <p className="num text-xs text-muted">
                {card.pending > 0 && t('pendingHint')}
                {lb && lb.advance > 0 && ` ${t('usageAdvance', { n: n(minutesToDays(lb.advance)) })}`}
              </p>
            )}
            {lb && <p className="text-xs text-faint">{t('usageNote')}</p>}
          </div>
        </section>
      ) : (
        <Empty icon={CalendarDays} title={t('balanceTitle')} desc={t('noGrant')} />
      )}

      <section className="flex flex-col gap-2 rounded-card border border-border bg-bg p-4 lg:p-6 lg:shadow-card">
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
        {/* 폰: 달마다 작은 칸 4×3 — 옆으로 밀어 보던 12달 표를 없앴다 (2026-10-16 디자인). 칸 안: 연차 사용 · 그 밖의 휴가 · 승인 대기 */}
        <div className="flex flex-col gap-2 lg:hidden">
          <ul className="num grid grid-cols-4 gap-1.5">
            {monthly.map((m) => {
              const any = m.deducted > 0 || m.other > 0 || m.pending > 0;
              return (
                <li key={m.month} className={`flex min-h-14 flex-col items-center justify-center rounded-button px-1 py-1.5 text-center ${any ? 'bg-primary-tint' : 'bg-surface'}`}>
                  <span className="text-xs text-muted">{t('monthN', { n: m.month })}</span>
                  <span className={`text-sm font-bold ${any ? 'text-primary' : 'text-faint'}`}>{m.deducted > 0 ? cell(m.deducted) : '–'}</span>
                  {m.other > 0 && <span className="text-xs text-muted">+{cell(m.other)}</span>}
                  {m.pending > 0 && <span className="text-xs text-warn">{cell(m.pending)}</span>}
                </li>
              );
            })}
          </ul>
          <p className="num flex flex-wrap gap-x-3 text-xs text-muted">
            <span>{t('monthly.deducted')} <b className="text-text">{cell(total.deducted)}</b></span>
            <span>{t('monthly.other')} <b className="text-text">{cell(total.other)}</b></span>
            {total.pending > 0 && <span className="text-warn">{t('monthly.pending')} <b>{cell(total.pending)}</b></span>}
          </p>
        </div>
        {/* PC: 12달 막대 (2026-10-22 의뢰인: 「그래프가 채워지는 모습」 — 숫자만 깔린 표였다). 정확한 숫자는 막대 위와 아래 합계에 */}
        {total.deducted + total.other + total.pending === 0 && <p className="hidden rounded-button bg-surface px-4 py-6 text-center text-sm text-faint lg:block">{t('monthlyNone', { y: year })}</p>}
        <div className={`hidden lg:flex-col lg:gap-3 ${total.deducted + total.other + total.pending === 0 ? '' : 'lg:flex'}`}>
          <ul className="flex h-40 items-stretch gap-3 border-b border-border">
            {monthly.map((m, i) => {
              const sum = m.deducted + m.other + m.pending;
              const top = Math.max(1, ...monthly.map((x) => x.deducted + x.other + x.pending));
              return (
                <li key={m.month} title={`${t('monthN', { n: m.month })} · ${t('monthly.deducted')} ${n(m.deducted)} · ${t('monthly.other')} ${n(m.other)} · ${t('monthly.pending')} ${n(m.pending)}`} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
                  {sum > 0 && <CountUp value={n(sum)} className="num text-xs font-bold" />}
                  <span className="fx-grow flex w-full max-w-10 flex-col-reverse overflow-hidden rounded-t" style={{ height: `${(sum / top) * 80}%`, animationDelay: `${i * 80}ms` }}>
                    <span className="bg-primary" style={{ flexGrow: m.deducted }} />
                    <span className="bg-primary-tint" style={{ flexGrow: m.other }} />
                    <span className="bg-warn" style={{ flexGrow: m.pending }} />
                  </span>
                </li>
              );
            })}
          </ul>
          <ul className="num -mt-2 flex gap-3">
            {monthly.map((m) => (
              <li key={m.month} className={`flex-1 text-center text-xs ${year === today.slice(0, 4) && m.month === Number(today.slice(5, 7)) ? 'font-bold text-primary' : 'text-muted'}`}>{t('monthN', { n: m.month })}</li>
            ))}
          </ul>
          <p className="num flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
            <span className="flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-sm bg-primary" />{t('monthly.deducted')} <b className="text-text">{cell(total.deducted)}</b></span>
            <span className="flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-sm bg-primary-tint" />{t('monthly.other')} <b className="text-text">{cell(total.other)}</b></span>
            <span className="flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-sm bg-warn" />{t('monthly.pending')} <b className="text-text">{cell(total.pending)}</b></span>
          </p>
        </div>
        <p className="text-xs text-faint">{t('monthlyNote')}</p>
      </section>

      {/* PC: 왼쪽 = 휴가, 오른쪽 = 외근·출장·재택. 줄마다 좌우 높이를 맞춘다 — ① 요약 ② 신청 ③ 내 신청 (2026-10-06 의뢰인: 위쪽이 어긋났다) · 폰: 휴가 3칸 뒤에 외근 3칸 (order) */}
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">

      {/* 폰: 양식은 + 버튼을 누르면 올라온다 (2026-10-10 의뢰인) · PC: 제자리에 펼쳐 둔다 */}
      <AddSheet id="leave" title={t('request')} defaultOpen={sp.new === 'leave'} modal>
        <LeaveForm today={today} types={formTypes} />
      </AddSheet>

      <section id="mine" className="order-1 flex scroll-mt-16 flex-col gap-2">
        <h2 className="flex items-center gap-2 font-bold">
          {t('mine')}
          {requests.length > 0 && <span className="num rounded-chip bg-surface px-2 text-xs font-semibold text-muted">{requests.length}</span>}
        </h2>
        {requests.length === 0 && <Empty icon={CalendarDays} title={t('none')} />}
        <RowList>
        {reqPage.items.map((r) => (
          <Row key={r.id} aside={<Chip tone={r.status === 'approved' ? 'ok' : r.status === 'pending' ? 'warn' : 'neutral'}>{t(`status.${r.status}`)}</Chip>}>
            <span className="font-semibold">
              {nameOf(r.typeCode)} · <span className="num">{t('days', { n: n(r.days) })}</span>
            </span>
            <span className="num text-sm">
              {r.startDate === r.endDate ? day(r.startDate) : `${day(r.startDate)} ~ ${day(r.endDate)}`}
              {r.startTime && ` · ${r.startTime} - ${r.endTime}`}
            </span>
            {r.reason && <span className="text-sm text-muted">{r.reason}</span>}
            {why.get(`leave_requests:${r.id}`) && <span className="text-sm break-words text-danger">{trq('rejectReason', { why: why.get(`leave_requests:${r.id}`)! })}</span>}
            {r.status === 'pending' && <CancelLeave id={r.id} />}
            {r.status === 'approved' && r.endDate >= today && <DeleteLeaveRequest leaveId={r.id} pendingId={deleteOf.get(r.id)?.id ?? null} pendingKind={deleteOf.get(r.id)?.kind} today={today} types={formTypes} initial={{ typeCode: r.typeCode, startDate: r.startDate, endDate: r.endDate, startTime: r.startTime ?? null }} />}
          </Row>
        ))}
        </RowList>
        <Pager page={reqPage.page} pages={reqPage.pages} param="lp" params={sp} anchor="mine" label={tc('pages')} />
      </section>

      {/* 홈의 "사무실 밖" 안내에서 날짜를 채워 넘어오면 열린 채로 시작한다 */}
      <AddSheet id="work" title={tw('title')} defaultOpen={!!sp.workDate || sp.new === 'work'} modal>
        <WorkForm today={today} initialDate={sp.workDate && /^\d{4}-\d{2}-\d{2}$/.test(sp.workDate) ? sp.workDate : null} />
      </AddSheet>
      <section id="work" className="order-2 flex scroll-mt-16 flex-col gap-2">
        <span id="work-mine" aria-hidden />
        <h2 className="flex flex-wrap items-center gap-2 font-bold">
          {tw('mine')}
          <HelpTip>{tw('intro')}</HelpTip>
          {(['pending', 'approved'] as const).map((k) => {
            const v = works.filter((w) => w.status === k).length;
            return v > 0 ? <Chip key={k} tone={k === 'pending' ? 'warn' : 'ok'}>{tw(`status.${k}`)} {v}</Chip> : null;
          })}
        </h2>
        {works.length === 0 && <Empty icon={MapPin} title={tw('none')} />}
        <RowList>
        {workPage.items.map((w) => (
          <Row key={w.id} aside={<Chip tone={w.status === 'approved' ? 'ok' : w.status === 'pending' ? 'warn' : 'neutral'}>{tw(`status.${w.status}`)}</Chip>}>
            <span className="font-semibold">
              {tw(`kind.${w.kind}`)} · {w.place}
            </span>
            <span className="num text-sm">
              {w.startDate === w.endDate ? day(w.startDate) : `${day(w.startDate)} ~ ${day(w.endDate)}`}
              {w.startTime && ` · ${w.startTime}~${w.endTime}`}
            </span>
            {w.reason && <span className="text-sm text-muted">{w.reason}</span>}
            {why.get(`work_requests:${w.id}`) && <span className="text-sm break-words text-danger">{trq('rejectReason', { why: why.get(`work_requests:${w.id}`)! })}</span>}
            {w.status === 'pending' && <CancelWork id={w.id} />}
          </Row>
        ))}
        </RowList>
        <Pager page={workPage.page} pages={workPage.pages} param="wp" params={sp} anchor="work-mine" label={tc('pages')} />
      </section>
      </div>
      <Fab label={trq('new')} items={[{ id: 'leave', label: t('request') }, { id: 'work', label: tw('title') }]} />
    </PageShell>
  );
}
