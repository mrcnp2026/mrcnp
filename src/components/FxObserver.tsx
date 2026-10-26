'use client';
// 그래프 움직임(fx-*)은 화면에 보일 때 시작한다 (2026-10-22 의뢰인: 「오늘의 현황 그래프가 아래에 있어서, 내려서 보일 때 움직여야 한다」).
// <html class="fx-js">이면 fx-* 는 멈춘 채(처음 모양) 기다리고, 화면에 들어오면 data-fx="run"을 붙여 그때 움직인다(globals.css).
// 화면을 옮겨 새로 그려진 그래프도 찾는다(MutationObserver). 숫자 세기(CountUp)는 원래 스스로 보일 때 센다.
import { useEffect } from 'react';

const SEL = '.fx-grow,.fx-grow-x,.fx-draw,.fx-sweep,.fx-reveal,.fx-fade,.fx-pop';

export function FxObserver() {
  useEffect(() => {
    const root = document.documentElement;
    if (!('IntersectionObserver' in window)) {
      root.classList.remove('fx-js');
      return;
    }
    const io = new IntersectionObserver(
      (es) => {
        for (const e of es) {
          if (!e.isIntersecting) continue;
          // 클래스가 아니라 속성 — React가 className을 다시 그려도 지워지지 않는다
          for (const el of waiting.get(e.target) ?? [e.target]) el.setAttribute('data-fx', 'run');
          waiting.delete(e.target);
          io.unobserve(e.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    const seen = new WeakSet<Element>();
    const waiting = new Map<Element, Element[]>();
    const scan = () => {
      document.querySelectorAll(SEL).forEach((el) => {
        if (seen.has(el) || el.hasAttribute('data-fx')) return;
        seen.add(el);
        // mask 안의 모양(동그라미 그래프)은 화면 위치가 없다 — 그 그림(svg) 전체가 보일 때 시작
        // 막대(fx-grow)는 시작 전에 크기가 0이라 보이는지 알 수 없다 — 면적이 있는 바깥 상자가 보일 때 시작 (2026-10-22: 폰 홈의 주간 막대가 멈춰 있었다)
        const target = (el.closest('mask') && el.closest('svg')) || (el.matches('.fx-grow,.fx-grow-x') && el.parentElement) || el;
        waiting.set(target, [...(waiting.get(target) ?? []), el]);
        io.observe(target);
      });
    };
    scan();
    let raf = 0;
    const mo = new MutationObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(scan);
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);
  return null;
}
