'use client';
// 반원 게이지 (키트 Gauge · 시안 「지급 준비 상태」, 2026-10-27) — 휴가 소진율 · 출근율처럼 「전체 중 몇 %」 하나를 크게.
// 등장: 화면에 보이면 호가 왼쪽부터 차오르고 가운데 숫자가 함께 올라간다. 끝점에 흰 동그라미.
// 아래 줄(parts)은 시안처럼 비율 막대 + 이름 · 값 — 색만으로 읽지 않게 이름과 숫자를 함께 적는다.
import { C, useInView, useProgress } from './base';

export type GaugePart = { key: string; label: string; value: string; share: number; color: string };

export function Gauge({ value, caption, parts = [], ariaLabel }: { value: number | null; caption?: string; parts?: GaugePart[]; ariaLabel: string }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const p = useProgress(inView, 1500, 200);
  const v = Math.min(100, Math.max(0, value ?? 0)) * p;
  const ang = Math.PI * (1 - v / 100);
  const ticks = Array.from({ length: 11 }, (_, i) => Math.PI * (1 - i / 10));
  const total = parts.reduce((a, x) => a + x.share, 0) || 1;
  return (
    <div ref={ref} className={`od-wait ${inView ? "od-in" : ""} flex w-full flex-1 flex-col justify-center gap-4`}>
      <div className="relative mx-auto w-full max-w-72" role="img" aria-label={ariaLabel}>
        <svg viewBox="0 0 240 136" className="block h-auto w-full" aria-hidden>
          <defs>
            <linearGradient id="od-gauge" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={C.accent2} />
              <stop offset="100%" stopColor={C.accent} />
            </linearGradient>
          </defs>
          {ticks.map((a) => (
            <line key={a} x1={120 + Math.cos(a) * 110} y1={120 - Math.sin(a) * 110} x2={120 + Math.cos(a) * 115} y2={120 - Math.sin(a) * 115} stroke={C.grid} strokeWidth={1.5} strokeLinecap="round" />
          ))}
          <path d="M24,120 A96,96 0 0 1 216,120" pathLength={100} fill="none" stroke={C.track} strokeWidth={16} strokeLinecap="round" />
          {value !== null && v > 0 && (
            <>
              <path d="M24,120 A96,96 0 0 1 216,120" pathLength={100} fill="none" stroke="url(#od-gauge)" strokeWidth={16} strokeLinecap="round" strokeDasharray="100 100" strokeDashoffset={100 - v} />
              <circle cx={120 + Math.cos(ang) * 96} cy={120 - Math.sin(ang) * 96} r={6} fill={C.card} stroke={C.accent} strokeWidth={3} />
            </>
          )}
        </svg>
        <div className="absolute inset-x-0 bottom-1 text-center">
          <div className="num text-3xl leading-none font-bold tracking-tight">{value === null ? '–' : `${Math.round(v * 10) / 10}%`}</div>
          {caption && <div className="mt-1 text-xs text-muted">{caption}</div>}
        </div>
      </div>
      {parts.length > 0 && (
        <>
          <div aria-hidden className="flex h-2 gap-1">
            {parts.map((x, i) => (
              <span key={x.key} className="od-barx h-full rounded-full" style={{ width: `${(x.share / total) * 100}%`, background: x.color, animationDelay: `calc(${(0.6 + i * 0.15).toFixed(2)}s * var(--od-t))` }} />
            ))}
          </div>
          <ul className="flex flex-col gap-1.5 text-sm">
            {parts.map((x) => (
              <li key={x.key} className="flex items-center gap-2">
                <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: x.color }} />
                <span className="flex-1 text-muted">{x.label}</span>
                <span className="num font-semibold">{x.value}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
