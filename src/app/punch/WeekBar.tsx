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
  const pct = Math.min(week.totalMinutes / limitMin, 1) * 100;
  const over = week.totalMinutes > limitMin;
  const barColor = !week.colored ? 'bg-primary' : week.level === 'over' ? 'bg-danger' : week.level === 'caution' ? 'bg-warn' : 'bg-primary';
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
      <div className="relative h-2 rounded-chip bg-border" role="img" aria-label={t('total', { h, m })}>
        <div className={`h-2 rounded-chip ${barColor}`} style={{ width: `${pct}%` }} />
        <div className="absolute -top-0.5 h-3 border-l-2 border-bg" style={{ left: `${(regularHours / limitHours) * 100}%` }} />
      </div>
      <p className={`text-sm ${week.colored && week.level !== 'normal' ? textColor : 'text-muted'}`}>
        {week.colored && week.level !== 'normal' ? t(week.level) : left > 0 ? t('left', { limit: regularHours, h: Math.floor(left / 60), m: left % 60 }) : t('normal')}
      </p>
    </Card>
  );
}
