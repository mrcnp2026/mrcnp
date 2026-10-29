'use client';
// 그래프 공통 (2026-10-27 온디랩스 키트 · 원장 대시보드 시안을 우리 토큰으로 옮김).
// 색은 theme.ts가 내보낸 CSS 변수(--t-color-…)만 쓴다 — 색 값(#…)은 theme.ts 밖에 쓰지 않는다.
import { useEffect, useRef, useState } from 'react';

export const C = {
  accent: 'var(--t-color-primary)',
  accent2: 'var(--t-color-accent-2)',
  soft: 'var(--t-color-primary-tint)',
  card: 'var(--t-color-bg)',
  track: 'var(--t-color-rail)',
  grid: 'var(--t-color-border)',
  muted: 'var(--t-color-muted)',
  faint: 'var(--t-color-faint)',
  text: 'var(--t-color-text)',
  ink: 'var(--t-color-primary-deep)',
  onInk: 'var(--t-color-on-primary)',
  amber: 'var(--t-color-chart-extra)',
  idle: 'var(--t-color-chart-idle)',
  danger: 'var(--t-color-danger)',
  warn: 'var(--t-color-warn)',
} as const;

export const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** globals.css의 --od-t(움직임 시간 배율) — JS로 도는 움직임(도넛 · 숫자)도 같은 빠르기로 */
export function motionScale(): number {
  if (typeof window === 'undefined') return 1;
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--od-t'));
  return Number.isFinite(v) && v > 0 ? v : 1;
}

/** 화면에 1/4쯤 들어온 순간 한 번 true. 그 상자에 `od-wait` + (보이면) `od-in`을 붙이면 안의 CSS 움직임이 그때 시작한다.
 *  after(ms): 화면을 연 뒤 이 시간이 지나기 전에는 시작하지 않는다 — 첫 화면에 그래프가 여럿 보일 때 차례로 움직이게
 *  (2026-10-27 의뢰인: 휴가 현황 막대가 끝난 뒤 도넛 · 지각 막대가 시작해야 끝까지 보인다). 나중에 스크롤해서 보이면 기다리지 않는다 */
export function useInView<T extends Element>(threshold = 0.25, after = 0) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  const born = useRef(0);
  useEffect(() => {
    born.current = performance.now();
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const go = () => {
      const wait = reduceMotion() ? 0 : Math.max(0, after - (performance.now() - born.current));
      if (wait === 0) setInView(true);
      else timer = setTimeout(() => setInView(true), wait);
    };
    if (typeof IntersectionObserver === 'undefined') {
      go();
      return () => clearTimeout(timer);
    }
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) {
        io.disconnect();
        go();
      }
    }, { threshold });
    io.observe(el);
    return () => {
      io.disconnect();
      clearTimeout(timer);
    };
  }, [threshold, inView, after]);
  return [ref, inView] as const;
}

/** 0 → 1 진행률 (보일 때 시작, 끝에서 느려짐). 도넛 조각이 자라는 데 쓴다 */
export function useProgress(active: boolean, ms = 1500, delay = 300) {
  const [p, setP] = useState(0);
  useEffect(() => {
    if (!active) return;
    if (reduceMotion()) {
      setP(1);
      return;
    }
    const k = motionScale();
    let raf = 0;
    let start: number | null = null;
    const step = (ts: number) => {
      if (start === null) start = ts;
      const x = Math.min(1, Math.max(0, (ts - start - delay * k) / (ms * k)));
      setP(1 - Math.pow(1 - x, 3));
      if (x < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [active, ms, delay]);
  return p;
}

export type Pt = [number, number];

/** 점 → 부드러운 곡선 (Catmull-Rom → 3차 베지어). 값이 0 밑으로 출렁이지 않게 y는 바닥(bottom)에서 자른다 */
export function smoothPath(pts: Pt[], bottom = Infinity): string {
  if (pts.length === 0) return '';
  const f = (n: number) => n.toFixed(1);
  const cy = (n: number) => Math.min(bottom, n);
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    d += ` C${f(p1[0] + (p2[0] - p0[0]) / 6)},${f(cy(p1[1] + (p2[1] - p0[1]) / 6))} ${f(p2[0] - (p3[0] - p1[0]) / 6)},${f(cy(p2[1] - (p3[1] - p1[1]) / 6))} ${f(p2[0])},${f(p2[1])}`;
  }
  return d;
}

export function areaPath(pts: Pt[], bottom: number): string {
  if (pts.length === 0) return '';
  const last = pts[pts.length - 1];
  return `${smoothPath(pts, bottom)} L${last[0].toFixed(1)},${bottom} L${pts[0][0].toFixed(1)},${bottom} Z`;
}

/** 눈금을 보기 좋은 값으로 — 최댓값 위로 한 칸 여유, 눈금 4칸 */
export function niceMax(max: number): number {
  if (max <= 0) return 4;
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  return Math.max(step * 4, Math.ceil(max / step) * step);
}
