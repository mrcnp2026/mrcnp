'use client';
// 도넛 (키트 Donut · 시안 「지점별 강사료」를 우리 앱에 맞게, 2026-10-27).
// 등장: 화면에 보이면 조각이 시계 방향으로 차례로 자라고, 가운데 숫자가 함께 올라간다.
// 손을 대면: 그 조각이 조금 두꺼워지고(16 → 20, 조각이 하나뿐이면 그대로 — 2026-10-27 의뢰인: 미출근일 때 너무 굵어진다) 가운데가 그 조각의 이름 · 숫자로 바뀌며, 범례의 나머지는 옅어진다.
// 시안보다 나은 점: 범례 줄에 손을 대도 같은 조각이 반응하고(조각이 가늘어도 고를 수 있다), 폰은 눌러서, 키보드는 Tab으로 고른다.
// 색만으로 뜻을 전하지 않는다 — 범례에 이름 · 숫자 · 비율을 항상 함께 적는다.
// 2026-10-28 GSAP로 바꿈: 조각이 자라는 동안 화면 조각을 매 프레임 다시 그리지 않고, 조각(원)의 선 길이 속성만 바꾼다. React는 언제나 끝 모양을 그린다.
import gsap from 'gsap';
import { useLayoutEffect, useRef, useState } from 'react';
import { CountUp } from '../CountUp';
import { C, useInView } from './base';

export type DonutSlice = { key: string; label: string; n: number; color: string };

export function Donut({ slices, center, centerLabel, ariaLabel, after = 0 }: { slices: DonutSlice[]; center: string; centerLabel: string; ariaLabel: string; after?: number }) {
  const [hot, setHot] = useState<number | null>(null);
  const [ref, inView] = useInView<HTMLDivElement>(0.15, after);
  const arcs = useRef<(SVGCircleElement | null)[]>([]);
  const total = slices.reduce((a, s) => a + s.n, 0);
  const live = slices.filter((s) => s.n > 0).length;
  const pct = (s: DonutSlice) => (total > 0 ? Math.round((s.n / total) * 1000) / 10 : 0);
  const gap = live > 1 ? 1.4 : 0; // 조각 사이 틈
  // 진행률 p(0~1)일 때 각 조각의 선 길이 · 시작 위치
  const shape = (p: number) => {
    let a = 0;
    return slices.map((s) => {
      const share = total > 0 ? (s.n / total) * 100 : 0;
      const out = { len: Math.max(0, share * p - gap), off: -a * p };
      a += share;
      return out;
    });
  };
  const paint = (p: number) => shape(p).forEach((x, i) => {
    const c = arcs.current[i];
    if (!c) return;
    c.setAttribute('stroke-dasharray', `${x.len} ${100 - x.len}`);
    c.setAttribute('stroke-dashoffset', String(x.off));
  });
  const motion = useRef(false);
  // 처음 그릴 때는 빈 고리에서 시작한다(움직임 줄이기 설정이면 끝 모양 그대로)
  useLayoutEffect(() => {
    motion.current = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (motion.current) paint(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 보이면 시계 방향으로 자란다 — 1.5초, 0.1초 뒤 (최근 14일 그래프와 같은 시간, 2026-10-28 의뢰인 · 2026-10-29 시작을 당김)
  useLayoutEffect(() => {
    if (!inView || !motion.current) return;
    const o = { p: 0 };
    const tw = gsap.to(o, { p: 1, duration: 1.5, delay: 0.1, ease: 'power2.out', onUpdate: () => paint(o.p) });
    return () => {
      tw.kill();
      paint(1);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, total]);
  const sel = hot === null ? null : slices[hot];

  return (
    <div ref={ref} className="flex flex-1 flex-wrap items-center gap-5 lg:flex-nowrap" onPointerLeave={(e) => e.pointerType === 'mouse' && setHot(null)}>
      <div className="relative size-40 shrink-0" role="img" aria-label={ariaLabel}>
        <svg viewBox="0 0 160 160" className="size-full -rotate-90 overflow-visible" aria-hidden>
          <circle cx={80} cy={80} r={58} pathLength={100} fill="none" stroke={C.track} strokeWidth={16} />
          {total > 0 &&
            slices.map((s, i) => {
              const { len, off } = shape(1)[i];
              if (s.n === 0) return null;
              return (
                <circle
                  key={s.key}
                  ref={(c) => {
                    arcs.current[i] = c;
                  }}
                  cx={80}
                  cy={80}
                  r={58}
                  pathLength={100}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={hot === i && live > 1 ? 20 : 16}
                  strokeDasharray={`${len} ${100 - len}`}
                  strokeDashoffset={off}
                  opacity={hot === null || hot === i || live < 2 ? 1 : 0.35}
                  className="cursor-pointer transition-[stroke-width,opacity] duration-200"
                  onPointerEnter={() => setHot(i)}
                  onPointerDown={() => setHot(i)}
                />
              );
            })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="max-w-24 truncate text-xs text-muted">{sel ? sel.label : centerLabel}</span>
          <span className="num text-2xl font-bold tracking-tight">{sel ? sel.n : inView ? <CountUp value={center} /> : <span className="opacity-0">{center}</span>}</span>
          {sel && <span className="num text-xs text-faint">{pct(sel)}%</span>}
        </div>
      </div>
      <ul className="flex min-w-36 flex-1 flex-col gap-1">
        {slices.map((s, i) => (
          <li key={s.key}>
            <button
              type="button"
              className="flex min-h-9 w-full items-center gap-2 rounded-button px-2 text-left text-sm transition-[opacity,background-color] duration-200 hover:bg-surface focus-visible:bg-surface"
              style={{ opacity: hot === null || hot === i ? 1 : 0.45 }}
              onPointerEnter={() => setHot(i)}
              onFocus={() => setHot(i)}
              onBlur={() => setHot(null)}
              onClick={() => setHot(hot === i ? null : i)}
            >
              <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
              <span className="min-w-0 flex-1 truncate text-muted">{s.label}</span>
              <span className="num font-bold">{s.n}</span>
              <span className="num w-12 shrink-0 text-right text-xs text-faint">{total > 0 ? `${Math.round(pct(s))}%` : '–'}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
