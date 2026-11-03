// 근태 점검 — 확인 필요 항목을 담당자가 근거를 보고 그 자리에서 처리한다 (결정 급여-69 · 급여-70 · 급여-71, 루트 문서 「근태 점검 — 확인 필요 항목 처리 흐름과 담당자 배정」).
// 항목은 저장하지 않고 근태 기록으로 그때그때 계산한다(lib/attendance-check). 담당자의 판단만 attendance_check_reviews에 남는다.
// 한 줄 = 직원 하루 1건(사유 여러 개) · 한 달 1건(일정 확인 필요 · 일찍 출근 묶음). 대표자는 보기만 한다.
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
import { getMe } from '@/lib/auth';
import { confirmKey, loadConfirms } from '@/lib/confirm-data';
import { leaveTypeName } from '@/lib/leave';
import { monthRange } from '@/lib/month-data';
import { groupPath } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { daysFor, loadPeriod } from '@/lib/period-data';
import { toKstDate } from '@/lib/time';
import { ConfirmAll, DayActions, MonthActions, type DayCtx } from './CheckActions';

const shift = (ym: string, by: number) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
};
const STATES = ['open', 'confirm', 'handled', 'all'] as const;
type View = (typeof STATES)[number];
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
  const kindFilter = sp.k && ([...CHECK_KINDS, 'schedule_check', 'early_bundle'] as string[]).includes(sp.k) ? (sp.k as CheckKind | MonthKind) : null;
  const canAct = !!me && (me.role === 'admin' || me.role === 'manager') && me.adminLevel !== 'ceo';
  const { from, to } = monthRange(month);
  const upTo = to < today ? to : today;

  const [data, groups, earlyAt, patternMin, confirms] = await Promise.all([loadPeriod(from, to, practice), loadOrgGroups(), loadEarlyIgnoreAt(), loadPatternMinEarly(to), loadConfirms(from, to, practice)]);
  const checks = collectChecks(data, from, upTo, new Date(), earlyAt, patternMin);
  const reviews = await loadCheckReviews(from, to, practice);
  const person = new Map(data.people.map((p) => [p.id, p]));
  const dur = (min: number) => (min >= 60 ? t('hm', { h: Math.floor(min / 60), m: min % 60 }) : t('min', { n: min }));
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

  // 직원마다 남은 것 · 처리한 것
  const rows = checks
    .map((c) => {
      const st = reviewState(c.days, c.monthly, reviews.filter((r) => r.employeeId === c.employeeId));
      const n = countDays(c.days, st.handled, c.monthly);
      return { ...c, st, n };
    })
    .filter((r) => (sp.e ? r.employeeId === sp.e : true))
    .filter((r) => r.days.some((d) => d.state) || r.monthly.length);
  const totals = rows.reduce((a, r) => ({ people: a.people + (r.n.block + r.n.decide + r.n.monthly > 0 ? 1 : 0), block: a.block + r.n.block, decide: a.decide + r.n.decide + r.n.monthly, confirm: a.confirm + r.n.confirm }), { people: 0, block: 0, decide: 0, confirm: 0 });

  const showDay = (d: DayCheck, handled: boolean, changed: boolean) => {
    if (!d.state) return false;
    if (kindFilter && !d.parts.some((p) => p.kind === kindFilter && !p.quiet && !p.bundled)) return false;
    const done = handled && d.state !== 'block';
    if (view === 'open') return !done && (d.state === 'block' || d.state === 'decide' || changed);
    if (view === 'confirm') return !done && d.state === 'confirm';
    if (view === 'handled') return done;
    return true;
  };

  const ctxOf = (employeeId: string, d: DayCheck): DayCtx => {
    const plan = data.planFor(employeeId, d.workDate);
    const rule = plan.items.length && plan.rule ? plan.rule : null;
    const base = data.ruleAt(d.workDate);
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
      kinds: d.parts.filter((p) => !p.quiet && !p.bundled).map((p) => p.kind),
      state: d.state,
      base: !!base,
      live: !practice,
    };
  };

  const coverText = (p: DayCheck['parts'][number]) =>
    p.state === 'block' ? null : p.covered >= p.minutes && p.minutes > 0 ? t('cover.full') : p.covered > 0 ? t('cover.part', { c: dur(p.covered), r: dur(p.minutes - p.covered) }) : p.minutes > 0 ? t('cover.none') : null;

  return (
    <PageShell wide>
      <div className="flex flex-col gap-1">
        <h1 className="flex flex-wrap items-center gap-x-1 text-2xl font-bold">{t('title')}<HelpTip>{t('intro')}</HelpTip></h1>
        {!canAct && <p className="text-sm text-muted">{t('viewOnly')}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center">
          <Link href={q({ m: shift(month, -1) })} aria-label={t('prev')} className="inline-flex size-11 items-center justify-center rounded-l-button border border-border bg-bg text-muted lg:size-9">
            <ChevronLeft aria-hidden size={18} />
          </Link>
          <span className="num -ml-px inline-flex h-11 items-center border border-border bg-bg px-4 font-bold lg:h-9">{month}</span>
          {month < thisMonth ? (
            <Link href={q({ m: shift(month, 1) })} aria-label={t('next')} className="-ml-px inline-flex size-11 items-center justify-center rounded-r-button border border-border bg-bg text-muted lg:size-9">
              <ChevronRight aria-hidden size={18} />
            </Link>
          ) : (
            <span className="-ml-px inline-flex size-11 rounded-r-button border border-border bg-surface lg:size-9" />
          )}
        </span>
        <p className="num text-sm">
          {totals.people + totals.block + totals.decide === 0 ? (
            <span className="font-bold text-ok">{t('allClear')}</span>
          ) : (
            <>
              <b>{t('sumPeople', { n: totals.people })}</b>
              <span className="text-muted"> · </span>
              {totals.block > 0 && <><span className="font-bold text-danger">{t('sumBlock', { n: totals.block })}</span><span className="text-muted"> · </span></>}
              <span className="font-bold text-warn">{t('sumDecide', { n: totals.decide })}</span>
              {totals.confirm > 0 && <span className="text-muted"> · {t('sumConfirm', { n: totals.confirm })}</span>}
            </>
          )}
        </p>
        <Link href={`/admin/closing?m=${month}${sp.live === '1' ? '&live=1' : ''}`} className="ml-auto inline-flex min-h-11 items-center rounded-button border border-border bg-bg px-3.5 text-sm font-semibold text-text hover:border-primary/40 lg:min-h-9">
          {t('toClosing')} ›
        </Link>
      </div>

      {/* 거르기 — 상태 · 유형 · 직원 */}
      <div className="flex flex-wrap items-center gap-2">
        {STATES.map((s) => (
          <Link key={s} href={q({ s })} aria-current={view === s ? 'page' : undefined} className={`inline-flex min-h-11 items-center rounded-chip px-3.5 text-sm font-semibold lg:min-h-9 ${view === s ? 'bg-primary text-on-primary' : 'border border-border bg-bg text-text hover:border-primary/40'}`}>
            {t(`view.${s}`)}
          </Link>
        ))}
        {kindFilter && (
          <Link href={q({ k: null })} className="inline-flex min-h-11 items-center gap-1 rounded-chip bg-primary-tint px-3 text-sm font-semibold text-primary lg:min-h-9">
            {t(`kind.${kindFilter}`)}<X aria-hidden size={14} />
          </Link>
        )}
        {sp.e && person.get(sp.e) && (
          <Link href={q({ e: null })} className="inline-flex min-h-11 items-center gap-1 rounded-chip bg-primary-tint px-3 text-sm font-semibold text-primary lg:min-h-9">
            {person.get(sp.e)!.name}<X aria-hidden size={14} />
          </Link>
        )}
      </div>

      {rows.length === 0 && <p className="py-10 text-center text-muted">{t('empty')}</p>}

      <ul className="flex flex-col gap-6">
        {rows.map((r) => {
          const p = person.get(r.employeeId)!;
          const days = r.days.filter((d) => showDay(d, r.st.handled.has(d.workDate), r.st.changed.has(d.workDate)));
          const months = r.monthly.filter((m) => (kindFilter ? m.kind === kindFilter : true)).filter((m) => {
            const done = r.st.handled.has(monthKey(m));
            return view === 'all' || (view === 'handled' ? done : view === 'open' ? !done : false);
          });
          if (!days.length && !months.length) return null;
          // 평소 근무 시각 — 그달 일정에서 가장 많은 것
          const spans = new Map<string, number>();
          for (const d of daysFor(data, r.employeeId, from, upTo)) {
            const pl = data.planFor(r.employeeId, d.workDate);
            if (pl.items.length && pl.rule) { const k = `${pl.rule.startTime.slice(0, 5)}–${pl.rule.endTime.slice(0, 5)}`; spans.set(k, (spans.get(k) ?? 0) + 1); }
          }
          const usual = [...spans].sort((a, b) => b[1] - a[1])[0]?.[0];
          const confirmLeft = r.days.filter((d) => d.state === 'confirm' && !r.st.handled.has(d.workDate)).length;
          return (
            <li key={r.employeeId} className="flex flex-col">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border pb-2">
                <Link href={q({ e: r.employeeId })} className="text-lg font-bold hover:text-primary">{p.name}</Link>
                <span className="text-sm text-muted">{[groupPath(groups, p.groupId), usual ? t('usual', { span: usual }) : null].filter(Boolean).join(' · ')}</span>
                <span className="num ml-auto flex flex-wrap items-center gap-x-2 text-sm">
                  {r.n.block > 0 && <span className="font-bold text-danger">{t('sumBlock', { n: r.n.block })}</span>}
                  {r.n.decide + r.n.monthly > 0 && <span className="font-bold text-warn">{t('sumDecide', { n: r.n.decide + r.n.monthly })}</span>}
                  {r.n.confirm > 0 && <span className="text-muted">{t('sumConfirm', { n: r.n.confirm })}</span>}
                </span>
              </div>

              <ul className="flex flex-col divide-y divide-border">
                {months.map((m) => {
                  const done = r.st.handled.has(monthKey(m));
                  const rv = r.st.byKey.get(monthKey(m));
                  return (
                    <li key={m.kind} className="flex flex-col gap-2 py-3">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span aria-hidden className={`size-2 shrink-0 self-center rounded-full ${done ? 'bg-ok' : 'bg-warn'}`} />
                        <b>{t(`kind.${m.kind}`)}</b>
                        <span className="text-sm text-muted">{t('monthOne')}</span>
                        <span className="num text-sm">
                          {m.kind === 'schedule_check'
                            ? t('scheduleCheckLine', { n: m.patternDays, of: m.workedDays, from: m.fromMin, to: m.toMin })
                            : t('earlyBundleLine', { n: m.dates.length, from: dur(m.fromMin), to: dur(m.toMin) })}
                        </span>
                      </div>
                      <details className="group text-sm">
                        <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1 text-muted [&::-webkit-details-marker]:hidden">
                          {t('dates', { n: m.dates.length })}
                          <ChevronDown aria-hidden size={14} className="transition-transform group-open:rotate-180" />
                        </summary>
                        <p className="num flex flex-wrap gap-x-3 gap-y-1 pt-1 text-muted">
                          {m.dates.map((d) => {
                            const part = r.days.find((x) => x.workDate === d)?.parts.find((x) => x.kind === 'before_start');
                            return <Link key={d} href={`/admin/records/${r.employeeId}/${d}${sp.live === '1' ? '?live=1' : ''}`} className="hover:text-primary">{dayLabel(d)} {part ? `${part.punched}` : ''}</Link>;
                          })}
                        </p>
                      </details>
                      {done && rv ? (
                        <p className="text-sm text-ok">{t(`decided.${rv.decision}`)}{rv.note ? ` — ${rv.note}` : ''}</p>
                      ) : (
                        canAct && <MonthActions employeeId={r.employeeId} month={month} kind={m.kind} live={!practice} />
                      )}
                    </li>
                  );
                })}

                {days.map((d) => {
                  const all = daysFor(data, r.employeeId, d.workDate, d.workDate)[0];
                  const plan = data.planFor(r.employeeId, d.workDate);
                  const span = plan.items.length && plan.rule ? `${plan.rule.startTime.slice(0, 5)}–${plan.rule.endTime.slice(0, 5)}` : null;
                  const leaves = data.leaveRequests.filter((x) => x.employeeId === r.employeeId && x.startDate <= d.workDate && d.workDate <= x.endDate && x.status !== 'rejected' && x.status !== 'cancelled');
                  const ot = data.overtime.find((o) => o.employeeId === r.employeeId && o.workDate === d.workDate);
                  const waived = [...data.waivedFor(r.employeeId, d.workDate)];
                  const handled = r.st.handled.has(d.workDate) && d.state !== 'block';
                  const changed = r.st.changed.has(d.workDate);
                  const rv = r.st.byKey.get(d.workDate);
                  const live = d.parts.filter((x) => !x.quiet && !x.bundled);
                  const tone = handled ? 'bg-ok' : d.state === 'block' ? 'bg-danger' : d.state === 'decide' ? 'bg-warn' : 'bg-faint';
                  return (
                    <li key={d.workDate} className="flex flex-col gap-1.5 py-3">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span aria-hidden className={`size-2 shrink-0 self-center rounded-full ${tone}`} />
                        <Link href={`/admin/records/${r.employeeId}/${d.workDate}${sp.live === '1' ? '?live=1' : ''}`} className="num font-bold hover:text-primary">{dayLabel(d.workDate)}</Link>
                        <span className="text-sm text-muted">{handled ? t('state.handled') : changed ? t('state.changed') : t(`state.${d.state}`)}</span>
                        <span className="num text-sm text-muted">
                          {span ? t('planLine', { span }) : t('noPlan')}
                          {' · '}
                          {all?.pairs.length ? t('punchLine', { list: all.pairs.map((x) => `${x.in ? hm(x.in) : '--'}→${x.out ? hm(x.out) : '--'}`).join(', ') }) : t('noPunch')}
                        </span>
                      </div>
                      {/* 걸린 이유 — 구간마다 찍힌 · 계산 시각과 덮는 승인 */}
                      <ul className="flex flex-col gap-0.5 pl-4 text-sm">
                        {live.map((x, i) => (
                          <li key={i} className="flex flex-wrap items-baseline gap-x-2">
                            <span className={x.state === 'block' ? 'font-semibold text-danger' : x.state === 'decide' ? 'font-semibold text-text' : 'text-muted'}>
                              {t(`kind.${x.kind}`)}{x.minutes > 0 ? ` ${dur(x.minutes)}` : ''}
                            </span>
                            {x.punched && x.counted && <span className="num text-xs text-muted">{t('punchCalc', { plan: x.plan ?? '', punched: x.punched, counted: x.counted })}</span>}
                            {x.kind === 'break_check' && <span className="text-xs text-muted">{t('breakCheckWhy', { span: x.plan ?? '' })}</span>}
                            {coverText(x) && <span className={`text-xs ${x.covered >= x.minutes ? 'text-ok' : 'text-warn'}`}>{coverText(x)}</span>}
                          </li>
                        ))}
                      </ul>
                      {/* 그날 요청 · 표시 이력 */}
                      {(leaves.length > 0 || ot || waived.length > 0) && (
                        <p className="num flex flex-wrap gap-x-3 gap-y-0.5 pl-4 text-xs text-muted">
                          {leaves.map((l) => (
                            <span key={l.id}>{leaveTypeName(data.leaveTypes, l.typeCode, tl)}{l.startTime ? ` ${l.startTime.slice(0, 5)}–${l.endTime?.slice(0, 5)}` : ''} · {t(`req.${l.status}`)}</span>
                          ))}
                          {ot && (
                            <span>
                              {t('otLine', { status: t(`req.${ot.status}`), approved: dur(ot.status === 'approved' ? (ot.approvedMinutes ?? ot.overtimeMinutes) + (ot.approvedHolidayMinutes ?? ot.holidayMinutes) : 0) })}
                              {ot.needsReview && ot.recomputedOvertimeMinutes !== null && ot.recomputedOvertimeMinutes !== undefined ? ` · ${t('otNow', { n: dur(ot.recomputedOvertimeMinutes) })}` : ''}
                            </span>
                          )}
                          {waived.map((w) => <span key={w}>{t('waivedLine', { start: w })}</span>)}
                        </p>
                      )}
                      {handled && rv ? (
                        <p className="pl-4 text-sm text-ok">{t(`decided.${rv.decision}`)}{rv.note ? ` — ${rv.note}` : ''}</p>
                      ) : (
                        canAct && d.state !== 'confirm' && <DayActions ctx={ctxOf(r.employeeId, d)} reviewId={changed ? rv?.id ?? null : null} />
                      )}
                    </li>
                  );
                })}
              </ul>
              {canAct && confirmLeft > 0 && (view === 'confirm' || view === 'all') && <ConfirmAll employeeId={r.employeeId} month={month} n={confirmLeft} />}
            </li>
          );
        })}
      </ul>
    </PageShell>
  );
}
