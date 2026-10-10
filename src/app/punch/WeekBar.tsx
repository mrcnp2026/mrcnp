// 「이번주 근무」 카드 (2026-10-10 의뢰인: 시프티 홈처럼) — 요일 7칸(그날 일정) + 막대(실제 / 계획) + 40·52시간 눈금.
// 서버가 계산한 값만 그린다 — 화면이 다시 계산하지 않는다. 막대 길이는 52시간 = 100%, 넘으면 끝에서 멈춘다.
// 색만 쓰지 않고 숫자와 상태 글자를 함께. 알림은 보내지 않는다 (7-13 요점 3). 5인 미만이면 색 없이 숫자만 (요점 4).
import { AlertTriangle, CalendarDays } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Card } from '@/components/ui';
import type { weeklyHours } from '@/lib/weekly-hours';

export type WeekCell = { date: string; label: string; red: boolean; today: boolean; start: string | null; end: string | null; leave: boolean };

export async function WeekBar({
  week,
  regularHours,
  limitHours,
  cells,
  planMinutes,
  range,
}: {
  week: ReturnType<typeof weeklyHours> | null;
  regularHours: number;
  limitHours: number;
  cells: WeekCell[];
  planMinutes: number;
  range: string;
}) {
  const t = await getTranslations('home.week');
  if (!week) {
    return (
      <Card>
        <p className="text-sm text-faint">{t('noRule')}</p>
      </Card>
    );
  }
  const limitMin = limitHours * 60;
  const pct = (min: number) => Math.min(min / limitMin, 1) * 100;
  const regPct = pct(week.regularMinutes);
  const otPct = Math.min(week.overtimeMinutes / limitMin, 1 - regPct / 100) * 100;
  const planPct = pct(planMinutes);
  const hm = (min: number) => (min % 60 === 0 ? t('hours', { h: min / 60 }) : t('total', { h: Math.floor(min / 60), m: min % 60 }));
  const warn = week.colored && week.level !== 'normal';
  const tone = !warn ? 'text-ok' : week.level === 'over' ? 'text-danger' : 'text-warn';

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold">{t('title')}</h2>
        <Link href="/punch/schedule" className="num inline-flex min-h-11 items-center gap-1 text-sm text-muted">
          <CalendarDays aria-hidden size={18} strokeWidth={1.75} />
          {range}
        </Link>
      </div>
      <ol className="-mx-2 grid grid-cols-7 gap-1">
        {cells.map((c) => (
          <li key={c.date} className={`flex min-h-20 flex-col items-center gap-1 rounded-button px-0.5 py-2 text-center ${c.today ? 'bg-primary-tint' : 'bg-surface'}`}>
            <span className={`text-sm font-bold ${c.today ? 'text-primary' : c.red ? 'text-danger' : ''}`}>{c.today ? t('today') : c.label}</span>
            {c.leave ? (
              <span className="text-xs text-primary">{t('leave')}</span>
            ) : c.start ? (
              <span className="num flex flex-col text-xs leading-snug">
                <span className="font-semibold">{c.start}</span>
                <span className="text-muted">{c.end}</span>
              </span>
            ) : (
              <span className="text-xs leading-snug text-muted">{t('none')}</span>
            )}
          </li>
        ))}
      </ol>
      <div className="flex flex-col gap-1">
        {/* 계획 눈금: 이번 주 일정의 합 (휴게 제외) */}
        <div className="relative h-9" aria-hidden>
          {planMinutes > 0 && (
            <span className="absolute bottom-0 flex -translate-x-1/2 flex-col items-center text-xs leading-none" style={{ left: `${planPct}%` }}>
              <span className="whitespace-nowrap">{t('plan')}</span>
              <span>▼</span>
            </span>
          )}
        </div>
        <div className="relative flex h-3 bg-surface" role="img" aria-label={`${t('regular')} ${hm(week.regularMinutes)}, ${t('overtime')} ${hm(week.overtimeMinutes)}, ${t('plan')} ${hm(planMinutes)}`}>
          <div className={`h-full ${warn ? (week.level === 'over' ? 'bg-danger' : 'bg-warn') : 'bg-ok'}`} style={{ width: `${regPct}%` }} />
          <div className="h-full bg-danger" style={{ width: `${otPct}%` }} />
          <div className="absolute -inset-y-1 border-l-2 border-text" style={{ left: `${(regularHours / limitHours) * 100}%` }} />
        </div>
        <div className="num relative h-6 text-sm">
          <span className="absolute left-0 flex items-center gap-1">
            {warn && <AlertTriangle aria-hidden size={16} strokeWidth={2} className={tone} />}
            <span className={`font-bold ${tone}`}>{week.totalMinutes > limitMin ? t('over52') : hm(week.totalMinutes)}</span>
            <span className="text-muted">/ {hm(planMinutes)}</span>
          </span>
          <span className="absolute -translate-x-1/2 text-muted" style={{ left: `${(regularHours / limitHours) * 100}%` }}>
            {regularHours}
          </span>
          <span className="absolute right-0 text-muted">{limitHours}</span>
        </div>
      </div>
      {week.overtimeMinutes > 0 && (
        <p className="num text-sm text-muted">
          {t('overtime')} <span className="font-bold text-danger">{hm(week.overtimeMinutes)}</span>
        </p>
      )}
      {warn && <p className={`text-sm ${tone}`}>{t(week.level)}</p>}
    </Card>
  );
}
