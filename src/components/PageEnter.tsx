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
    // 메뉴 · 링크로 새 화면에 오면 맨 위에서 연다 (2026-10-27 의뢰인: 폰에서 근무일정 · 달력 카드 윗부분이 검색 칸에 가려진다 —
    // 아래로 내린 채 메뉴를 누르면 새 화면이 그 높이에서 열려, 고정된 검색 칸 밑으로 내용이 들어가 있었다). 뒤로 가기 · #책갈피는 그대로
    if (!back && !location.hash) requestAnimationFrame(() => window.scrollTo(0, 0));
    if (!root || back || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const seen = new WeakSet<Element>();
    const cleanups: (() => void)[] = [];
    const play = () => {
      const m = root.querySelector('main');
      if (!m || seen.has(m)) return false;
      seen.add(m);
      // 공지 · 사내게시판은 폰에서 아래에서 천천히 밀려 올라온다 (2026-10-17 의뢰인)
      // transform 대신 top(position: relative)으로 움직인다 — transform은 본문 안의 고정 요소(+ 버튼 · 판)까지 같이 끌고 가고 sticky 제목 줄을 깨뜨린다
      const board = /^\/(punch|admin)\/(notices|messages)(\/|$)/.test(path) && window.matchMedia('(max-width: 1023px)').matches;
      if (board) {
        const was = m.style.position;
        m.style.position = 'relative';
        const a = m.animate([{ opacity: 0.4, top: '45vh' }, { opacity: 1, top: '0px' }], { duration: 460, easing: 'cubic-bezier(.2,.8,.2,1)' });
        a.onfinish = a.oncancel = () => (m.style.position = was);
        return true;
      }
      // 위로 떠오르지 않고 살짝 밝아지기만 한다 — 급여처럼 화면을 자주 옮길 때 덜컹여 보였다 (2026-10-26).
      // 본문에 스타일을 직접 넣지 않는다(2026-10-28): 예전에는 position을 잠깐 붙였는데, React가 본문을 늦게 이어 붙이는 화면에서 「서버와 다르다」 경고가 났다
      m.animate([{ opacity: 0.6 }, { opacity: 1 }], { duration: 140, easing: 'ease-out' });
      cleanups.push(stagger(m));
      return true;
    };
    if (play()) return () => cleanups.forEach((f) => f());
    // 아직 「불러오는 중」이면 본문이 들어오는 순간을 기다린다 (최대 8초)
    const mo = new MutationObserver(() => play() && mo.disconnect());
    mo.observe(root, { childList: true, subtree: true });
    const stop = setTimeout(() => mo.disconnect(), 8000);
    return () => {
      mo.disconnect();
      clearTimeout(stop);
      cleanups.forEach((f) => f());
    };
  }, [path]);
  return null;
}

// 카드가 차례로 올라온다 (2026-10-27 의뢰인: 키트 · Code and Chill 사이트의 「카드가 등장하는 효과」가 마음에 든다).
// 첫 화면에 보이는 카드는 위에서부터 0.07초씩 늦게, 아래로 내려야 보이는 카드는 보이는 순간에 올라온다 — 내려갔을 때 이미 끝나 있지 않게.
// 제목(h1)은 왼쪽부터 커튼 걷히듯 드러난다. 카드 안의 카드는 따로 움직이지 않는다(바깥 카드와 함께).
// 끝나면 transform이 남지 않는다(fill 없음) — 카드 안의 sticky 줄 · 고정 판이 깨지지 않게.
const EASE = 'cubic-bezier(.2,.7,.2,1)';
function stagger(m: Element) {
  const h1 = m.querySelector('h1');
  void h1; // 제목이 왼쪽부터 드러나는 효과는 뺐다 — 제목이 잠깐 안 보여 화면이 늦게 뜨는 것처럼 보였다 (2026-10-27 의뢰인)
  const cards = [...m.querySelectorAll<HTMLElement>('.rounded-card')].filter(
    (el) => !el.parentElement?.closest('.rounded-card') && el.offsetHeight > 24 && getComputedStyle(el).position !== 'fixed',
  );
  // 내용은 오자마자 보이고 살짝 떠오르기만 한다 (2026-10-27 의뢰인: 「화면은 빠르게 넘어가서 보이고, 그다음 움직임」).
  // 반짝임은 「불러오는 중」 자리(PageSkeleton)가 맡는다 — 예전엔 도착한 내용 위에 반짝임을 한 번 더 씌워 1초쯤 가렸다
  const rise = (el: HTMLElement, delay: number) => {
    el.animate([{ opacity: 0.5, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 260, delay, easing: EASE, fill: 'backwards' }); // 짧고 옅게 — 「불러오는 중」 뒤에 투명한 채로 기다리는 시간이 잔상처럼 보였다 (2026-10-27)
  };
  const timers: ReturnType<typeof setTimeout>[] = [];
  const vh = window.innerHeight;
  let i = 0;
  const later: HTMLElement[] = [];
  for (const el of cards) {
    if (el.getBoundingClientRect().top < vh) rise(el, Math.min(i++, 6) * 25);
    else later.push(el);
  }
  const clear = () => timers.forEach(clearTimeout);
  if (!later.length || !('IntersectionObserver' in window)) return clear;
  // 아래쪽 카드는 숨겨 두지 않는다(스타일을 직접 넣지 않는다, 2026-10-28) — 화면 아래 끝에 막 들어올 때 올라오는 움직임만 준다
  const io = new IntersectionObserver(
    (es) => {
      let k = 0;
      for (const e of es) {
        if (!e.isIntersecting) continue;
        io.unobserve(e.target);
        rise(e.target as HTMLElement, k++ * 70);
      }
    },
    { threshold: 0, rootMargin: '0px 0px -4% 0px' },
  );
  for (const el of later) io.observe(el);
  return () => {
    clear();
    io.disconnect();
  };
}
