// 「이번주 근무」 카드 (2026-10-10 의뢰인: 시프티 홈처럼) — 요일 7칸 + 막대(실제 / 계획) + 40·52시간 눈금.
// 2026-10-18 의뢰인: 요일 칸은 일정이 아니라 **실제 출근 · 퇴근 시각**. 아직 안 찍은 날만 일정을 흐리게 보인다.
// 서버가 계산한 값만 그린다 — 화면이 다시 계산하지 않는다. 막대 길이는 52시간 = 100%, 넘으면 끝에서 멈춘다.
// 색만 쓰지 않고 숫자와 상태 글자를 함께. 알림은 보내지 않는다 (7-13 요점 3). 5인 미만이면 색 없이 숫자만 (요점 4).
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { CountUp } from '@/components/CountUp';
import { Card, Chip } from '@/components/ui';
import type { weeklyHours } from '@/lib/weekly-hours';

export type WeekCell = { date: string; label: string; red: boolean; today: boolean; start: string | null; end: string | null; leave: boolean; inAt?: string | null; outAt?: string | null; working?: boolean };

export async function WeekBar({
  week,
  regularHours,
  limitHours,
  cells,
  planMinutes,
  range,
  nav,
  limitNotice = true,
  extra,
}: {
  week: ReturnType<typeof weeklyHours> | null;
  regularHours: number;
  limitHours: number;
  cells: WeekCell[];
  planMinutes: number;
  range: string;
  nav?: { prev: string | null; next: string | null; thisWeek: boolean }; // 주 고르기 (지난 주 · 다음 주). 이번 주가 아니면 제목이 「주간 근무」
  extra?: { nightMinutes: number; lateCount: number; lateMinutes: number }; // 야간 · 지각 (2026-10-22 의뢰인: 이번주 근로 카드와 겹쳐 하나로)
  limitNotice?: boolean; // 통합설정 › 리포트 「주 52시간 관리」 스위치 — 끄면 주의 · 한도 초과 표시를 하지 않는다 (2026-10-19)
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
  const warn = limitNotice && week.colored && week.level !== 'normal';
  const tone = !warn ? 'text-primary' : week.level === 'over' ? 'text-danger' : 'text-warn';

  return (
    <Card className="flex flex-col gap-2 p-4 lg:gap-3 lg:p-5">
      <div className="-my-1 flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold">{t(nav && !nav.thisWeek ? 'titleOther' : 'title')}</h2>
        <span className="flex items-center">
          {nav &&
            (nav.prev ? (
              <Link href={nav.prev} scroll={false} aria-label={t('prev')} className="flex size-11 shrink-0 items-center justify-center text-muted">
                <ChevronLeft aria-hidden size={20} />
              </Link>
            ) : (
              <span className="size-11" />
            ))}
          <Link href={nav && !nav.thisWeek ? '/punch' : '/punch/records?v=week'} scroll={false} className="num inline-flex min-h-11 items-center gap-1 text-sm text-muted">
            <CalendarDays aria-hidden size={18} strokeWidth={1.75} />
            {range}
          </Link>
          {nav &&
            (nav.next ? (
              <Link href={nav.next} scroll={false} aria-label={t('next')} className="flex size-11 shrink-0 items-center justify-center text-muted">
                <ChevronRight aria-hidden size={20} />
              </Link>
            ) : (
              <span className="size-11" />
            ))}
        </span>
      </div>
      {/* 이슈 먼저 (2026-10-26 의뢰인: 시간 숫자보다 지각 · 연장 같은 이슈와 막대가 잘 보이게) — 있는 것만 칩으로, 없으면 한 줄로 조용히 */}
      {(() => {
        const chips: { key: string; tone: 'warn' | 'danger' | 'info'; text: string }[] = [];
        if (warn) chips.push({ key: 'level', tone: week.level === 'over' ? 'danger' : 'warn', text: `⚠ ${t(week.level)}` });
        if (extra && extra.lateCount > 0) chips.push({ key: 'late', tone: 'warn', text: `⚠ ${t('late')} ${t('lateValue', { n: extra.lateCount, m: extra.lateMinutes })}` });
        if (week.overtimeMinutes > 0) chips.push({ key: 'ot', tone: 'info', text: `${t('overtime')} ${hm(week.overtimeMinutes)}` });
        if (extra && extra.nightMinutes > 0) chips.push({ key: 'night', tone: 'info', text: `${t('night')} ${hm(extra.nightMinutes)}` });
        return chips.length > 0 ? (
          <p className="flex flex-wrap gap-1.5 pt-1">
            {chips.map((c) => (
              <Chip key={c.key} tone={c.tone}>{c.text}</Chip>
            ))}
          </p>
        ) : (
          <p className="pt-1 text-sm text-ok">✓ {t('clean')}</p>
        );
      })()}
      {/* 일한 시간 숫자는 한 줄로 작게 — 오늘 근무 카드의 큰 시각과 겹쳐 보이지 않게 */}
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <CountUp value={limitNotice && week.totalMinutes > limitMin ? t('over52') : hm(week.totalMinutes)} className={`num text-2xl leading-none font-extrabold tracking-tight ${warn ? tone : ''}`} />
        <span className="num text-sm text-muted">/ {hm(planMinutes)}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {/* 계획 눈금: 이번 주 일정의 합 (휴게 제외) */}
        <div className="relative h-6" aria-hidden>
          {planMinutes > 0 && (
            <span className="absolute bottom-0 flex -translate-x-1/2 flex-col items-center text-xs leading-none text-muted" style={{ left: `${planPct}%` }}>
              <span className="whitespace-nowrap">{t('plan')}</span>
              <span>▼</span>
            </span>
          )}
        </div>
        <div className="relative" role="img" aria-label={`${t('regular')} ${hm(week.regularMinutes)}, ${t('overtime')} ${hm(week.overtimeMinutes)}, ${t('plan')} ${hm(planMinutes)}`}>
          {/* 막대 색은 상태로 바꾸지 않는다 — 둥근 막대, 두 조각 사이 2px 틈 */}
          <div className="flex h-4 gap-0.5 overflow-hidden rounded-full bg-surface">
            <div className="fx-grow-x h-full rounded-full bg-primary" style={{ width: `${regPct}%` }} />
            <div className="fx-grow-x h-full rounded-full bg-chart-extra" style={{ width: `${otPct}%`, animationDelay: '1400ms' }} />
          </div>
          <div className="absolute -inset-y-1 border-l-2 border-text/70" style={{ left: `${(regularHours / limitHours) * 100}%` }} />
        </div>
        <div className="num relative h-5 text-xs text-muted">
          <span className="absolute -translate-x-1/2" style={{ left: `${(regularHours / limitHours) * 100}%` }}>
            {regularHours}
          </span>
          <span className="absolute right-0">{limitHours}</span>
        </div>
      </div>
      <ol className="-mx-2 grid grid-cols-7 gap-1">
        {cells.map((c) => (
          <li key={c.date} className={`flex min-h-16 flex-col items-center gap-0.5 rounded-card px-0.5 py-2 text-center ${c.today ? 'bg-primary-tint' : ''}`}>
            <span className={`text-sm font-bold ${c.today ? 'text-primary' : c.red ? 'text-danger' : ''}`}>{c.today ? t('today') : c.label}</span>
            {c.inAt ? (
              <span className="num flex flex-col text-xs leading-snug">
                <span className="font-bold">{c.inAt}</span>
                <span className={c.outAt ? 'font-semibold' : 'text-primary'}>{c.outAt ?? (c.working ? t('workingShort') : '—')}</span>
              </span>
            ) : c.leave ? (
              <span className="text-xs text-primary">{t('leave')}</span>
            ) : c.start ? (
              <span className="num flex flex-col text-xs leading-snug text-faint">
                <span>{c.start}</span>
                <span>{c.end}</span>
              </span>
            ) : (
              <span className="text-xs leading-snug text-muted">{t('none')}</span>
            )}
          </li>
        ))}
      </ol>
      <p className="-mt-1 text-xs text-faint">{t('legend')}</p>
    </Card>
  );
}
