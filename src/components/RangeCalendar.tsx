'use client';
// 기간 고르기 달력 (2026-11-03 의뢰인: 근무일정 추가에서 시작 · 끝 날짜를 눌러 그 기간의 일정을 한 번에).
// 처음 누른 날 = 시작, 다음에 누른 날 = 끝(시작보다 앞을 누르면 시작이 바뀐다), 끝까지 고른 뒤 다시 누르면 새로 시작.
// 같은 날을 두 번 누르면 하루만. 앱이 직접 그리므로 폰 언어와 상관없이 앱 언어로 보인다.
// 위쪽 요일(일~토)을 누르면 그 달의 그 요일이 모두 골라진다 — 여러 요일을 이어 누르면 더해지고, 다시 누르면 빠진다. 날짜를 누르면 다시 기간 고르기 (2026-11-03 의뢰인)
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { addDays } from '@/lib/calendar';

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** 요일로 고르기 — 그 달(month 'YYYY-MM')의 고른 요일(0=일) 전부 */
export type WeekdayPick = { month: string; days: number[] };
export function datesOfWeekdays(pick: WeekdayPick, min?: string): string[] {
  const y = Number(pick.month.slice(0, 4));
  const m = Number(pick.month.slice(5, 7));
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const out: string[] = [];
  for (let d = 1; d <= n; d++) {
    const day = ymd(y, m, d);
    if (pick.days.includes(new Date(Date.UTC(y, m - 1, d)).getUTCDay()) && !(min && day < min)) out.push(day);
  }
  return out;
}

/** 시작~끝(포함)의 날짜. skipWeekend면 토 · 일을 뺀다 */
export function datesBetween(start: string, end: string | null, skipWeekend: boolean): string[] {
  const out: string[] = [];
  for (let d = start; d <= (end ?? start) && out.length < 400; d = addDays(d, 1)) {
    const w = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (skipWeekend && (w === 0 || w === 6)) continue;
    out.push(d);
  }
  return out;
}

export function RangeCalendar({ start, end, onChange, min, skipWeekend = false, pick = null, onPick }: { start: string; end: string | null; onChange: (start: string, end: string | null) => void; min?: string; skipWeekend?: boolean; pick?: WeekdayPick | null; onPick?: (p: WeekdayPick | null) => void }) {
  const t = useTranslations('common.range');
  const [view, setView] = useState(start.slice(0, 7)); // 'YYYY-MM'
  const y = Number(view.slice(0, 4));
  const m = Number(view.slice(5, 7));
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // 0=일
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const move = (n: number) => {
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    const next = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
    setView(next);
    if (pick) onPick?.({ ...pick, month: next }); // 요일로 고른 중이면 넘긴 달의 같은 요일로
  };
  const toggleDay = (w: number) => {
    const days = pick && pick.month === view ? pick.days : [];
    const nextDays = days.includes(w) ? days.filter((x) => x !== w) : [...days, w].sort();
    onPick?.(nextDays.length ? { month: view, days: nextDays } : null);
  };
  const pickDate = (d: string) => {
    if (pick) { onPick?.(null); onChange(d, null); return; } // 날짜를 누르면 다시 기간 고르기
    if (end !== null || d < start) onChange(d, null);
    else onChange(start, d);
  };
  const last = end ?? start;
  const week = t('week').split(',');
  return (
    <div className="flex flex-col gap-2 rounded-button border border-border p-2">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => move(-1)} aria-label={t('prev')} className="grid size-11 place-items-center rounded-button text-muted hover:bg-surface">
          <ChevronLeft aria-hidden size={20} strokeWidth={1.75} />
        </button>
        <span className="num font-semibold text-text">{t('month', { y, m })}</span>
        <button type="button" onClick={() => move(1)} aria-label={t('next')} className="grid size-11 place-items-center rounded-button text-muted hover:bg-surface">
          <ChevronRight aria-hidden size={20} strokeWidth={1.75} />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-xs text-faint">
        {week.map((w, i) =>
          onPick ? (
            <button
              key={i}
              type="button"
              onClick={() => toggleDay(i)}
              aria-pressed={!!pick?.days.includes(i)}
              title={t('pickDayHint', { d: w })}
              className={`mx-auto grid h-8 min-w-8 place-items-center rounded-full px-1 font-semibold ${pick?.days.includes(i) ? 'bg-primary text-on-primary' : `hover:bg-surface ${i === 0 ? 'text-danger' : i === 6 ? 'text-info' : ''}`}`}
            >
              {w}
            </button>
          ) : (
            <span key={i} className={i === 0 ? 'text-danger' : i === 6 ? 'text-info' : ''}>{w}</span>
          ),
        )}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {Array.from({ length: first }, (_, i) => <span key={`b${i}`} />)}
        {Array.from({ length: days }, (_, i) => {
          const d = ymd(y, m, i + 1);
          const off = !!min && d < min;
          const dow = (first + i) % 7;
          const byDay = !!pick && pick.month === view && pick.days.includes(dow) && !off;
          const edge = pick ? byDay : d === start || d === last;
          const inside = !pick && d > start && d < last && !(skipWeekend && (dow === 0 || dow === 6)); // 뺀 토 · 일은 칠하지 않는다
          return (
            <button
              key={d}
              type="button"
              disabled={off}
              onClick={() => pickDate(d)}
              aria-pressed={edge || inside}
              className={`num mx-auto grid size-10 place-items-center rounded-full text-sm disabled:opacity-30 ${edge ? 'bg-primary font-bold text-on-primary' : inside ? 'bg-primary-tint text-primary-deep' : 'text-text hover:bg-surface'}`}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
      <p className="num px-1 text-sm text-muted">
        {pick ? t('pickedDays', { m, days: pick.days.map((x) => week[x]).join(' · '), n: datesOfWeekdays(pick, min).length }) : end && end !== start ? t('picked', { s: start, e: end }) : t('pickedOne', { s: start })}
      </p>
      <p className="px-1 text-xs text-faint">{t(pick ? 'hintDays' : end === null ? 'hintEnd' : 'hintStart')}{!pick && onPick ? ` ${t('hintWeekday')}` : ''}</p>
    </div>
  );
}
