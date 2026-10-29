'use client';
// 숫자가 0부터 올라가는 움직임 (2026-10-22 의뢰인: 「숫자는 카운트 애니메이션을 넣어서 숫자가 올라가는 모습」).
// 「25명」 「17시간 30분」 「1,234,000원」 「2.75 / 16」처럼 글자 안의 숫자를 모두 같은 속도로 함께 센다(단위 · 글자는 그대로).
// 처음 화면에 보일 때 한 번(1.8초 — 2026-10-22 「너무 빠르다」로 늘림). 값이 바뀌면 0이 아니라 앞의 값에서 이어서 굴러간다.
// 움직임 줄이기 설정이면 세지 않고 바로 값을 보인다. 서버가 그린 값은 끝 값 그대로라 검색 · 인쇄에 영향이 없다.
// 2026-10-28 GSAP로 바꿈: 예전에는 매 프레임 화면 조각을 다시 그렸다(숫자가 많은 화면에서 무겁다). 이제 React가 만든 글자 노드의 값만 바꾼다 —
// 노드를 갈아 끼우지 않으므로 React가 나중에 값을 바꿔도 같은 노드에 들어간다.
import gsap from 'gsap';
import { useEffect, useRef } from 'react';

const NUM = /\d[\d,]*(?:\.\d+)?/g;
const numsOf = (text: string) => (text.match(NUM) ?? []).map((n) => Number(n.replace(/,/g, '')));
/** 글자 안의 숫자를 k(0~1)만큼 from → to로 옮긴 글자 */
function blend(text: string, from: number[], k: number) {
  let i = 0;
  return text.replace(NUM, (n) => {
    const to = Number(n.replace(/,/g, ''));
    const a = from[i++] ?? 0;
    const dec = n.includes('.') ? n.split('.')[1].length : 0;
    const v = (a + (to - a) * k).toFixed(dec);
    return n.includes(',') ? Number(v).toLocaleString('ko-KR', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : v;
  });
}

export function CountUp({ value, ms = 1800, delay = 0.15, className }: { value: string | number; ms?: number; delay?: number; className?: string }) {
  const text = String(value);
  const el = useRef<HTMLSpanElement>(null);
  const shown = useRef<number[] | null>(null); // 화면에 마지막으로 보인 숫자 — 다음 값은 여기서 이어서
  useEffect(() => {
    const node = el.current?.firstChild;
    const to = numsOf(text);
    if (!node || node.nodeType !== Node.TEXT_NODE || to.length === 0) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const from = shown.current ?? to.map(() => 0);
    if (reduce || from.every((v, i) => v === to[i])) {
      shown.current = to;
      return;
    }
    const set = (k: number) => (node.nodeValue = blend(text, from, k));
    const p = { k: 0 };
    let tween: gsap.core.Tween | null = null;
    const run = () => {
      shown.current = to; // 실제로 움직이기 시작할 때 기록한다 — 개발 모드에서 효과가 두 번 돌아도 처음 것이 값을 가로채지 않게
      set(0);
      // 처음엔 빠르게, 끝으로 갈수록 천천히 — 카드가 올라오는 동안(0.15초) 기다렸다가 센다
      tween = gsap.to(p, { k: 1, duration: ms / 1000, delay: from.some((v) => v !== 0) ? 0 : delay, ease: 'power4.out', onUpdate: () => set(p.k), onComplete: () => (node.nodeValue = text) });
    };
    const first = from.every((v) => v === 0);
    if (!first || !('IntersectionObserver' in window) || !el.current) {
      run();
      return () => {
        tween?.kill();
        node.nodeValue = text;
      };
    }
    // 처음에는 화면에 들어올 때 시작 (아래쪽 카드는 내려 볼 때)
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) {
        io.disconnect();
        run();
      }
    });
    io.observe(el.current);
    return () => {
      io.disconnect();
      tween?.kill();
      node.nodeValue = text;
    };
  }, [text, ms, delay]);
  return (
    <span ref={el} className={className}>
      {text}
    </span>
  );
}
