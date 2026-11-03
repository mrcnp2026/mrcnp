// 근태 점검 — 확인 필요 항목을 담당자가 근거를 보고 그 자리에서 처리한다 (결정 급여-69 · 급여-70 · 급여-71, 루트 문서 「근태 점검 — 확인 필요 항목 처리 흐름과 담당자 배정」).
// 항목은 저장하지 않고 근태 기록으로 그때그때 계산한다(lib/attendance-check). 담당자의 판단만 attendance_check_reviews에 남는다.
// 한눈에 (2026-11-03 의뢰인: 「스크롤을 계속 내려야 해, 한눈에 딱 들어오게」): 왼쪽 = 직원 한 줄 + 그달 날짜 칸(색 = 상태), 오른쪽 = 고른 직원의 남은 항목만.
//   폰은 직원 목록 → 누르면 그 직원 항목(뒤로 가기). 사유 칩으로 유형을 거른다. 대표자는 보기만 한다.
import { ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { HelpTip } from '@/components/Help';
import { PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { adminPage } from '@/lib/admin-gate';
import { CHECK_KINDS, countDays, type CheckKind, type DayCheck, type MonthKind } from '@/lib/attendance-check';
import { collectChecks, loadEarlyIgnoreAt, loadPatternMinEarly } from '@/lib/attendance-check-data';
import { loadCheckReviews, monthKey, reviewState } from '@/lib/attendance-check-reviews';
import { addDays } from '@/lib/calendar';
import { getMe } from '@/lib/auth';
import { confirmKey, loadConfirms } from '@/lib/confirm-data';
import { leaveTypeName } from '@/lib/leave';
import { monthRange } from '@/lib/month-data';
import { groupPath } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { daysFor, loadPeriod } from '@/lib/period-data';
import { toKstDate } from '@/lib/time';
import { Board } from './Board';
import { ConfirmAll, DayActions, MonthActions, type DayCtx } from './CheckActions';

const shift = (ym: string, by: number) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
};
const STATES = ['open', 'confirm', 'handled', 'all'] as const;
type View = (typeof STATES)[number];
const MONTH_KINDS = ['schedule_check', 'early_bundle'] as const;
const hm = (d: Date) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(11, 16);

export default async function AttendanceCheckPage({ searchParams }: { searchParams: Promise<{ m?: string; e?: string; s?: string; k?: string; live?: string }> }) {
  await adminPage();
  const [t, tl, f, sp, me] = await Promise.all([getTranslations('admin.attendanceCheck'), getTranslations('leave'), getFormatter(), searchParams, getMe()]);
  const today = toKstDate(new Date());
  const thisMonth = today.slice(0, 7);
  // 기본은 지난달 — 점검은 달이 끝난 뒤 마감 전에 한다. 이번 달도 고를 수 있다(지난 날까지)
  const month = /^\d{4}-\d{2}$/.test(sp.m ?? '') && sp.m! <= thisMonth ? sp.m! : shift(thisMonth, -1);
  const practice = OFFICE.practiceMode && sp.live !== '1';
  const view: View = (STATES as readonly string[]).includes(sp.s ?? '') ? (sp.s as View) : 'open';
  const kindFilter = sp.k && ([...CHECK_KINDS, ...MONTH_KINDS] as string[]).includes(sp.k) ? (sp.k as CheckKind | MonthKind) : null;
  const canAct = !!me && (me.role === 'admin' || me.role === 'manager') && me.adminLevel !== 'ceo';
  const { from, to } = monthRange(month);
  const upTo = to < today ? to : today;

  const [data, groups, earlyAt, patternMin, confirms, reviews] = await Promise.all([loadPeriod(from, to, practice), loadOrgGroups(), loadEarlyIgnoreAt(), loadPatternMinEarly(to), loadConfirms(from, to, practice), loadCheckReviews(from, to, practice)]);
  const checks = collectChecks(data, from, upTo, new Date(), earlyAt, patternMin);
  const person = new Map(data.people.map((p) => [p.id, p]));
  const dur = (min: number) => (min >= 60 ? (min % 60 ? t('hm', { h: Math.floor(min / 60), m: min % 60 }) : t('h', { h: min / 60 })) : t('min', { n: min }));
  const dayLabel = (d: string) => f.dateTime(new Date(`${d}T12:00:00+09:00`), { month: 'numeric', day: 'numeric', weekday: 'short' });
  const q = (o: { m?: string; e?: string | null; s?: View; k?: string | null }) => {
    const p = new URLSearchParams();
    p.set('m', o.m ?? month);
    const e = o.e === undefined ? sp.e : o.e;
    if (e) p.set('e', e);
    const s = o.s ?? view;
    if (s !== 'open') p.set('s', s);
    const k = o.k === undefined ? kindFilter : o.k;
    if (k) p.set('k', k);
    if (sp.live === '1') p.set('live', '1');
    return `/admin/attendance-check?${p}`;
  };

  // 무급 · 연차 시간 휴가 — 늦은 시간에 맞는 가장 짧은 것 (기록 화면 LateResolve와 같은 고르기)
  const hourTypes = data.leaveTypes.filter((lt) => lt.active !== false && typeof lt.hours === 'number' && lt.hours > 0 && lt.hours < 8 && !lt.startTime);
  const pickType = (min: number, paid: boolean) => {
    const lt = hourTypes.filter((x) => (paid ? x.isPaid && x.deductsBalance : !x.isPaid && !x.deductsBalance) && (x.hours ?? 0) * 60 >= min).sort((a, b) => (a.hours ?? 0) - (b.hours ?? 0))[0];
    return lt ? { code: lt.code, name: leaveTypeName(data.leaveTypes, lt.code, tl), hours: lt.hours ?? 0 } : null;
  };

  // 날 하나가 지금 보기에 들어가는가
  const live = (d: DayCheck) => d.parts.filter((x) => !x.quiet && !x.bundled);
  const showDay = (d: DayCheck, handled: boolean, changed: boolean) => {
    if (!d.state) return false;
    if (kindFilter && !live(d).some((p) => p.kind === kindFilter)) return false;
    const done = handled && d.state !== 'block';
    if (view === 'open') return !done && (d.state === 'block' || d.state === 'decide' || changed);
    if (view === 'confirm') return !done && d.state === 'confirm';
    if (view === 'handled') return done;
    return true;
  };

  const rows = checks
    .map((c) => {
      const st = reviewState(c.days, c.monthly, reviews.filter((r) => r.employeeId === c.employeeId));
      const n = countDays(c.days, st.handled, c.monthly);
      const shownDays = c.days.filter((d) => showDay(d, st.handled.has(d.workDate), st.changed.has(d.workDate)));
      const shownMonths = c.monthly.filter((m) => (kindFilter ? m.kind === kindFilter : true)).filter((m) => {
        const done = st.handled.has(monthKey(m));
        return view === 'all' || (view === 'handled' ? done : view === 'open' ? !done : false);
      });
      return { ...c, st, n, shownDays, shownMonths, open: n.block + n.decide + n.monthly };
    })
    .filter((r) => r.days.some((d) => d.state) || r.monthly.length)
    .sort((a, b) => b.open - a.open || (person.get(a.employeeId)?.name ?? '').localeCompare(person.get(b.employeeId)?.name ?? ''));
  const totals = rows.reduce((a, r) => ({ people: a.people + (r.open > 0 ? 1 : 0), block: a.block + r.n.block, decide: a.decide + r.n.decide + r.n.monthly, confirm: a.confirm + r.n.confirm }), { people: 0, block: 0, decide: 0, confirm: 0 });

  // 사유별 남은 건수 (막음 · 판단 필요인 날 + 한 달 1건) — 칩으로 거른다
  const kindCount = new Map<string, number>();
  for (const r of rows) {
    for (const d of r.days) {
      if (!(d.state === 'block' || (d.state === 'decide' && !r.st.handled.has(d.workDate)))) continue;
      for (const k of new Set(live(d).filter((p) => p.state !== 'confirm').map((p) => p.kind))) kindCount.set(k, (kindCount.get(k) ?? 0) + 1);
    }
    for (const m of r.monthly) if (!r.st.handled.has(monthKey(m))) kindCount.set(m.kind, (kindCount.get(m.kind) ?? 0) + 1);
  }
  const kindOrder = [...CHECK_KINDS, ...MONTH_KINDS].filter((k) => kindCount.get(k));

  // 이 보기에 걸리는 직원 — 고르기는 화면 안에서 바로(Board.tsx). 처음에는 아무도 고르지 않고 전체가 보인다
  const listed = rows.filter((r) => r.shownDays.length || r.shownMonths.length);

  // 그달 날짜 칸
  const dates: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) dates.push(d);
  // 칸 색 (2026-11-03 의뢰인: 색을 다 빼라는 게 아니라 뜻을 알게 해 달라 · 한 달 1건이 칸에 안 보인다) — 뜻은 목록 위 범례(Board)
  const worked = new Map(rows.map((r) => [r.employeeId, new Set(daysFor(data, r.employeeId, from, to).filter((d) => d.pairs.length).map((d) => d.workDate))]));
  const cellTone = (r: (typeof rows)[number], date: string) => {
    const d = r.days.find((x) => x.workDate === date);
    if (date > upTo) return 'border border-dashed border-border';
    if (d?.state === 'block') return 'bg-danger';
    if (d?.state === 'decide' && !r.st.handled.has(date)) return 'bg-warn';
    const monthOpen = r.monthly.some((m) => !r.st.handled.has(monthKey(m)));
    if (monthOpen && d?.parts.some((p) => p.bundled)) return 'bg-warn/45'; // 한 달 1건으로 묶인 날
    if (d?.state && r.st.handled.has(date)) return 'bg-ok';
    if (d?.state === 'confirm') return 'bg-primary/30'; // 승인된 날(연장 · 휴일근로 승인이 다 덮음)
    if (worked.get(r.employeeId)?.has(date)) return 'bg-border'; // 이상 없음
    return 'bg-surface'; // 쉬는 날 · 기록 없음
  };

  const ctxOf = (employeeId: string, d: DayCheck): DayCtx => {
    const plan = data.planFor(employeeId, d.workDate);
    const rule = plan.items.length && plan.rule ? plan.rule : null;
    const ot = data.overtime.find((o) => o.employeeId === employeeId && o.workDate === d.workDate) ?? null;
    const late = d.parts.find((p) => p.kind === 'late_in' && p.state === 'decide');
    const early = d.parts.find((p) => p.kind === 'early_out' && p.state === 'decide');
    const evening = d.parts.find((p) => p.kind === 'break_check');
    return {
      employeeId,
      date: d.workDate,
      confirmed: confirms.has(confirmKey(employeeId, d.workDate)),
      planStart: rule?.startTime.slice(0, 5) ?? null,
      planEnd: rule?.endTime.slice(0, 5) ?? null,
      late: late ? { minutes: late.minutes - late.covered, unpaid: pickType(late.minutes - late.covered, false), annual: pickType(late.minutes - late.covered, true) } : null,
      early: early ? { minutes: early.minutes - early.covered, unpaid: pickType(early.minutes - early.covered, false), annual: pickType(early.minutes - early.covered, true) } : null,
      evening: evening?.plan ? { start: evening.plan.split('–')[0], end: evening.plan.split('–')[1] } : null,
      overtime: ot ? { id: ot.id, status: ot.status, needsReview: !!ot.needsReview, recomputed: ot.recomputedOvertimeMinutes ?? null } : null,
      extraOpen: d.parts.some((p) => (p.kind === 'after_end' || p.kind === 'no_plan_work') && p.state === 'decide'),
      kinds: live(d).map((p) => p.kind),
      state: d.state,
      base: !!data.ruleAt(d.workDate),
      live: !practice,
    };
  };
  const partText = (p: DayCheck['parts'][number]) => {
    const name = `${t(`kind.${p.kind}`)}${p.minutes > 0 && p.kind !== 'break_check' ? ` ${dur(p.minutes)}` : ''}`;
    if (p.state === 'block' || p.minutes === 0 || p.kind === 'break_check') return { name, cover: null };
    return { name, cover: p.covered >= p.minutes ? t('cover.full') : p.covered > 0 ? t('cover.part', { c: dur(p.covered), r: dur(p.minutes - p.covered) }) : t('cover.none') };
  };

  // ── 화면 ──
  const head = (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="flex flex-wrap items-center gap-x-1 text-2xl font-bold">{t('title')}<HelpTip>{t('intro')}</HelpTip></h1>
        {!canAct && <p className="text-sm text-muted">{t('viewOnly')}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="inline-flex items-center">
          <Link href={q({ m: shift(month, -1), e: null })} aria-label={t('prev')} className="inline-flex size-11 items-center justify-center rounded-l-button border border-border bg-bg text-muted lg:size-9">
            <ChevronLeft aria-hidden size={18} />
          </Link>
          <span className="num -ml-px inline-flex h-11 items-center border border-border bg-bg px-4 font-bold lg:h-9">{month}</span>
          {month < thisMonth ? (
            <Link href={q({ m: shift(month, 1), e: null })} aria-label={t('next')} className="-ml-px inline-flex size-11 items-center justify-center rounded-r-button border border-border bg-bg text-muted lg:size-9">
              <ChevronRight aria-hidden size={18} />
            </Link>
          ) : (
            <span className="-ml-px inline-flex size-11 rounded-r-button border border-border bg-surface lg:size-9" />
          )}
        </span>
        <p className="num flex flex-wrap items-baseline gap-x-3 text-sm">
          {totals.block + totals.decide === 0 ? (
            <span className="font-bold text-ok">{t('allClear')}</span>
          ) : (
            <>
              <b className="text-base">{t('sumPeople', { n: totals.people })}</b>
              {totals.block > 0 && <span className="font-bold text-danger">{t('sumBlock', { n: totals.block })}</span>}
              <span className="font-bold text-warn">{t('sumDecide', { n: totals.decide })}</span>
              {totals.confirm > 0 && <span className="text-muted">{t('sumConfirm', { n: totals.confirm })}</span>}
            </>
          )}
        </p>
        <Link href={`/admin/closing?m=${month}${sp.live === '1' ? '&live=1' : ''}`} className="ml-auto inline-flex min-h-11 items-center rounded-button border border-border bg-bg px-3.5 text-sm font-semibold text-text hover:border-primary/40 lg:min-h-9">
          {t('toClosing')} ›
        </Link>
      </div>
      {/* 사유 칩 — 무엇이 몇 건 남았는지 한 줄에. 누르면 그 사유만. 화면 안 이동(Link)이 빠른 모드에서 넘어가지 않아 주소 이동으로 둔다 (2026-11-03) */}
      {kindOrder.length > 0 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0">
          {kindOrder.map((k) => (
            <a key={k} href={q({ k: kindFilter === k ? null : k, e: null })} aria-current={kindFilter === k ? 'true' : undefined}
              className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-chip px-3 text-sm lg:min-h-9 ${kindFilter === k ? 'bg-primary font-semibold text-on-primary' : 'border border-border bg-bg text-text hover:border-primary/40'}`}>
              {t(`kind.${k}`)}
              <span className={`num font-bold ${kindFilter === k ? '' : 'text-warn'}`}>{kindCount.get(k)}</span>
              {kindFilter === k && <X aria-hidden size={14} />}
            </a>
          ))}
        </div>
      )}
    </>
  );

  // 왼쪽: 보기 탭 · 날짜 눈금(목록 위) · 직원 한 줄(Board가 단추로 감싼다) · 색 뜻
  const listHead = (
    <>
      <div className="flex flex-wrap gap-1.5 pb-3">
        {STATES.map((s) => (
          <a key={s} href={q({ s, e: null })} aria-current={view === s ? 'page' : undefined} className={`inline-flex min-h-10 items-center rounded-chip px-3 text-sm font-semibold lg:min-h-8 ${view === s ? 'bg-text text-bg' : 'text-muted hover:text-text'}`}>
            {t(`view.${s}`)}
          </a>
        ))}
      </div>
    </>
  );
  const listAxis = listed.length > 0 ? (
        <span aria-hidden className="num grid gap-0.5 px-2 pb-1 text-xs leading-none text-faint" style={{ gridTemplateColumns: `repeat(${dates.length}, minmax(0, 1fr))` }}>
          {dates.map((d) => <span key={d} className="overflow-visible whitespace-nowrap">{[1, 8, 15, 22, 29].includes(Number(d.slice(8))) ? Number(d.slice(8)) : ''}</span>)}
        </span>
  ) : null;
  const rowOf = (r: (typeof rows)[number]) => {
    const p = person.get(r.employeeId)!;
    const openMonths = r.monthly.filter((m) => !r.st.handled.has(monthKey(m)));
    return (
      <span className="flex flex-col gap-1.5">
        <span className="flex items-baseline gap-2">
          <b>{p.name}</b>
          <span className="min-w-0 truncate text-xs text-muted">{groupPath(groups, p.groupId)}</span>
          <span className="num ml-auto flex shrink-0 items-baseline gap-2 text-sm">
            {r.n.block > 0 && <span className="font-bold text-danger">{t('cntBlock', { n: r.n.block })}</span>}
            {r.n.decide + r.n.monthly > 0 ? <span className="font-bold text-warn">{t('cntDecide', { n: r.n.decide + r.n.monthly })}</span> : r.n.block === 0 && <span className="text-ok">{t('cntClear')}</span>}
          </span>
        </span>
        <span aria-hidden className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${dates.length}, minmax(0, 1fr))` }}>
          {dates.map((d) => <span key={d} className={`h-3 rounded-xs ${cellTone(r, d)}`} />)}
        </span>
        {openMonths.map((m) => <span key={m.kind} className="text-xs text-warn">{m.kind === 'schedule_check' ? t('rowSchedule', { n: m.patternDays, span: m.fromMin === m.toMin ? t('min', { n: m.fromMin }) : t('minRange', { from: m.fromMin, to: m.toMin }) }) : t('rowEarly', { n: m.dates.length })}</span>)}
      </span>
    );
  };

  // 오른쪽: 직원 한 명의 항목 (아무도 안 골랐으면 모든 직원이 차례로)
  const detailOf = (sel: (typeof rows)[number]) => {
    const p = person.get(sel.employeeId)!;
    const spans = new Map<string, number>();
    for (const d of daysFor(data, sel.employeeId, from, upTo)) {
      const pl = data.planFor(sel.employeeId, d.workDate);
      if (pl.items.length && pl.rule) { const k = `${pl.rule.startTime.slice(0, 5)}–${pl.rule.endTime.slice(0, 5)}`; spans.set(k, (spans.get(k) ?? 0) + 1); }
    }
    const usual = [...spans].sort((a, b) => b[1] - a[1])[0]?.[0];
    const confirmLeft = sel.days.filter((d) => d.state === 'confirm' && !sel.st.handled.has(d.workDate)).length;
    const dayRows = daysFor(data, sel.employeeId, from, to);
    return (
      <section aria-label={p.name} className="flex flex-col">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border pb-2">
          <h2 className="text-lg font-bold">{p.name}</h2>
          <span className="text-sm text-muted">{[groupPath(groups, p.groupId), usual ? t('usual', { span: usual }) : null].filter(Boolean).join(' · ')}</span>
          <Link href={`/admin/records/${sel.employeeId}?m=${month}${sp.live === '1' ? '&live=1' : ''}`} className="ml-auto text-sm font-bold text-primary">{t('monthRecord')} ›</Link>
        </div>
        {sel.shownDays.length === 0 && sel.shownMonths.length === 0 && <p className="py-8 text-center text-sm text-muted">{t('emptyPerson')}</p>}
        <ul className="flex flex-col divide-y divide-border">
          {sel.shownMonths.map((m) => {
            const done = sel.st.handled.has(monthKey(m));
            const rv = sel.st.byKey.get(monthKey(m));
            return (
              <li key={m.kind} className="flex flex-col gap-1.5 py-3">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span aria-hidden className={`size-2 shrink-0 self-center rounded-full ${done ? 'bg-ok' : 'bg-warn'}`} />
                  <b>{t(`kind.${m.kind}`)}</b>
                  <span className="text-xs text-muted">{t('monthOne')}</span>
                </p>
                <p className="num pl-4 text-sm">
                  {m.kind === 'schedule_check'
                    ? t('scheduleCheckLine', { n: m.patternDays, of: m.workedDays, span: m.fromMin === m.toMin ? t('min', { n: m.fromMin }) : t('minRange', { from: m.fromMin, to: m.toMin }) })
                    : t('earlyBundleLine', { n: m.dates.length, from: dur(m.fromMin), to: dur(m.toMin) })}
                </p>
                <details className="group pl-4 text-sm">
                  <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1 text-muted [&::-webkit-details-marker]:hidden">
                    {t('dates', { n: m.dates.length })}
                    <ChevronDown aria-hidden size={14} className="transition-transform group-open:rotate-180" />
                  </summary>
                  <p className="num flex flex-wrap gap-x-3 gap-y-1 pt-1 text-muted">
                    {m.dates.map((d) => {
                      const part = sel.days.find((x) => x.workDate === d)?.parts.find((x) => x.kind === 'before_start');
                      return <Link key={d} href={`/admin/records/${sel.employeeId}/${d}${sp.live === '1' ? '?live=1' : ''}`} className="hover:text-primary">{dayLabel(d)} {part?.punched ?? ''}</Link>;
                    })}
                  </p>
                </details>
                <div className="pl-4">
                  {done && rv ? <p className="text-sm text-ok">{t(`decided.${rv.decision}`)}{rv.note ? ` — ${rv.note}` : ''}</p> : canAct && <MonthActions employeeId={sel.employeeId} month={month} kind={m.kind} live={!practice} />}
                </div>
              </li>
            );
          })}

          {sel.shownDays.map((d) => {
            const all = dayRows.find((x) => x.workDate === d.workDate);
            const plan = data.planFor(sel.employeeId, d.workDate);
            const span = plan.items.length && plan.rule ? `${plan.rule.startTime.slice(0, 5)}–${plan.rule.endTime.slice(0, 5)}` : null;
            const leaves = data.leaveRequests.filter((x) => x.employeeId === sel.employeeId && x.startDate <= d.workDate && d.workDate <= x.endDate && x.status !== 'rejected' && x.status !== 'cancelled');
            const ot = data.overtime.find((o) => o.employeeId === sel.employeeId && o.workDate === d.workDate);
            const waived = [...data.waivedFor(sel.employeeId, d.workDate)];
            const handled = sel.st.handled.has(d.workDate) && d.state !== 'block';
            const changed = sel.st.changed.has(d.workDate);
            const rv = sel.st.byKey.get(d.workDate);
            const tone = handled ? 'bg-ok' : d.state === 'block' ? 'bg-danger' : d.state === 'decide' ? 'bg-warn' : 'bg-primary/40';
            // 근거 한 줄: 일정 · 찍힘 · 계산(올림 · 내림 뒤) · 그날 요청
            const calc = live(d).filter((x) => x.punched && x.counted && x.punched !== x.counted).map((x) => t('calcShort', { punched: x.punched!, counted: x.counted! }));
            const evidence = [
              span ? t('planLine', { span }) : t('noPlan'),
              all?.pairs.length ? t('punchLine', { list: all.pairs.map((x) => `${x.in ? hm(x.in) : '--'}→${x.out ? hm(x.out) : '--'}`).join(', ') }) : t('noPunch'),
              ...calc,
              ...leaves.map((l) => `${leaveTypeName(data.leaveTypes, l.typeCode, tl)}${l.startTime ? ` ${l.startTime.slice(0, 5)}–${l.endTime?.slice(0, 5)}` : ''} ${t(`req.${l.status}`)}`),
              ...(ot ? [t('otLine', { status: t(`req.${ot.status}`), approved: dur(ot.status === 'approved' ? (ot.approvedMinutes ?? ot.overtimeMinutes) + (ot.approvedHolidayMinutes ?? ot.holidayMinutes) : 0) }) + (ot.needsReview && ot.recomputedOvertimeMinutes != null ? ` · ${t('otNow', { n: dur(ot.recomputedOvertimeMinutes) })}` : '')] : []),
              ...waived.map((w) => t('waivedLine', { start: w })),
            ];
            return (
              <li key={d.workDate} id={`d-${d.workDate}`} className="flex scroll-mt-24 flex-col gap-1 py-3">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span aria-hidden className={`size-2 shrink-0 self-center rounded-full ${tone}`} />
                  <Link href={`/admin/records/${sel.employeeId}/${d.workDate}${sp.live === '1' ? '?live=1' : ''}`} className="num font-bold hover:text-primary">{dayLabel(d.workDate)}</Link>
                  {/* 걸린 이유 — 사유마다 덮는 승인 */}
                  {live(d).map((x, i) => {
                    const pt = partText(x);
                    return (
                      <span key={i} className="inline-flex flex-wrap items-baseline gap-x-1 text-sm">
                        <span className={x.state === 'block' ? 'font-semibold text-danger' : x.state === 'decide' ? 'font-semibold text-text' : 'text-muted'}>{pt.name}</span>
                        {pt.cover && <span className={`text-xs ${x.covered >= x.minutes ? 'text-ok' : 'text-warn'}`}>{pt.cover}</span>}
                        {i < live(d).length - 1 && <span aria-hidden className="text-faint">·</span>}
                      </span>
                    );
                  })}
                  {(handled || changed) && <span className="text-xs text-muted">{handled ? t('state.handled') : t('state.changed')}</span>}
                </div>
                <p className="num pl-4 text-xs leading-relaxed text-muted">{evidence.join(' · ')}</p>
                {live(d).some((x) => x.kind === 'break_check') && <p className="pl-4 text-xs text-warn">{t('breakCheckWhy', { span: live(d).find((x) => x.kind === 'break_check')!.plan ?? '' })}</p>}
                {handled && rv ? (
                  <p className="pl-4 text-sm text-ok">{t(`decided.${rv.decision}`)}{rv.note ? ` — ${rv.note}` : ''}</p>
                ) : (
                  canAct && d.state !== 'confirm' && <DayActions ctx={ctxOf(sel.employeeId, d)} reviewId={changed ? rv?.id ?? null : null} />
                )}
              </li>
            );
          })}
        </ul>
        {canAct && confirmLeft > 0 && (view === 'confirm' || view === 'all') && <ConfirmAll employeeId={sel.employeeId} month={month} n={confirmLeft} />}
        {view === 'open' && confirmLeft > 0 && <Link href={q({ s: 'confirm' })} className="pt-3 text-sm text-muted hover:text-primary">{t('confirmLeft', { n: confirmLeft })} ›</Link>}
      </section>
    );
  };

  return (
    <PageShell wide>
      {head}
      <Board
        rows={listed.map((r) => ({ id: r.employeeId, row: rowOf(r), detail: detailOf(r) }))}
        initial={sp.e ?? null}
        head={listHead}
        axis={listAxis}
        empty={<p className="py-8 text-center text-sm text-muted">{t('empty')}</p>}
      />
    </PageShell>
  );
}
