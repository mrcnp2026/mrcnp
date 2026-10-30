'use client';
// 곡선 그래프 (키트 AreaChart를 우리 앱에 맞게 다시 씀, 2026-10-27).
// 등장: 면이 흐리게 깔리고 → 선이 왼쪽부터 펜으로 그어지고 → 평균 점선 → 끝점(오늘)에 고리가 퍼진다. 화면에 보일 때 시작한다.
// 손을 대면: 세로 점선 + 점 + 검은 말풍선(그날 값 · 평균과의 차이), 손댄 곳 오른쪽은 흐려진다(시안의 scrub).
// 시안보다 나은 점: 폰 손가락으로 눌러도 · 끌어도 따라오고, 키보드 ←→로도 훑을 수 있다. 쉬는 날(dim)은 점을 비운다.
// 문장은 부르는 쪽이 번역해서 넘긴다 — vsAvg의 %d 자리에 평균과의 차이가 들어간다.
import { useId, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { C, areaPath, niceMax, smoothPath, useInView, type Pt } from './base';

export type AreaPoint = { key: string; label: string; n: number; tip: string; dim?: boolean };

const W = 760;
const H = 250;
const L = 34;
const R = 14;
const TOP = 16;
const BOT = 218;

// 가로 점선은 테두리색보다 살짝 진하게 — 바탕에 묻혀 잘 안 보였다 (2026-10-28 의뢰인: 「아주 조금만 더 진하게」). 맨 아래 실선은 그대로
const DASH = `color-mix(in srgb, ${C.grid} 85%, ${C.text})`;

export function AreaChart({ points, unit = '', avgLabel, vsAvg, ariaLabel, after = 0 }: { points: AreaPoint[]; unit?: string; avgLabel?: string; vsAvg?: string; ariaLabel: string; after?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const [ref, inView] = useInView<HTMLDivElement>(0.15, after);
  const id = useId().replace(/:/g, '');
  const n = points.length;
  if (n === 0) return null;
  const max = niceMax(Math.max(...points.map((p) => p.n)));
  const sx = (W - L - R) / Math.max(1, n - 1);
  const x = (i: number) => L + i * sx;
  const y = (v: number) => TOP + (1 - v / max) * (BOT - TOP);
  const pts: Pt[] = points.map((p, i) => [x(i), y(p.n)]);
  const work = points.filter((p) => !p.dim);
  const avg = work.length ? work.reduce((a, p) => a + p.n, 0) / work.length : 0;
  const end = pts[n - 1];
  const every = Math.max(1, Math.ceil(n / 8));
  const h = hover;

  const pick = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const vx = ((e.clientX - r.left) / r.width) * W;
    setHover(Math.max(0, Math.min(n - 1, Math.round((vx - L) / sx))));
  };
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight') setHover((v) => Math.min(n - 1, (v ?? -1) + 1));
    else if (e.key === 'ArrowLeft') setHover((v) => Math.max(0, (v ?? n) - 1));
    else if (e.key === 'Escape') setHover(null);
    else return;
    e.preventDefault();
  };
  const frac = h === null ? 0 : pts[h][0] / W;
  const diff = h === null ? 0 : Math.round((points[h].n - avg) * 10) / 10;

  return (
    <div
      ref={ref}
      role="img"
      aria-label={ariaLabel}
      tabIndex={0}
      className={`od-wait ${inView ? 'od-in' : ''} relative touch-pan-y rounded-button outline-none focus-visible:ring-2 focus-visible:ring-primary`}
      onPointerMove={pick}
      onPointerDown={pick}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(null)}
      onKeyDown={key}
      onBlur={() => setHover(null)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full overflow-visible" aria-hidden>
        <defs>
          <linearGradient id={`f${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.accent} stopOpacity={0.3} />
            <stop offset="70%" stopColor={C.accent} stopOpacity={0.06} />
            <stop offset="100%" stopColor={C.accent} stopOpacity={0} />
          </linearGradient>
          <linearGradient id={`s${id}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={C.accent2} />
            <stop offset="100%" stopColor={C.accent} />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3, 4].map((g) => (
          <g key={g}>
            <line x1={L} x2={W - R} y1={y((max / 4) * g)} y2={y((max / 4) * g)} stroke={g === 0 ? C.grid : DASH} strokeDasharray={g === 0 ? undefined : '2 5'} />
            <text x={L - 8} y={y((max / 4) * g) + 4} fill={C.faint} fontSize={11.5} textAnchor="end" className="num">{Math.round((max / 4) * g)}</text>
          </g>
        ))}
        <path className="od-area" d={areaPath(pts, BOT)} fill={`url(#f${id})`} />
        {avg > 0 && (
          <g className="od-ghost">
            <line x1={L} x2={W - R} y1={y(avg)} y2={y(avg)} stroke={C.muted} strokeWidth={1.2} strokeDasharray="4 5" opacity={0.6} />
            {avgLabel && <text x={W - R} y={y(avg) - 6} fill={C.muted} fontSize={11.5} textAnchor="end" className="num">{avgLabel} {Math.round(avg * 10) / 10}{unit}</text>}
          </g>
        )}
        <path className="od-line" pathLength={1} d={smoothPath(pts, BOT)} fill="none" stroke={`url(#s${id})`} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" />
        {/* 쉬는 날은 빈 점 — 선 위에서 「이날은 원래 적다」를 알 수 있게 */}
        <g className="od-endpt">
          {pts.map((p, i) => points[i].dim && <circle key={points[i].key} cx={p[0]} cy={p[1]} r={3.2} fill={C.card} stroke={C.idle} strokeWidth={1.6} />)}
        </g>
        <g className="od-endpt">
          <circle className="od-pulse" cx={end[0]} cy={end[1]} r={6} fill={C.accent} />
          <circle cx={end[0]} cy={end[1]} r={5.5} fill={C.card} stroke={C.accent} strokeWidth={3} />
        </g>
        {h !== null && (
          <g pointerEvents="none">
            <rect x={pts[h][0]} y={0} width={Math.max(0, W - R - pts[h][0])} height={BOT + 1} fill={C.card} opacity={0.6} />
            <line x1={pts[h][0]} x2={pts[h][0]} y1={TOP} y2={BOT} stroke={C.muted} strokeDasharray="3 4" opacity={0.6} />
            <circle cx={pts[h][0]} cy={pts[h][1]} r={6} fill={C.card} stroke={C.accent} strokeWidth={3} />
          </g>
        )}
        {points.map((p, i) => (
          <text key={p.key} x={x(i)} y={H - 6} fill={h === i ? C.text : C.faint} fontSize={11.5} fontWeight={h === i ? 700 : 400} textAnchor="middle" className="num">
            {(n - 1 - i) % every === 0 || h === i ? p.label : ''}
          </text>
        ))}
      </svg>
      {h !== null && (
        <div
          className="pointer-events-none absolute z-10 min-w-36 rounded-button px-3 py-2.5 text-sm shadow-pop"
          style={{
            left: `${frac * 100}%`,
            top: `${(pts[h][1] / H) * 100}%`,
            transform: `translate(${frac > 0.75 ? '-94%' : frac < 0.2 ? '-6%' : '-50%'}, calc(-100% - 16px))`,
            background: C.ink,
            color: C.onInk,
          }}
        >
          <div className="num font-bold whitespace-nowrap">{points[h].tip}</div>
          {vsAvg && avg > 0 && !points[h].dim && (
            <div className="num mt-1 whitespace-nowrap opacity-75">{vsAvg.replace('%d', `${diff > 0 ? '+' : diff < 0 ? '−' : '±'}${Math.abs(diff)}${unit}`)}</div>
          )}
        </div>
      )}
    </div>
  );
}
