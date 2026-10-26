'use client';
// 숫자가 0부터 올라가는 움직임 (2026-10-22 의뢰인: 「숫자는 카운트 애니메이션을 넣어서 숫자가 올라가는 모습」).
// 「25명」 「17시간 30분」 「1,234,000원」 「2.75 / 16」처럼 글자 안의 숫자를 모두 같은 속도로 함께 센다(단위 · 글자는 그대로).
// 처음 화면에 보일 때 한 번만(1.8초 — 2026-10-22 「너무 빠르다」로 늘림). 움직임 줄이기 설정이면 세지 않고 바로 값을 보인다. 서버가 그린 값은 끝 값 그대로라 검색 · 인쇄에 영향이 없다.
import { useEffect, useRef, useState } from 'react';

const NUM = /\d[\d,]*(?:\.\d+)?/g;

export function CountUp({ value, ms = 1800, className }: { value: string | number; ms?: number; className?: string }) {
  const text = String(value);
  const nums = text.match(NUM) ?? [];
  const [k, setK] = useState<number | null>(null); // 0 ~ 1, null = 끝(그대로)
  const el = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (nums.length === 0 || nums.every((n) => Number(n.replace(/,/g, '')) === 0)) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const run = () => {
      const start = performance.now();
      const step = (now: number) => {
        const x = Math.min(1, (now - start) / ms);
        setK(x >= 1 ? null : 1 - Math.pow(1 - x, 4)); // 처음엔 빠르게, 끝으로 갈수록 천천히
        if (x < 1) raf = requestAnimationFrame(step);
      };
      setK(0);
      raf = requestAnimationFrame(step);
    };
    const node = el.current;
    if (!node || !('IntersectionObserver' in window)) {
      run();
      return () => cancelAnimationFrame(raf);
    }
    // 화면에 들어올 때 시작 (아래쪽 카드는 내려 볼 때)
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) {
        io.disconnect();
        run();
      }
    });
    io.observe(node);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
    // 값이 바뀔 때만 다시 센다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  if (k === null) return <span ref={el} className={className}>{text}</span>;
  const shown = text.replace(NUM, (n) => {
    const dec = n.includes('.') ? n.split('.')[1].length : 0;
    const v = (Number(n.replace(/,/g, '')) * k).toFixed(dec);
    return n.includes(',') ? Number(v).toLocaleString('ko-KR', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : v;
  });
  return (
    <span ref={el} className={className}>
      {shown}
    </span>
  );
}
