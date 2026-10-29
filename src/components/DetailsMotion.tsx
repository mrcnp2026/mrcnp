'use client';
// 서랍(<details>)을 열고 닫을 때 높이가 부드럽게 바뀐다 (2026-10-27 의뢰인: 「자세히 보기 — 닫기가 너무 확 닫힌다」).
// CSS만으로는(::details-content) 지원하는 브라우저가 적고, 닫을 때는 내용이 먼저 사라져 툭 닫혔다 →
// 요약 줄(summary)을 누르는 순간을 가로채 높이를 직접 움직인다: 열기 = 닫힌 높이 → 다 연 높이, 닫기 = 지금 높이 → 요약 줄 높이 후 닫기.
// 화면도 같이 움직인다 (2026-10-29 의뢰인: 폰에서 내 급여 「자세히 보기」를 누르면 부드럽게 열리면서 스크롤도 같이 내려가야 한다):
//   열 때 = 펼친 내용이 아래 탭에 가려지면 그만큼 같이 내려간다(요약 줄은 위 띠 아래에 남는다), 닫을 때 = 요약 줄이 화면 위로 지나가 있으면 같이 올라온다.
//   높이와 같은 곡선 · 같은 시간으로 움직여 따로 노는 느낌이 없게 한다.
// 앱 전체의 서랍에 한 번에 걸린다(layout에 한 번 둔다). 움직임 줄이기 설정이면 브라우저 기본대로 바로 열고 닫는다.
import { useEffect } from 'react';

const MS = 420;
const EASE = 'cubic-bezier(0.2, 0.7, 0.2, 1)';
const GAP = 12; // 위 띠 · 아래 탭과 띄우는 거리

/** 화면에서 가려지지 않는 위 · 아래 경계 — 위에 붙은 띠(sticky header)와 폰 아래 탭을 뺀다 */
function viewBounds(): { top: number; bottom: number } {
  const bar = [...document.querySelectorAll('header')].find((h) => h.offsetHeight > 0 && getComputedStyle(h).position === 'sticky');
  const tabs = document.querySelector<HTMLElement>('[data-tabs]');
  const tabsH = tabs && tabs.offsetHeight > 0 && getComputedStyle(tabs).display !== 'none' ? tabs.offsetHeight : 0;
  return { top: (bar ? bar.getBoundingClientRect().bottom : 0) + GAP, bottom: window.innerHeight - tabsH - GAP };
}

/** 애니메이션이 진행되는 만큼(같은 곡선) 화면을 from → to로 옮긴다 */
function followScroll(a: Animation, from: number, to: number) {
  if (Math.abs(to - from) < 2) return;
  const step = () => {
    const p = a.effect?.getComputedTiming().progress;
    if (p == null || a.playState === 'finished' || a.playState === 'idle') {
      if (a.playState === 'finished') window.scrollTo(0, to);
      return;
    }
    window.scrollTo(0, from + (to - from) * p);
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function DetailsMotion() {
  useEffect(() => {
    const busy = new WeakSet<HTMLDetailsElement>();
    const onClick = (e: MouseEvent) => {
      const summary = (e.target as Element | null)?.closest?.('summary');
      const d = summary?.parentElement;
      if (!summary || !(d instanceof HTMLDetailsElement) || summary !== d.querySelector(':scope > summary')) return;
      if ((e.target as Element).closest('a, button, input, select, textarea, label') && (e.target as Element).closest('summary') === summary && (e.target as Element).closest('a, button, input, select, textarea, label') !== summary) return; // 요약 줄 안의 링크 · 단추는 그대로
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || d.hasAttribute('data-no-motion')) return;
      e.preventDefault();
      if (busy.has(d)) return;
      busy.add(d);
      const closedH = summary.offsetHeight + (d.offsetHeight - d.clientHeight); // 테두리까지
      const startH = d.offsetHeight;
      const y = window.scrollY;
      const view = viewBounds();
      d.style.overflow = 'hidden';
      const done = () => {
        d.style.height = '';
        d.style.overflow = '';
        busy.delete(d);
      };
      if (!d.open) {
        d.style.height = `${startH}px`;
        d.open = true;
        const endH = d.scrollHeight + (d.offsetHeight - d.clientHeight);
        const top = d.getBoundingClientRect().top;
        // 다 열렸을 때 아래 끝이 가려지는 만큼 내려가되, 요약 줄이 위 띠 밑으로 숨지 않을 만큼만
        const down = Math.max(0, Math.min(top + endH - view.bottom, top - view.top));
        const a = d.animate([{ height: `${startH}px` }, { height: `${endH}px` }], { duration: MS, easing: EASE });
        followScroll(a, y, y + down);
        a.onfinish = a.oncancel = done;
      } else {
        // 요약 줄이 위로 지나가 있으면, 닫히는 동안 요약 줄이 보이는 자리까지 같이 올라온다
        const up = Math.min(0, summary.getBoundingClientRect().top - view.top);
        const a = d.animate([{ height: `${startH}px` }, { height: `${closedH}px` }], { duration: MS, easing: EASE });
        followScroll(a, y, y + up);
        a.onfinish = () => {
          d.open = false;
          done();
        };
        a.oncancel = done;
      }
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);
  return null;
}
