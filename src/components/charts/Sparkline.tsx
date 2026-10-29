'use client';
// 지표 타일 오른쪽 아래 작은 추세선 + 끝점 (키트 Sparkline). 축 · 숫자 없음. 보일 때 왼쪽부터 그려진다.
import { C, smoothPath, useInView, type Pt } from './base';

export function Sparkline({ values, width = 92, height = 32 }: { values: number[]; width?: number; height?: number }) {
  const [ref, inView] = useInView<SVGSVGElement>(0.1);
  const n = values.length;
  if (n < 2) return null;
  const mn = Math.min(...values);
  const mx = Math.max(...values);
  const pts: Pt[] = values.map((v, i) => [3 + (i * (width - 6)) / (n - 1), height - 5 - ((v - mn) / (mx - mn || 1)) * (height - 10)]);
  const end = pts[n - 1];
  return (
    <svg ref={ref} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className={`od-wait ${inView ? 'od-in' : ''} overflow-visible`}>
      <path className="od-spark" pathLength={1} d={smoothPath(pts)} fill="none" stroke={C.text} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" opacity={0.8} />
      <circle className="od-endpt" cx={end[0]} cy={end[1]} r={2.6} fill={C.text} style={{ animationDelay: "calc(1.7s * var(--od-t))" }} />
    </svg>
  );
}
