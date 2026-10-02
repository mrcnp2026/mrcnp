// 이번 주 누적 막대 (부록 R-10-3, ①-1 7-13). 서버가 계산한 값만 그린다 — 화면이 다시 계산하지 않는다.
// 막대 길이는 52시간 = 100%. 넘으면 끝에서 멈추고 "52h+". 40·52시간 눈금. 색만 쓰지 않고 숫자와 상태 글자를 함께.
// 알림은 보내지 않는다 (7-13 요점 3). 5인 미만이면 색 없이 숫자만 (요점 4).
import { AlertTriangle, ChartNoAxesColumn } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Card, CardTitle } from '@/components/ui';
import type { weeklyHours } from '@/lib/weekly-hours';

export async function WeekBar({
  week,
  regularHours,
  limitHours,
}: {
  week: ReturnType<typeof weeklyHours> | null;
  regularHours: number;
  limitHours: number;
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
  // 막대 한 줄을 두 색으로 (2026-10-02 의뢰인): 파랑 = 정규, 빨강 = 연장(야근·휴일). 합쳐서 52시간에서 멈춘다
  const regPct = Math.min(week.regularMinutes / limitMin, 1) * 100;
  const otPct = Math.min(week.overtimeMinutes / limitMin, 1 - regPct / 100) * 100;
  const over = week.totalMinutes > limitMin;
  const hm = (min: number) => t('total', { h: Math.floor(min / 60), m: min % 60 });
  const textColor = !week.colored ? 'text-muted' : week.level === 'over' ? 'text-danger' : week.level === 'caution' ? 'text-warn' : 'text-muted';
  const h = Math.floor(week.totalMinutes / 60);
  const m = week.totalMinutes % 60;

  const regMin = regularHours * 60;
  const left = Math.max(0, regMin - week.totalMinutes);
  // 토스풍: 제목은 작게, 합계는 크게, 아래 한 줄은 말로 ("40시간까지 7시간 50분 남았어요")
  return (
    <Card className="flex flex-col gap-3 p-6">
      <CardTitle
        icon={ChartNoAxesColumn}
        aside={
          <Link href="/punch/records" className="-my-3 inline-flex min-h-11 items-center text-sm text-faint">
            {t('records')} ›
          </Link>
        }
      >
        {t('title')}
      </CardTitle>
      <p className={`num flex items-center gap-1 text-3xl font-extrabold tracking-tight ${week.colored && week.level !== 'normal' ? textColor : ''}`}>
        {week.colored && week.level !== 'normal' && <AlertTriangle aria-hidden size={24} strokeWidth={2} />}
        {over ? t('over52') : t('total', { h, m })}
      </p>
      <div
        className="relative flex h-2.5 overflow-hidden rounded-chip bg-border"
        role="img"
        aria-label={`${t('regular')} ${hm(week.regularMinutes)}, ${t('overtime')} ${hm(week.overtimeMinutes)}`}
      >
        <div className="h-full bg-primary" style={{ width: `${regPct}%` }} />
        <div className="h-full bg-danger" style={{ width: `${otPct}%` }} />
        <div className="absolute inset-y-0 border-l-2 border-bg" style={{ left: `${(regularHours / limitHours) * 100}%` }} />
      </div>
      <ul className="num flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-chip bg-primary" />
          <span className="text-muted">{t('regular')}</span>
          <span className="font-bold">{hm(week.regularMinutes)}</span>
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-chip bg-danger" />
          <span className="text-muted">{t('overtime')}</span>
          <span className={`font-bold ${week.overtimeMinutes > 0 ? 'text-danger' : ''}`}>{hm(week.overtimeMinutes)}</span>
        </li>
      </ul>
      <p className={`text-sm ${week.colored && week.level !== 'normal' ? textColor : 'text-muted'}`}>
        {week.colored && week.level !== 'normal' ? t(week.level) : left > 0 ? t('left', { limit: regularHours, h: Math.floor(left / 60), m: left % 60 }) : t('normal')}
      </p>
    </Card>
  );
}
