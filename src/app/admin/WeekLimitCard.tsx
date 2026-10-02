// 「주 52시간 관리」 카드 (시프티 대조 우선 반영 ②, 2026-10-02 의뢰인).
// 이번 주 40시간을 넘긴 직원만 많은 순 — 48시간부터 주황, 52시간 넘으면 빨강. 52시간까지 남은 시간을 말로.
// 5인 미만이면 한도 규정이 없으므로 색 없이 숫자만 (7-13 요점 4). 알림은 보내지 않는다 (요점 3).
import { AlertTriangle, Gauge } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Card, CardTitle } from '@/components/ui';
import type { WeekLimitRow } from '@/lib/week-limit';

export async function WeekLimitCard({ rows, limitMin, colored }: { rows: WeekLimitRow[]; limitMin: number; colored: boolean }) {
  const t = await getTranslations('admin.weekLimit');
  const hm = (min: number) => t('hm', { h: Math.floor(Math.abs(min) / 60), m: Math.abs(min) % 60 });
  const tone = (r: WeekLimitRow) => (!colored ? '' : r.level === 'over' ? 'text-danger' : r.level === 'caution' ? 'text-warn' : '');
  const bar = (r: WeekLimitRow) => (!colored ? 'bg-primary' : r.level === 'over' ? 'bg-danger' : r.level === 'caution' ? 'bg-warn' : 'bg-primary');
  const flagged = rows.filter((r) => r.level !== 'normal').length;
  return (
    <Card className="flex flex-col gap-2">
      <CardTitle icon={Gauge} aside={<span className="num text-sm text-faint">{t('count', { n: rows.length })}</span>}>
        {t('title')}
      </CardTitle>
      <p className="text-sm text-muted">{rows.length === 0 ? t('empty') : flagged > 0 ? t('flagged', { n: flagged }) : t('hint')}</p>
      {rows.length > 0 && (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-1.5 py-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate font-semibold">
                  {r.name} <span className="num text-xs font-normal text-faint">{r.employeeNo}</span>
                </span>
                <span className={`num flex shrink-0 items-center gap-1 font-bold ${tone(r)}`}>
                  {colored && r.level !== 'normal' && <AlertTriangle aria-hidden size={16} strokeWidth={2} />}
                  {hm(r.minutes)}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-chip bg-border" role="img" aria-label={hm(r.minutes)}>
                <div className={`h-full ${bar(r)}`} style={{ width: `${Math.min(r.minutes / limitMin, 1) * 100}%` }} />
              </div>
              <p className={`num text-xs ${tone(r) || 'text-muted'}`}>{r.leftMinutes >= 0 ? t('left', { hm: hm(r.leftMinutes) }) : t('over', { hm: hm(r.leftMinutes) })}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
