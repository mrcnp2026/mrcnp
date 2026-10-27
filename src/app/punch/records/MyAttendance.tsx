// 직원 「내 근태현황」 — 주간 · 월간 (2026-10-15 의뢰인: 「직원 모드 근태 · 일정이 목록형으로 나오는 게 아니다」, 참고 화면 `스샷/스샷2/근태1.png`(주) · `근태2.png`(월)).
//   주간: 위 요약(주간 누적 막대 · 잔여 근무일 · 잔여 근로시간 · 총 근로시간 · 휴가) → 7일 칸(출 · 퇴 · 근무 시간 · 초과 · 휴가) → 고른 날의 상세(00~24시 막대 · 근무상태 내역)
//   월간: 위 요약(총 근로 · 휴가 · 소정 · 미승인 초과 · 승인 초과 · 잔여 근무일) → 달력(왼쪽에 주차별 근로시간). 날짜를 누르면 그 주의 주간 보기로
// 출퇴근기록(/punch/records — 월간이 먼저) 화면. 직원 근무일정 메뉴는 없앴다(/punch/schedule → 주간). 승인된 앞날 휴가도 그 날짜 칸에 보인다. 폰은 7일 칸이 한 줄씩, 달력은 숫자만 작게.
// 숫자는 관리자 화면과 같은 계산(daysFor)을 쓴다. 보기만 — 고치려면 「근무시간 수정」(정정 요청)으로.
import { getShiftKindNames } from '@/lib/settings';
import { withKindNames } from '@/lib/shift-kind-names';
import { ChevronLeft, ChevronRight, History, Pencil } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { CountUp } from '@/components/CountUp';
import type { ReactNode } from 'react';
import { resolveDayType } from '@/config/labor-rules';
import { OFFICE } from '@/config/office';
import { addDays, weekStartOf } from '@/lib/calendar';
import { judgeLateness } from '@/lib/lateness';
import { leaveTypeName } from '@/lib/leave';
import { isYearMonth, monthRange } from '@/lib/month-data';
import { daysFor, leaveDaysFor, loadPeriod } from '@/lib/period-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { kstDateTime, toKstDate } from '@/lib/time';
import { ReasonForm } from './ReasonForm';

type View = 'week' | 'month';
const MONTHS_BACK = 6; // 직원이 볼 수 있는 과거 (보존은 3년 — 그 이상은 관리자에게 요청)
const AHEAD_DAYS = 62; // 앞날은 두 달까지 (일정 확인용)
const STD_WEEK = 40 * 60; // 주 소정 근로시간(법정) — 잔여 근로시간의 기준

const shiftMonth = (ym: string, n: number) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
};
const isoDow = (d: string) => ((new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
const hhmm = (s: string) => s.slice(0, 5);

export async function MyAttendance({ me, sp, base, defaultView, extra }: { me: { id: string }; sp: { v?: string; d?: string; m?: string }; base: string; defaultView: View; extra?: ReactNode }) {
  const [t, tl, tkRaw, f] = await Promise.all([getTranslations('myAtt'), getTranslations('leave'), getTranslations('admin.shifts.kinds'), getFormatter()]);
  const today = toKstDate(new Date());
  const tk = withKindNames(tkRaw, await getShiftKindNames(today));
  const oldest = `${shiftMonth(today.slice(0, 7), -(MONTHS_BACK - 1))}-01`;
  const newest = addDays(today, AHEAD_DAYS);
  const view: View = sp.v === 'month' ? 'month' : sp.v === 'week' ? 'week' : defaultView;
  const okDate = (x?: string) => (x && /^\d{4}-\d{2}-\d{2}$/.test(x) && x >= oldest && x <= newest ? x : null);
  const picked = okDate(sp.d) ?? today;
  const ym = view === 'month' && isYearMonth(sp.m) && sp.m >= oldest.slice(0, 7) && sp.m <= newest.slice(0, 7) ? sp.m : picked.slice(0, 7);
  const month = monthRange(ym);
  const from = view === 'week' ? weekStartOf(picked) : weekStartOf(month.from);
  const to = view === 'week' ? addDays(from, 6) : addDays(weekStartOf(month.to), 6);

  const [data, { data: hol }] = await Promise.all([loadPeriod(from, to, OFFICE.practiceMode), createAdminClient().from('holidays').select('the_date, label, kind').gte('the_date', from).lte('the_date', to)]);
  const holName = new Map((hol ?? []).filter((h) => h.kind !== 'weekly_rest').map((h) => [h.the_date as string, h.label as string]));
  const upTo = to < today ? to : today;
  const rows = data.rule && from <= upTo ? daysFor(data, me.id, from, upTo) : [];
  const rowOf = new Map(rows.map((r) => [r.workDate, r]));
  const leave = leaveDaysFor(data, me.id);
  const otOf = new Map(data.overtime.filter((o) => o.employeeId === me.id).map((o) => [o.workDate, o]));
  const corr = data.corrections.filter((c) => c.employeeId === me.id);
  const evs = data.events.filter((e) => e.employeeId === me.id);

  const hm = (d: Date) => f.dateTime(d, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const dur = (min: number) => t('dur', { h: Math.floor(min / 60), m: min % 60 });
  const leaveMin = (d: string) => Math.round((leave.get(d) ?? []).reduce((a, x) => a + x.unit, 0) * 8 * 60);

  const info = (d: string) => {
    const r = rowOf.get(d);
    const rule = data.ruleFor(me.id, d) ?? data.rule;
    const dayType = r?.dayType ?? (rule ? resolveDayType(d, rule, data.holidays) : 'workday');
    const pairs = r?.pairs ?? [];
    const ins = pairs.map((p) => p.in).filter((x): x is Date => !!x).sort((a, b) => a.getTime() - b.getTime());
    const outs = pairs.map((p) => p.out).filter((x): x is Date => !!x).sort((a, b) => a.getTime() - b.getTime());
    const firstIn = ins[0];
    const open = pairs.some((p) => p.in && !p.out);
    const late = firstIn && dayType === 'workday' && rule && !r?.deemed ? judgeLateness({ punchedAt: firstIn, workDate: d, rule, isHoliday: false }).verdict === 'late' : false;
    const lv = leave.get(d) ?? [];
    const fullLeave = lv.reduce((a, x) => a + x.unit, 0) >= 1;
    return { d, r, rule, dayType, pairs, firstIn, lastOut: open ? undefined : outs.at(-1), open, live: open && d === today, late, lv, fullLeave, ot: otOf.get(d), otMin: r ? r.overtimeMinutes + r.holidayMinutes : 0, plan: data.planFor(me.id, d).items, holiday: holName.get(d) ?? null, corrected: corr.some((c) => c.workDate === d && c.status === 'approved') };
  };
  type Info = ReturnType<typeof info>;
  const remaining = (x: Info) => x.dayType === 'workday' && !x.fullLeave && (x.d > today || (x.d === today && (!x.firstIn || x.open)));

  // 날짜 칸 안 표시 (주간 칸 · 월간 칸 공용)
  const chips = (x: Info) => (
    <div className="flex flex-col items-start gap-1 text-sm">
      {x.r && x.firstIn && !x.live && x.r.netMinutes > 0 && <span className="num rounded-chip bg-primary-tint px-1.5 text-xs font-bold text-primary">{dur(x.r.netMinutes)}</span>}
      {x.live && <span className="rounded-chip bg-primary-tint px-1.5 text-xs font-bold text-primary">{t('working')}</span>}
      {x.firstIn && (
        <span className="num flex items-center gap-1.5">
          <span className="rounded-chip bg-primary-tint px-1 text-xs text-primary">{t('in')}</span>
          <span className={x.late ? 'font-semibold text-danger' : ''}>{hm(x.firstIn)}</span>
        </span>
      )}
      {x.lastOut && (
        <span className="num flex items-center gap-1.5">
          <span className="rounded-chip bg-surface px-1 text-xs text-muted">{t('out')}</span>
          {hm(x.lastOut)}
        </span>
      )}
      {x.open && !x.live && <span className="text-xs font-semibold text-warn">{t('noOut')}</span>}
      {x.otMin > 0 && (
        <span className="num flex items-center gap-1 text-xs">
          <span aria-hidden className={`h-3 w-1 rounded-chip ${x.ot?.status === 'approved' ? 'bg-primary' : x.ot?.status === 'rejected' ? 'bg-border' : 'bg-chart-extra'}`} />
          {t('otLine', { t: dur(x.otMin), state: t(`otState.${x.ot?.status ?? 'pending'}`) })}
        </span>
      )}
      {x.corrected && <span className="rounded-chip bg-surface px-1.5 text-xs text-muted">{t('corrected')}</span>}
      {x.lv.map((l) => (
        <span key={l.requestId} className="rounded-chip bg-primary-tint px-1.5 text-xs font-semibold text-primary">
          {leaveTypeName(data.leaveTypes, l.typeCode, tl)}
        </span>
      ))}
      {!x.firstIn && x.dayType === 'holiday' && !x.holiday && <span className="rounded-chip bg-primary-tint px-1.5 text-xs text-primary">{t('off')}</span>}
      {/* 앞날: 그날 일정 시각(흐리게). 쉬는 날에 넣은 특근 같은 일정도 보인다 */}
      {!x.firstIn && !x.fullLeave && x.d >= today && (x.dayType === 'workday' || x.plan.some((p) => p.source === 'shift')) &&
        x.plan.map((p) => (
          <span key={`${p.shiftId ?? p.source}${p.startTime}`} className="num flex flex-wrap items-center gap-1 text-xs text-faint">
            {`${hhmm(p.startTime)} - ${hhmm(p.endTime)}`}
            {p.kind !== 'none' && <span className="rounded-chip bg-warn-tint px-1 text-warn">{tk(p.kind)}</span>}
          </span>
        ))}
    </div>
  );

  // 폰 한 줄: 출근 · 퇴근 · 오른쪽에 초과/이슈만 (2026-10-27 의뢰인: 같은 내용이 여러 번 보이지 않게)
  const phoneRow = (x: Info) => {
    const planned = !x.firstIn && !x.fullLeave && x.d >= today && (x.dayType === 'workday' || x.plan.some((p) => p.source === 'shift'));
    const tags: { k: string; text: string; cls: string }[] = [];
    if (x.late) tags.push({ k: 'late', text: t('late'), cls: 'bg-danger-tint text-danger' });
    if (x.open && !x.live) tags.push({ k: 'noOut', text: t('noOut'), cls: 'bg-warn-tint text-warn' });
    if (x.otMin > 0) tags.push({ k: 'ot', text: t('otShort', { t: dur(x.otMin), state: t(`otState.${x.ot?.status ?? 'pending'}`) }), cls: x.ot?.status === 'approved' ? 'bg-primary-tint text-primary' : 'bg-warn-tint text-warn' });
    for (const l of x.lv) tags.push({ k: l.requestId, text: leaveTypeName(data.leaveTypes, l.typeCode, tl), cls: 'bg-primary-tint text-primary' });
    if (!x.firstIn && x.dayType === 'holiday' && !x.holiday) tags.push({ k: 'off', text: t('off'), cls: 'bg-surface text-muted' });
    if (x.corrected) tags.push({ k: 'corr', text: t('corrected'), cls: 'bg-surface text-muted' });
    return (
      <span className="num flex min-w-0 flex-1 items-center gap-3 text-sm lg:hidden">
        {x.firstIn ? (
          <>
            <span className={`w-12 shrink-0 ${x.late ? 'font-semibold text-danger' : ''}`}>{hm(x.firstIn)}</span>
            <span className="w-12 shrink-0">{x.lastOut ? hm(x.lastOut) : x.live ? <span className="text-xs font-semibold text-primary">{t('working')}</span> : '–'}</span>
          </>
        ) : planned ? (
          <span className="shrink-0 text-xs text-faint">{x.plan.map((p) => `${hhmm(p.startTime)} - ${hhmm(p.endTime)}`).join(' · ')}</span>
        ) : (
          <span className="text-faint">–</span>
        )}
        <span className="ml-auto flex flex-wrap justify-end gap-1">
          {tags.map((g) => (
            <span key={g.k} className={`rounded-chip px-1.5 text-xs font-semibold ${g.cls}`}>
              {g.text}
            </span>
          ))}
        </span>
      </span>
    );
  };

  const q = (o: Record<string, string>) => `${base}?${new URLSearchParams(o)}`;
  const prevHref = view === 'week' ? (addDays(from, -1) >= oldest ? q({ v: 'week', d: addDays(from, -7) }) : null) : ym > oldest.slice(0, 7) ? q({ v: 'month', m: shiftMonth(ym, -1) }) : null;
  const nextHref = view === 'week' ? (addDays(from, 7) <= newest ? q({ v: 'week', d: addDays(from, 7) }) : null) : ym < newest.slice(0, 7) ? q({ v: 'month', m: shiftMonth(ym, 1) }) : null;
  const rangeLabel = view === 'week' ? <><span className="lg:hidden">{`${from.slice(5).replace('-', '.')} ~ ${to.slice(5).replace('-', '.')}`}</span><span className="hidden lg:inline">{`${from} ~ ${to}`}</span></> : f.dateTime(new Date(`${ym}-15T12:00:00+09:00`), { year: 'numeric', month: 'long' });
  const ruleNow = data.ruleFor(me.id, picked) ?? data.rule;
  const arrow = 'flex size-11 items-center justify-center rounded-button text-text hover:bg-surface lg:size-9';

  // ── 요약 ──
  const days7 = [...Array(7)].map((_, i) => info(addDays(from, i)));
  const sumOf = (xs: Info[]) => {
    const net = xs.reduce((a, x) => a + (x.r && !x.live ? x.r.netMinutes : 0), 0);
    const regular = xs.reduce((a, x) => a + (x.r && !x.live ? x.r.regularMinutes : 0), 0);
    const lvMin = xs.reduce((a, x) => a + leaveMin(x.d), 0);
    const otApproved = xs.reduce((a, x) => a + (x.ot?.status === 'approved' ? (x.ot.approvedMinutes ?? x.ot.overtimeMinutes) + (x.ot.approvedHolidayMinutes ?? x.ot.holidayMinutes) : 0), 0);
    const otPending = xs.reduce((a, x) => a + (x.ot?.status === 'approved' ? 0 : x.otMin), 0);
    const workdays = xs.filter((x) => x.dayType === 'workday' && !x.fullLeave);
    return { net, regular, lvMin, otApproved, otPending, left: workdays.filter(remaining).length, all: workdays.length };
  };
  const stat = (label: string, value: ReactNode, sub?: ReactNode, tone = '') => (
    <div className="flex flex-col gap-1">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`num text-xl font-semibold lg:text-2xl ${tone}`}>
        {typeof value === 'string' || typeof value === 'number' ? <CountUp value={value} /> : value}
        {sub && <span className="text-sm font-normal text-faint">{sub}</span>}
      </dd>
    </div>
  );

  let body: ReactNode;
  if (view === 'week') {
    const s = sumOf(days7);
    const sel = info(days7.some((x) => x.d === picked) ? picked : from);
    const leftStd = Math.max(0, STD_WEEK - s.regular - s.lvMin);
    const limit = OFFICE.weeklyLimitHours * 60;
    const pct = (m: number) => `${Math.min(100, (m / limit) * 100)}%`;
    // 고른 날 00~24시 막대: 근무(낮 · 야간 나눔) · 휴게 · 예정 일정
    const dayStart = kstDateTime(sel.d, '00:00').getTime();
    const minOf = (at: Date) => Math.max(0, Math.min(1440, Math.round((at.getTime() - dayStart) / 60000)));
    const nowMin = minOf(new Date());
    const work: { s: number; e: number; night: boolean }[] = [];
    for (const p of sel.pairs) {
      if (!p.in) continue;
      const s0 = minOf(p.in);
      const e0 = p.out ? minOf(p.out) : sel.live ? nowMin : s0;
      const cuts = [s0, ...[360, 1320].filter((c) => c > s0 && c < e0), e0];
      for (let i = 0; i < cuts.length - 1; i++) if (cuts[i + 1] > cuts[i]) work.push({ s: cuts[i], e: cuts[i + 1], night: cuts[i] < 360 || cuts[i] >= 1320 });
    }
    const toMin = (x: string) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3, 5));
    const breaks = sel.rule ? [...(sel.rule.breakStart && sel.rule.breakEnd ? [{ start: sel.rule.breakStart, end: sel.rule.breakEnd }] : []), ...(sel.rule.extraBreaks ?? [])] : [];
    const brk = breaks.flatMap((b) => work.map((w) => ({ s: Math.max(w.s, toMin(b.start)), e: Math.min(w.e, toMin(b.end)) })).filter((x) => x.e > x.s));
    const plans = sel.fullLeave ? [] : sel.plan.map((p) => ({ s: toMin(p.startTime), e: toMin(p.endTime) > toMin(p.startTime) ? toMin(p.endTime) : 1440 }));
    const bar = (x: { s: number; e: number }) => ({ left: `${(x.s / 1440) * 100}%`, width: `${((x.e - x.s) / 1440) * 100}%` });
    const log = [
      ...evs.filter((e) => e.workDate === sel.d).map((e) => ({ at: e.punchedAt.getTime(), text: t(e.kind === 'in' ? 'logIn' : 'logOut', { time: hm(e.punchedAt) }) })),
      ...corr.filter((c) => c.workDate === sel.d).map((c) => ({ at: Date.parse(c.createdAt), text: t('logCorr', { state: t(`reqState.${c.status}`) }) })),
      ...(sel.ot ? [{ at: Number.MAX_SAFE_INTEGER, text: t('logOt', { t: dur(sel.otMin), state: t(`otState.${sel.ot.status}`) }) }] : []),
    ].sort((a, b) => a.at - b.at);

    body = (
      <>
        <section className="grid gap-4 rounded-card border border-border bg-bg p-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)_minmax(0,3fr)] lg:divide-x lg:divide-border lg:p-6" data-week-summary>
          <div className="flex flex-col gap-2 lg:pr-6">
            <p className="font-bold">
              {t('weekSum')} <CountUp value={dur(s.net)} className="num text-primary" />
            </p>
            <p className="text-xs text-muted">{leftStd > 0 ? t('needMore', { left: dur(leftStd) }) : t('reached')}</p>
            <div className="relative mt-1 h-2 rounded-chip bg-surface">
              <span className="fx-grow-x absolute inset-y-0 left-0 rounded-chip bg-primary" style={{ width: pct(Math.min(s.net, STD_WEEK)) }} />
              {s.net > STD_WEEK && <span className="fx-grow-x absolute inset-y-0 rounded-chip bg-chart-extra" style={{ left: pct(STD_WEEK), width: pct(s.net - STD_WEEK), animationDelay: '1400ms' }} />}
              <span aria-hidden className="absolute -inset-y-1 border-l-2 border-dotted border-text" style={{ left: pct(STD_WEEK) }} />
            </div>
            <div className="num relative h-4 text-xs text-faint">
              <span className="absolute -translate-x-1/2" style={{ left: pct(STD_WEEK) }}>
                {t('hours', { n: 40 })}
              </span>
              <span className="absolute right-0">{t('hours', { n: OFFICE.weeklyLimitHours })}</span>
            </div>
          </div>
          <dl className="hidden grid-cols-2 gap-3 lg:grid lg:px-6">
            {stat(t('leftDays'), <CountUp value={t('days', { n: s.left })} className="text-primary" />, t('ofDays', { n: s.all }))}
            {stat(t('leftHours'), <CountUp value={dur(leftStd)} className="text-primary" />, t('ofHours', { n: 40 }))}
          </dl>
          <dl className="hidden grid-cols-2 gap-3 lg:grid lg:pl-6">
            {stat(t('total'), dur(s.net))}
            {stat(t('leave'), dur(s.lvMin))}
          </dl>
        </section>

        <section className="overflow-hidden rounded-card border border-border bg-bg">
          <ol className="grid divide-y divide-border lg:grid-cols-7 lg:divide-y-0" data-week-days>
            <li aria-hidden className="flex gap-3 bg-surface px-4 py-2 text-xs text-muted lg:hidden">
              <span className="w-16 shrink-0">{t('colDay')}</span>
              <span className="w-12 shrink-0">{t('colIn')}</span>
              <span className="w-12 shrink-0">{t('colOut')}</span>
              <span className="ml-auto">{t('colIssue')}</span>
            </li>
            {days7.map((x) => {
              const on = x.d === sel.d;
              return (
                <li key={x.d}>
                  <Link
                    href={q({ v: 'week', d: x.d })}
                    scroll={false}
                    aria-current={on ? 'date' : undefined}
                    className={`flex h-full gap-3 px-4 py-3 max-lg:items-center lg:min-h-32 lg:flex-col lg:gap-2 lg:px-3 ${on ? 'bg-primary-tint' : 'hover:bg-surface'}`}
                  >
                    <span className="flex w-16 shrink-0 flex-col gap-0.5 lg:w-auto">
                      <span className="num flex items-center gap-1 text-sm">
                        <span className={x.holiday || x.dayType === 'holiday' ? 'text-danger' : 'text-muted'}>{f.dateTime(new Date(`${x.d}T12:00:00+09:00`), { weekday: 'short' })}</span>
                        <span className={`inline-flex min-w-6 justify-center rounded-chip font-bold ${x.d === today ? 'bg-text text-on-primary' : x.holiday ? 'text-danger' : ''}`}>{Number(x.d.slice(8))}</span>
                      </span>
                      {x.holiday && <span className="truncate text-xs text-danger">{x.holiday}</span>}
                    </span>
                    {phoneRow(x)}
                    <span className="hidden lg:block">{chips(x)}</span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="rounded-card border border-border bg-bg" data-day-detail>
          <div className="flex flex-wrap items-start gap-x-8 gap-y-3 border-b border-border px-4 py-4 lg:px-6">
            <p className="num flex-1 font-bold lg:w-auto lg:flex-none">{f.dateTime(new Date(`${sel.d}T12:00:00+09:00`), { month: 'long', day: 'numeric', weekday: 'short' })}</p>
            <dl className="num order-3 grid basis-full grid-cols-2 gap-x-8 gap-y-3 text-sm lg:order-none lg:flex lg:flex-1 lg:basis-auto lg:flex-wrap">
              {(
                [
                  ['dStart', sel.firstIn ? hm(sel.firstIn) : '–'],
                  ['dEnd', sel.lastOut ? hm(sel.lastOut) : sel.live ? t('working') : '–'],
                  ['dTotal', sel.r && !sel.live ? dur(sel.r.netMinutes) : '–'],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className={`flex flex-col gap-1 ${k === 'dTotal' ? '' : 'max-lg:hidden'}`}>
                  <dt className="text-xs text-faint">{t(k)}</dt>
                  <dd className="font-semibold">{v}</dd>
                </div>
              ))}
              <div className="col-span-2 flex flex-col gap-1 max-lg:hidden">
                <dt className="text-xs text-faint">{t('dDetail')}</dt>
                <dd>{sel.r && !sel.live ? t('dDetailValue', { r: dur(sel.r.regularMinutes), o: dur(sel.otMin), e: dur(sel.r.overtimeMinutes), h: dur(sel.r.holidayMinutes), n: dur(sel.r.nightMinutes) }) : '–'}</dd>
              </div>
            </dl>
            <Link href={`/punch/corrections?new=1&date=${sel.d}`} className="inline-flex h-9 items-center gap-1.5 rounded-button border border-border px-3 text-sm font-semibold hover:bg-surface">
              <Pencil aria-hidden size={14} />
              {t('fix')}
            </Link>
          </div>
          {sel.ot?.status === 'pending' && (
            <div className="border-b border-border px-4 py-3 lg:px-6">
              <ReasonForm id={sel.ot.id} initial={sel.ot.reason} />
            </div>
          )}
          <div className="grid lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="px-4 py-4 lg:px-6" data-timeline>
              <div className="num relative h-5 text-xs text-faint">
                {[...Array(24)].map((_, h) => (
                  <span key={h} className={`absolute -translate-x-1/2 ${h % 3 === 0 ? '' : 'max-lg:hidden'}`} style={{ left: `${((h + 0.5) / 24) * 100}%` }}>
                    {String(h).padStart(2, '0')}
                  </span>
                ))}
              </div>
              <div className="relative mt-1 flex h-20 flex-col justify-center gap-1.5 border-y border-border">
                {[...Array(23)].map((_, h) => (
                  <span key={h} aria-hidden className="absolute inset-y-0 border-l border-dashed border-border" style={{ left: `${((h + 1) / 24) * 100}%` }} />
                ))}
                <div className="relative h-2">
                  {plans.map((x, i) => (
                    <span key={i} className="fx-grow-x absolute inset-y-0 rounded-chip bg-primary-tint" style={bar(x)} />
                  ))}
                </div>
                <div className="relative h-6">
                  {sel.fullLeave && <span className="absolute inset-0 rounded-button bg-primary-tint" />}
                  {work.map((x, i) => (
                    <span key={i} className={`fx-grow-x absolute inset-y-0 ${x.night ? 'bg-chart-extra' : 'bg-primary'}`} style={{ ...bar(x), animationDelay: '500ms' }} />
                  ))}
                  {brk.map((x, i) => (
                    <span key={`b${i}`} className="absolute inset-y-0 bg-border" style={bar(x)} />
                  ))}
                </div>
              </div>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 pt-3 text-xs text-muted">
                {(
                  [
                    ['bg-primary', 'lgWork'],
                    ['bg-border', 'lgBreak'],
                    ['bg-chart-extra', 'lgNight'],
                    ['bg-primary-tint', 'lgPlan'],
                  ] as const
                ).map(([c, k]) => (
                  <li key={k} className="flex items-center gap-1.5">
                    <span aria-hidden className={`size-2.5 rounded-chip ${c}`} />
                    {t(k)}
                  </li>
                ))}
              </ul>
            </div>
            <div className={`border-t border-border bg-surface px-4 py-4 lg:border-t-0 lg:border-l lg:px-5 ${log.length === 0 ? 'max-lg:hidden' : ''}`} data-day-log>
              <p className="text-sm font-bold">{t('dLog')}</p>
              {log.length === 0 ? (
                <p className="py-6 text-center text-sm text-faint">{t('dLogNone')}</p>
              ) : (
                <ul className="num flex flex-col gap-1.5 pt-2 text-sm">
                  {log.map((l, i) => (
                    <li key={i}>{l.text}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      </>
    );
  } else {
    const inMonth = (d: string) => d >= month.from && d <= month.to;
    const weeks = [...Array(Math.round((Date.parse(to) - Date.parse(from)) / 86400e3 + 1) / 7)].map((_, w) => [...Array(7)].map((_, i) => info(addDays(from, w * 7 + i))));
    const s = sumOf(weeks.flat().filter((x) => inMonth(x.d)));
    body = (
      <>
        <section className="grid grid-cols-2 gap-4 rounded-card border border-border bg-bg p-4 sm:grid-cols-3 lg:flex lg:justify-between lg:p-6" data-month-summary>
          <dl className="contents">
            {stat(t('total'), dur(s.net))}
            {stat(t('leave'), dur(s.lvMin))}
            {stat(t('regular'), dur(s.regular))}
            {stat(t('otPending'), dur(s.otPending), undefined, s.otPending > 0 ? 'text-danger' : '')}
            {stat(t('otApproved'), dur(s.otApproved))}
            {stat(t('leftDays'), <CountUp value={t('days', { n: s.left })} className="text-primary" />, t('ofDays', { n: s.all }))}
          </dl>
        </section>
        <section className="overflow-hidden rounded-card border border-border bg-bg" data-month-grid>
          <div className="grid grid-cols-7 border-b border-border text-xs text-muted lg:grid-cols-[8rem_repeat(7,minmax(0,1fr))]">
            <span className="hidden px-3 py-2 font-semibold text-text lg:block">{t('weekCol')}</span>
            {days7.map((x) => (
              <span key={x.d} className={`px-2 py-2 text-center lg:text-left ${isoDow(x.d) === 7 ? 'text-danger' : ''}`}>
                {f.dateTime(new Date(`${x.d}T12:00:00+09:00`), { weekday: 'short' })}
              </span>
            ))}
          </div>
          {weeks.map((w) => (
            <div key={w[0].d} className="grid grid-cols-7 border-b border-border last:border-b-0 lg:grid-cols-[8rem_repeat(7,minmax(0,1fr))]">
              <span className="num hidden border-r border-border px-3 py-2 text-sm font-bold lg:block">{dur(sumOf(w).net)}</span>
              {w.map((x) => {
                const dim = !inMonth(x.d);
                const red = x.holiday || isoDow(x.d) === 7;
                return (
                  <Link key={x.d} href={q({ v: 'week', d: x.d })} className={`flex min-h-16 flex-col gap-1 px-1 py-1.5 hover:bg-surface lg:min-h-32 lg:px-2 ${dim ? 'opacity-40' : ''}`}>
                    <span className={`num self-center text-sm lg:self-start ${x.d === today ? 'rounded-chip bg-text px-1.5 font-bold text-on-primary' : red ? 'text-danger' : ''}`}>{Number(x.d.slice(8))}</span>
                    {x.holiday && <span className="truncate text-center text-xs text-danger lg:text-left">{x.holiday}</span>}
                    {/* 폰: 근무 시간 숫자와 점만 · PC: 주간과 같은 표시 */}
                    <span className="flex flex-col items-center gap-0.5 lg:hidden">
                      {x.r && x.firstIn && !x.live && x.r.netMinutes > 0 && <span className="num text-xs font-semibold text-primary">{t('hShort', { n: Math.round((x.r.netMinutes / 60) * 10) / 10 })}</span>}
                      <span className="flex gap-0.5">
                        {x.late && <span aria-hidden className="size-1.5 rounded-chip bg-danger" />}
                        {x.otMin > 0 && <span aria-hidden className="size-1.5 rounded-chip bg-warn" />}
                        {x.lv.length > 0 && <span aria-hidden className="size-1.5 rounded-chip bg-primary" />}
                        {x.open && !x.live && <span aria-hidden className="size-1.5 rounded-chip bg-warn" />}
                      </span>
                    </span>
                    <span className="hidden lg:block">{chips(x)}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </section>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-muted lg:hidden">
          {(
            [
              ['bg-danger', 'dotLate'],
              ['bg-warn', 'dotOt'],
              ['bg-primary', 'dotLeave'],
            ] as const
          ).map(([c, k]) => (
            <li key={k} className="flex items-center gap-1.5">
              <span aria-hidden className={`size-2 rounded-chip ${c}`} />
              {t(k)}
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-3 lg:gap-4" data-my-attendance={view}>
      <div className="flex items-center justify-between gap-2 lg:grid lg:grid-cols-[1fr_auto_1fr]">
        <h1 className="hidden text-xl font-bold lg:block">{t('title')}</h1>
        <nav aria-label={t('range')} className="flex min-w-0 items-center gap-0.5 lg:justify-center lg:gap-1">
          {prevHref ? (
            <Link href={prevHref} aria-label={t('prev')} className={arrow}>
              <ChevronLeft aria-hidden size={20} />
            </Link>
          ) : (
            <span className="size-11 lg:size-9" />
          )}
          <Link href={q(view === 'week' ? { v: 'week' } : { v: 'month' })} title={t('today')} aria-label={`${t('today')}: ${view === 'week' ? `${from} ~ ${to}` : ym}`} className="num min-w-0 rounded-button px-1 text-center text-base font-semibold hover:bg-surface lg:text-2xl">
            {rangeLabel}
          </Link>
          {nextHref ? (
            <Link href={nextHref} aria-label={t('next')} className={arrow}>
              <ChevronRight aria-hidden size={20} />
            </Link>
          ) : (
            <span className="size-11 lg:size-9" />
          )}
        </nav>
        <div role="tablist" aria-label={t('views')} className="grid shrink-0 grid-cols-2 rounded-button border border-border bg-bg p-0.5 text-sm lg:justify-self-end">
          {(['week', 'month'] as const).map((v) => (
            <Link
              key={v}
              role="tab"
              aria-selected={view === v}
              href={v === 'week' ? q({ v: 'week', d: view === 'month' ? (ym === today.slice(0, 7) ? today : month.from) : picked }) : q({ v: 'month', m: view === 'week' ? picked.slice(0, 7) : ym })}
              className={`inline-flex min-h-9 items-center justify-center rounded-button px-3 lg:px-4 ${view === v ? 'bg-surface font-bold text-text' : 'text-muted'}`}
            >
              {t(v)}
            </Link>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        {ruleNow && <span className="text-muted">{t('ruleLine', { from: hhmm(ruleNow.startTime), to: hhmm(ruleNow.endTime) })}</span>}
        <span className="ml-auto flex flex-wrap items-center gap-x-4">
          {extra}
          <Link href="/punch/requests" className="inline-flex min-h-9 items-center gap-1 text-text hover:text-primary">
            <History aria-hidden size={16} />
            {t('history')}
          </Link>
        </span>
      </div>
      {!data.rule && <p className="rounded-card bg-bg p-4 text-sm text-faint">{t('noRule')}</p>}
      {body}
    </div>
  );
}
