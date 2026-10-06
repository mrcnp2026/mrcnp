// PC 현황판 그래프 (2026-10-06 의뢰인: 샤플처럼 데이터를 그래프로) — 오늘 출근율 고리 + 최근 7일 출근 인원 막대.
// 색은 파랑 하나 (한 가지 계열이라 범례가 필요 없다 — 제목이 무엇인지 말한다). 숫자·글자는 글자 색, 막대만 파랑.
// 문장은 부르는 쪽이 번역해서 넘긴다 (4-10).
import { Card, CardTitle } from '@/components/ui';

export type TrendDay = { key: string; label: string; weekday: string; n: number; off: boolean; tip: string };

const R = 42; // 고리 반지름 (viewBox 100 기준)
const C = 2 * Math.PI * R;

export function TodayCharts({
  rate,
  rateTitle,
  rateSub,
  rows,
  trendTitle,
  trendUnit,
  trend,
  max,
  className = '',
}: {
  rate: number | null; // 0~100, 출근 대상이 없는 날은 null
  rateTitle: string;
  rateSub: string;
  rows: { label: string; value: number; warn?: boolean }[];
  trendTitle: string;
  trendUnit: string;
  trend: TrendDay[];
  max: number;
  className?: string;
}) {
  const top = Math.max(1, max, ...trend.map((d) => d.n));
  return (
    <div className={`grid-cols-5 gap-4 ${className}`}>
      <Card className="col-span-2 flex flex-col gap-4">
        <CardTitle>{rateTitle}</CardTitle>
        <div className="flex items-center gap-5">
          <div className="relative size-32 shrink-0">
            <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
              <circle cx="50" cy="50" r={R} fill="none" strokeWidth="10" className="stroke-surface" />
              {rate !== null && rate > 0 && (
                <circle cx="50" cy="50" r={R} fill="none" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(C * rate) / 100} ${C}`} className="stroke-primary" />
              )}
            </svg>
            <p className="num absolute inset-0 flex items-center justify-center text-2xl font-extrabold">{rate === null ? '–' : `${rate}%`}</p>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <p className="num text-sm text-muted">{rateSub}</p>
            <ul className="flex flex-col gap-1">
              {rows.map((r) => (
                <li key={r.label} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-muted">{r.label}</span>
                  <span className={`num font-bold ${r.warn && r.value > 0 ? 'text-warn' : 'text-text'}`}>{r.value}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Card>

      <Card className="col-span-3 flex flex-col gap-4">
        <CardTitle aside={<span className="text-xs text-faint">{trendUnit}</span>}>{trendTitle}</CardTitle>
        <ul className="flex h-44 items-stretch gap-3">
          {trend.map((d) => (
            <li key={d.key} title={d.tip} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <span className="flex w-full flex-1 flex-col items-center justify-end gap-1 border-b border-border">
                <span className="num text-xs font-bold text-text">{d.n}</span>
                <span className={`w-full max-w-10 rounded-t ${d.n > 0 ? 'bg-primary' : ''}`} style={{ height: `${(d.n / top) * 80}%` }} />
              </span>
              <span className={`num flex flex-col items-center text-xs leading-tight ${d.off ? 'text-faint' : 'text-muted'}`}>
                <span>{d.label}</span>
                <span>{d.weekday}</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
