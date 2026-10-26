// 이번 주 근로 (PC 직원 홈 왼쪽, 2026-10-22 의뢰인: 「홈이 허전하다 — 이번 주 일한 시간 · 연장 · 야간 · 지각을 그래프로」).
// 동그라미 = 이번 주 일한 시간 ÷ 일정상 시간(없으면 주 40시간), 아래 막대 = 요일별 일한 시간. 색만으로 뜻을 전하지 않는다 — 숫자를 함께 적는다.
// 주는 월~일. 급여 금액은 넣지 않는다.
import { getFormatter, getTranslations } from 'next-intl/server';
import { CountUp } from '@/components/CountUp';
import { addDays, weekStartOf } from '@/lib/calendar';
import { judgeLateness } from '@/lib/lateness';
import { isFullDayLeave } from '@/lib/leave';
import { daysFor, leaveDaysFor, loadPeriod } from '@/lib/period-data';
import { planMinutes } from '@/lib/shifts';
import { kstDateTime } from '@/lib/time';

const WEEK_LIMIT = 52 * 60; // 주 52시간 (근로기준법 제53조)
const DEFAULT_GOAL = 40 * 60;
const R = 42;

type Period = Awaited<ReturnType<typeof loadPeriod>>;

/** weekStart · period: 폰 홈은 보고 있는 주(‹ ›)를 따라가고, 이미 읽은 그 주 자료를 그대로 넘겨 다시 읽지 않는다 */
export async function WeekHoursCard({ meId, today, weekStart, period: given }: { meId: string; today: string; weekStart?: string; period?: Period }) {
  const [t, f] = await Promise.all([getTranslations('desk'), getFormatter()]);
  const ws = weekStart ?? weekStartOf(today);
  const we = addDays(ws, 6);
  const period = given ?? (await loadPeriod(ws, we));
  const rows = new Map(daysFor(period, meId, ws, we).map((r) => [r.workDate, r]));
  const leave = leaveDaysFor(period, meId);

  let planned = 0, worked = 0, over = 0, night = 0, lateN = 0, lateMin = 0;
  const bars = [...Array(7)].map((_, i) => {
    const d = addDays(ws, i);
    const r = rows.get(d);
    const plan = period.planFor(meId, d);
    if (plan.items.length > 0 && plan.rule && !isFullDayLeave(leave.get(d) ?? [])) planned += planMinutes(plan.rule);
    const net = r?.netMinutes ?? 0;
    worked += net;
    over += (r?.overtimeMinutes ?? 0) + (r?.holidayMinutes ?? 0);
    night += r?.nightMinutes ?? 0;
    // 지각 — 간주 근무일은 찍은 기록이 아니라 일정이라 세지 않는다 (달력과 같은 규칙)
    const pairs = r && !r.deemed ? r.pairs : [];
    const firstIn = pairs.find((x) => x.in)?.in ?? null;
    const rule = period.ruleFor(meId, d) ?? period.rule;
    if (firstIn && r?.dayType === 'workday' && rule) {
      const j = judgeLateness({ punchedAt: firstIn, workDate: d, rule, isHoliday: false });
      if (j.verdict === 'late') {
        lateN += 1;
        lateMin += j.lateMinutes;
      }
    }
    return { d, net, label: f.dateTime(kstDateTime(d, '12:00'), { weekday: 'short' }), isToday: d === today, future: d > today };
  });

  const goal = planned > 0 ? planned : DEFAULT_GOAL;
  const p = Math.min(1, worked / goal);
  const overLimit = worked > WEEK_LIMIT;
  const top = Math.max(8 * 60, ...bars.map((b) => b.net));
  const hm = (min: number) => t('hm', { h: Math.floor(min / 60), m: min % 60 });
  const dash = (min: number) => (min > 0 ? <CountUp value={hm(min)} /> : '–');
  const tone = 'stroke-primary'; // 한도 초과는 색이 아니라 아래 글자로
  const C = 2 * Math.PI * R;
  const mid = `week-ring-${weekStart ?? 'desk'}`; // PC 칸과 폰 칸이 한 화면에 같이 있어도 id가 겹치지 않게

  return (
    <section className="flex flex-1 flex-col gap-4 rounded-card border border-border bg-bg p-5 shadow-card">
      <div>
        <h2 className="font-bold">{t('weekTitle')}</h2>
        <p className="num pt-0.5 text-xs text-faint">{ws.slice(5).replace('-', '.')} - {we.slice(5).replace('-', '.')}</p>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative size-24 shrink-0" role="img" aria-label={`${hm(worked)} / ${hm(goal)}`}>
          <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
            <circle cx="50" cy="50" r={R} fill="none" strokeWidth="11" className="stroke-surface" />
            <defs>
              <mask id={mid}>
                <circle cx="50" cy="50" r={R} fill="none" stroke="white" strokeWidth="13" pathLength={1} className="fx-draw" />
              </mask>
            </defs>
            <g mask={`url(#${mid})`}>
              {p > 0 && <circle cx="50" cy="50" r={R} fill="none" strokeWidth="11" strokeLinecap="round" strokeDasharray={`${p * C} ${C}`} className={tone} />}
            </g>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <CountUp value={t('hoursShort', { h: Math.floor(worked / 60) })} className="num text-lg leading-tight font-bold" />
            <span className="num text-xs text-faint">/ {t('hoursShort', { h: Math.round(goal / 60) })}</span>
          </div>
        </div>
        <dl className="num flex min-w-0 flex-1 flex-col gap-2 text-sm">
          <div className="flex items-baseline justify-between gap-2"><dt className="text-muted">{t('weekOver')}</dt><dd className={`font-semibold ${over > 0 ? 'text-text' : 'text-faint'}`}>{dash(over)}</dd></div>
          <div className="flex items-baseline justify-between gap-2"><dt className="text-muted">{t('weekNight')}</dt><dd className={`font-semibold ${night > 0 ? '' : 'text-faint'}`}>{dash(night)}</dd></div>
          <div className="flex items-baseline justify-between gap-2"><dt className="text-muted">{t('weekLate')}</dt><dd className={`font-semibold ${lateN > 0 ? 'text-warn' : 'text-faint'}`}>{lateN > 0 ? t('weekLateValue', { n: lateN, m: lateMin }) : '–'}</dd></div>
        </dl>
      </div>

      {/* 요일별 일한 시간 — 막대가 아래에서 자란다. 오늘은 진하게, 아직 안 온 날은 빈 칸 */}
      <div className="mt-auto flex flex-col gap-2">
        <ul className="grid grid-cols-7 gap-1.5" aria-label={t('weekBars')}>
          {bars.map((b) => (
            <li key={b.d} className="flex flex-col items-center gap-1">
              <div className="relative h-14 w-full overflow-hidden rounded-button bg-surface">
                {b.net > 0 && <span className={`fx-grow absolute inset-x-0 bottom-0 block rounded-button ${b.isToday ? 'bg-primary' : 'bg-primary/45'}`} style={{ height: `${Math.max(8, (b.net / top) * 100)}%` }} />}
              </div>
              <span className={`text-xs ${b.isToday ? 'font-bold text-text' : 'text-faint'}`}>{b.label}</span>
              <span className={`num text-xs ${b.net > 0 ? 'text-muted' : 'text-faint'}`}>{b.net > 0 ? (b.net / 60).toFixed(1) : b.future ? '' : '–'}</span>
            </li>
          ))}
        </ul>
        {worked > 0 && (
          <p className={`num text-xs ${overLimit ? 'font-semibold text-danger' : 'text-faint'}`}>
            {overLimit ? t('weekOverLimit', { v: hm(worked - WEEK_LIMIT) }) : t('weekLeft', { v: hm(WEEK_LIMIT - worked) })}
          </p>
        )}
      </div>
    </section>
  );
}
