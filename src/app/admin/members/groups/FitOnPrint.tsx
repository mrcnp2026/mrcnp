'use client';
// 조직도 출력 (2026-10-25 의뢰인: 조직도 그림이 오른쪽으로 쏠린다) — 그림이 종이(A4 가로)보다 넓으면 가운데 맞춤이 풀려 왼쪽부터 놓이고 오른쪽이 잘렸다.
// 인쇄 직전에 그림 크기를 재서 종이 한 장에 들어가도록 줄이고(zoom) 가운데에 놓는다. 인쇄가 끝나면 원래 크기로 되돌린다.
import { useEffect, useRef } from 'react';

const PAGE_W = 1020; // A4 가로 297mm - 좌우 여백 24mm ≈ 1032px (조금 덜어 둔다)
const PAGE_H = 560; // A4 가로 210mm - 여백 24mm = 186mm ≈ 703px, 제목 줄을 뺀 값

export function FitOnPrint({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fit = () => {
      const el = ref.current;
      if (!el) return;
      el.style.zoom = '';
      const w = el.scrollWidth, h = el.scrollHeight;
      const k = Math.min(1, PAGE_W / Math.max(w, 1), PAGE_H / Math.max(h, 1));
      if (k < 1) el.style.zoom = String(k);
    };
    const reset = () => {
      if (ref.current) ref.current.style.zoom = '';
    };
    window.addEventListener('beforeprint', fit);
    window.addEventListener('afterprint', reset);
    return () => {
      window.removeEventListener('beforeprint', fit);
      window.removeEventListener('afterprint', reset);
    };
  }, []);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
