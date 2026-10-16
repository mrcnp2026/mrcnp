'use client';
// 화면 등장 (2026-10-17 의뢰인: 「화면 전환 · 페이지 등장이 매끄럽지 않다」) — 메뉴 · 링크로 새 화면에 갈 때만 본문(main)이 살짝 떠오르며 나타난다.
// 뒤로 가기(폰 스와이프 · 뒤로 버튼)는 폰이 이미 화면을 밀어 보여 주므로 움직이지 않는다 — 두 번 움직이면 오히려 덜컹인다.
// 「불러오는 중」 자리 뒤에 본문이 늦게 들어와도 그때 한 번 움직인다. 움직임 줄이기 설정이면 하지 않는다.
// 예전 규칙 R-10-8(움직임 없음)은 이 지시로 바뀌었다.
import { usePathname } from 'next/navigation';
import { useLayoutEffect } from 'react';

let popped = false;
if (typeof window !== 'undefined') window.addEventListener('popstate', () => (popped = true));

export function PageEnter() {
  const path = usePathname();
  useLayoutEffect(() => {
    const back = popped;
    popped = false;
    const root = document.querySelector('[data-page-root]');
    if (!root || back || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const seen = new WeakSet<Element>();
    const play = () => {
      const m = root.querySelector('main');
      if (!m || seen.has(m)) return false;
      seen.add(m);
      // 공지 · 사내게시판은 폰에서 아래에서 천천히 밀려 올라온다 (2026-10-17 의뢰인)
      // transform 대신 top(position: relative)으로 움직인다 — transform은 본문 안의 고정 요소(+ 버튼 · 판)까지 같이 끌고 가고 sticky 제목 줄을 깨뜨린다
      const board = /^\/(punch|admin)\/(notices|messages)(\/|$)/.test(path) && window.matchMedia('(max-width: 1023px)').matches;
      const was = m.style.position;
      m.style.position = 'relative';
      const a = board
        ? m.animate([{ opacity: 0.4, top: '45vh' }, { opacity: 1, top: '0px' }], { duration: 460, easing: 'cubic-bezier(.2,.8,.2,1)' })
        : m.animate([{ opacity: 0, top: '10px' }, { opacity: 1, top: '0px' }], { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' });
      a.onfinish = a.oncancel = () => (m.style.position = was);
      return true;
    };
    if (play()) return;
    // 아직 「불러오는 중」이면 본문이 들어오는 순간을 기다린다 (최대 8초)
    const mo = new MutationObserver(() => play() && mo.disconnect());
    mo.observe(root, { childList: true, subtree: true });
    const stop = setTimeout(() => mo.disconnect(), 8000);
    return () => {
      mo.disconnect();
      clearTimeout(stop);
    };
  }, [path]);
  return null;
}
