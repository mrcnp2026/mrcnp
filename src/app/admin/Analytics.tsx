// PC 현황판 분석 조각 (2026-10-06 의뢰인: 그래프는 좋지만 화면이 흩어져 난잡하다 → 한 화면에 역할이 겹치는 것을 빼고 줄을 맞춘다).
//  · KpiRow: 맨 위 숫자 칸 4개 — 같은 크기, 가장 먼저 읽히는 것
//  · TrendCard: 최근 30일 출근 인원 비율 (선)
//  · LateCard: 최근 14일 지각 (막대)
// 색: 한 가지 계열(파랑)만 쓴다 — 상태별 색 5가지는 색각 구분 검사를 통과하지 못해, 상태는 글자·숫자로 구분한다.
// 글자·숫자는 글자 색, 도형만 파랑. 막대·점에 마우스를 올리면 그날 값이 뜬다 (title).
// 문장은 부르는 쪽이 번역해서 넘긴다 (4-10).
import Link from 'next/link';
import { Card, CardTitle } from '@/components/ui';

export type Kpi = { label: string; value: string; sub?: string; warn?: boolean; href?: string };
export type Point = { key: string; label: string; value: number; tip: string }; // value: 0~100 (%)
export type Bar = { key: string; label: string; sub?: string; n: number; tip: string };

const W = 640;
const H = 200;
const PAD = { l: 36, r: 16, t: 12, b: 28 };

export function KpiRow({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="hidden grid-cols-4 gap-4 lg:grid">
      {kpis.map((k) => {
        const body = (
          <>
            <span className="text-sm text-muted">{k.label}</span>
            <span className={`num text-3xl leading-none font-extrabold ${k.warn ? 'text-warn' : 'text-text'}`}>{k.value}</span>
            <span className="num min-h-4 text-xs text-faint">{k.sub}</span>
          </>
        );
        const cls = 'flex flex-col gap-2 rounded-card bg-bg p-5';
        return k.href ? (
          <Link key={k.label} href={k.href} className={cls}>
            {body}
          </Link>
        ) : (
          <div key={k.label} className={cls}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

export function TrendCard({ title, note, empty, points, className = '' }: { title: string; note: string; empty: string; points: Point[]; className?: string }) {
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const x = (i: number) => PAD.l + (iw * i) / Math.max(1, points.length - 1);
  const y = (v: number) => PAD.t + ih * (1 - v / 100);
  const line = points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ');
  const last = points.length - 1;
  const marks = [...new Set([0, Math.floor(last / 2), last])];
  return (
    <Card className={`flex flex-col gap-3 ${className}`}>
      <CardTitle aside={<span className="text-xs text-faint">{note}</span>}>{title}</CardTitle>
      {points.length < 2 ? (
        <p className="flex flex-1 items-center justify-center py-12 text-sm text-faint">{empty}</p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
          {[0, 50, 100].map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} strokeWidth="1" className="stroke-border" />
              <text x={PAD.l - 8} y={y(v) + 4} textAnchor="end" className="num fill-faint text-xs">{v}%</text>
            </g>
          ))}
          <polygon points={`${x(0)},${y(0)} ${line} ${x(last)},${y(0)}`} className="fill-primary-tint" />
          <polyline points={line} fill="none" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" className="stroke-primary" />
          <circle cx={x(last)} cy={y(points[last].value)} r="5" strokeWidth="2" className="fill-primary stroke-bg" />
          {marks.map((i) => (
            <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'} className="num fill-muted text-xs">{points[i].label}</text>
          ))}
          {/* 날짜마다 넓은 투명 영역 — 선보다 넓게 잡아 올리기 쉽게 */}
          {points.map((p, i) => (
            <rect key={p.key} x={x(i) - iw / last / 2} y={PAD.t} width={iw / last} height={ih} fill="transparent">
              <title>{p.tip}</title>
            </rect>
          ))}
        </svg>
      )}
    </Card>
  );
}

export function LateCard({ title, unit, bars, className = '' }: { title: string; unit: string; bars: Bar[]; className?: string }) {
  const top = Math.max(1, ...bars.map((d) => d.n));
  return (
    <Card className={`flex flex-col gap-3 ${className}`}>
      <CardTitle aside={<span className="text-xs text-faint">{unit}</span>}>{title}</CardTitle>
      <ul className="flex min-h-36 flex-1 items-stretch gap-1">
        {bars.map((d, i) => (
          <li key={d.key} title={d.tip} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <span className="flex w-full flex-1 flex-col items-center justify-end gap-1 border-b border-border">
              {d.n > 0 && <span className="num text-xs font-bold text-text">{d.n}</span>}
              <span className={`w-full rounded-t ${d.n > 0 ? 'bg-primary' : ''}`} style={{ height: `${(d.n / top) * 80}%` }} />
            </span>
            {/* 좁은 칸: 날짜는 한 칸 건너 하나씩만 적는다 (마지막 날은 항상) */}
            <span className="num h-4 text-xs leading-tight text-muted">{(bars.length - 1 - i) % 2 === 0 ? d.label : ''}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
