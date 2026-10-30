// 현황판 그래프 카드 — 막대 · 동그라미(도넛) · 선(곡선) (2026-10-06 · 10-11 의뢰인: 막대·선·동그라미 그래프로 집계를 보는 현황판).
// 2026-10-27 의뢰인: 「기존 그래프가 별로다 → 키트처럼, 시안보다 더 잘」 — 그리는 부분을 components/charts/로 갈아 끼웠다(이전 판: 백업/Analytics-2026-10-27.tsx.bak).
//  · 맨 위 숫자 칸 4개는 KpiRow.tsx
// 색만으로 뜻을 전하지 않는다 — 옆에 이름과 숫자를 항상 함께 적는다 (R-10-8). 문장은 부르는 쪽이 번역해서 넘긴다 (4-10).
import { AreaChart, type AreaPoint } from '@/components/charts/AreaChart';
import { BarChart, type BarDatum } from '@/components/charts/BarChart';
import { Donut } from '@/components/charts/Donut';
import { Gauge } from '@/components/charts/Gauge';
import { Card, CardTitle } from '@/components/ui';

/** n = 막대 높이를 정하는 값. text = 막대 위에 적을 글자 (없으면 n). sub = 날짜 아래 둘째 줄 (요일) */
export type Bar = BarDatum;
/** avgLabel = 평균 점선 옆 이름(「평균」), vsAvg = 말풍선 둘째 줄(「평균보다 %d」) */
type AvgText = { avgLabel?: string; vsAvg?: string; avgUnit?: string };
/** after(ms): 화면을 연 뒤 이 시간 전에는 움직이지 않는다 — 첫 화면에서 그래프가 차례로 움직이게 */
type After = { after?: number };

export function BarCard({ title, unit, bars, empty, dense = false, className = '', after, ...avg }: { title: string; unit: string; bars: Bar[]; empty?: string; dense?: boolean; className?: string } & AvgText & After) {
  const none = bars.every((d) => d.n === 0);
  return (
    <Card className={`flex flex-col gap-3 ${className}`}>
      <CardTitle aside={<span className="text-xs text-faint">{unit}</span>}>{title}</CardTitle>
      {none && empty && <p className="text-sm text-faint">{empty}</p>}
      {/* 폰: 모두 0이면 빈 그래프 칸을 빼고 한 줄 안내만 (2026-10-22 — 세로로 길기만 했다) */}
      <div className={`flex flex-1 flex-col ${none && empty ? 'max-lg:hidden' : ''}`}>
        <BarChart bars={bars} dense={dense} ariaLabel={title} after={after} {...avg} />
      </div>
    </Card>
  );
}

// 조각 색: 정상(초록) · 지각(호박색) · 미출근(옅은 갈회색) · 휴무(더 옅은 바탕색) — 시안 「지점별 강사료」의 초록 · 호박 · 베이지
export type Slice = { key: string; label: string; n: number; tone: 'primary' | 'warn' | 'danger' | 'muted' };
const COLOR = { primary: 'var(--t-color-primary)', warn: 'var(--t-color-chart-extra)', danger: 'var(--t-color-chart-idle)', muted: 'var(--t-color-border)' } as const;

/** 동그라미(고리) 그래프 — 가운데에 큰 숫자 하나, 오른쪽에 항목별 이름 · 숫자 · 비율 */
export function DonutCard({ title, unit, slices, center, centerLabel, className = '', after }: { title: string; unit: string; slices: Slice[]; center: string; centerLabel: string; className?: string } & After) {
  return (
    <Card className={`flex flex-col gap-3 ${className}`}>
      <CardTitle aside={<span className="text-xs text-faint">{unit}</span>}>{title}</CardTitle>
      <Donut slices={slices.map((s) => ({ key: s.key, label: s.label, n: s.n, color: COLOR[s.tone] }))} center={center} centerLabel={centerLabel} ariaLabel={title} after={after} />
    </Card>
  );
}

/** 반원 게이지 그래프 — 출근율 하나를 크게, 아래에 항목별 비율 막대 · 이름 · 숫자 · 비율 (2026-10-30 의뢰인: 「출근율 도넛 말고 반원으로 — 리포트 때 만든 반원」) */
export function GaugeCard({ title, unit, slices, value, caption, className = '', after }: { title: string; unit: string; slices: Slice[]; value: number | null; caption?: string; className?: string } & After) {
  const total = slices.reduce((a, s) => a + s.n, 0);
  return (
    <Card className={`flex flex-col gap-3 ${className}`}>
      <CardTitle aside={<span className="text-xs text-faint">{unit}</span>}>{title}</CardTitle>
      <Gauge
        value={value}
        caption={caption}
        ariaLabel={title}
        after={after}
        parts={slices.map((s) => ({ key: s.key, label: s.label, value: `${s.n} · ${total ? Math.round((s.n / total) * 100) : 0}%`, share: s.n, color: COLOR[s.tone] }))}
      />
    </Card>
  );
}

export type Point = AreaPoint;

/** 곡선 그래프 — 날짜별 값 하나. 쉬는 날(dim)은 점을 비운다. 손을 대면 그날 값과 평균과의 차이 */
export function LineCard({ title, unit, points, className = '', avgLabel, vsAvg, avgUnit, after }: { title: string; unit: string; points: Point[]; className?: string } & AvgText & After) {
  return (
    <Card className={`flex flex-col gap-3 ${className}`}>
      <CardTitle aside={<span className="text-xs text-faint">{unit}</span>}>{title}</CardTitle>
      <div className="flex flex-1 flex-col justify-end">
        <AreaChart points={points} unit={avgUnit} avgLabel={avgLabel} vsAvg={vsAvg} ariaLabel={title} after={after} />
      </div>
    </Card>
  );
}
