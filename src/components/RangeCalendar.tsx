'use client';
// 기간 고르기 달력 (2026-11-03 의뢰인: 근무일정 추가에서 시작 · 끝 날짜를 눌러 그 기간의 일정을 한 번에).
// 처음 누른 날 = 시작, 다음에 누른 날 = 끝(시작보다 앞을 누르면 시작이 바뀐다), 끝까지 고른 뒤 다시 누르면 새로 시작.
// 같은 날을 두 번 누르면 하루만. 앱이 직접 그리므로 폰 언어와 상관없이 앱 언어로 보인다.
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { addDays } from '@/lib/calendar';

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

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

export function RangeCalendar({ start, end, onChange, min, skipWeekend = false }: { start: string; end: string | null; onChange: (start: string, end: string | null) => void; min?: string; skipWeekend?: boolean }) {
  const t = useTranslations('common.range');
  const [view, setView] = useState(start.slice(0, 7)); // 'YYYY-MM'
  const y = Number(view.slice(0, 4));
  const m = Number(view.slice(5, 7));
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // 0=일
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const move = (n: number) => {
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    setView(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`);
  };
  const pick = (d: string) => {
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
        {week.map((w, i) => (
          <span key={i} className={i === 0 ? 'text-danger' : i === 6 ? 'text-info' : ''}>{w}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {Array.from({ length: first }, (_, i) => <span key={`b${i}`} />)}
        {Array.from({ length: days }, (_, i) => {
          const d = ymd(y, m, i + 1);
          const off = !!min && d < min;
          const edge = d === start || d === last;
          const dow = (first + i) % 7;
          const inside = d > start && d < last && !(skipWeekend && (dow === 0 || dow === 6)); // 뺀 토 · 일은 칠하지 않는다
          return (
            <button
              key={d}
              type="button"
              disabled={off}
              onClick={() => pick(d)}
              aria-pressed={edge || inside}
              className={`num mx-auto grid size-10 place-items-center rounded-full text-sm disabled:opacity-30 ${edge ? 'bg-primary font-bold text-on-primary' : inside ? 'bg-primary-tint text-primary-deep' : 'text-text hover:bg-surface'}`}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
      <p className="num px-1 text-sm text-muted">{end && end !== start ? t('picked', { s: start, e: end }) : t('pickedOne', { s: start })}</p>
      <p className="px-1 text-xs text-faint">{t(end === null ? 'hintEnd' : 'hintStart')}</p>
    </div>
  );
}
