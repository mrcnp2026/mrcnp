'use client';
// 화면 맨 위 얇은 진행 줄 (2026-10-26 의뢰인: 급여 탭 · 책갈피를 눌러도 반응이 없어 보인다).
// 같은 화면 안에서 주소의 조건(?st=…)만 바뀌는 이동은 「불러오는 중」 화면이 뜨지 않아 눌렀는지 알 수 없었다 — 링크를 누르는 즉시 줄이 나타나고, 새 화면이 오면 사라진다.
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

function Bar() {
  const path = usePathname();
  const query = useSearchParams().toString();
  const [on, setOn] = useState(false);
  useEffect(() => setOn(false), [path, query]);
  useEffect(() => {
    const down = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      const u = new URL(a.href, location.href);
      if (u.origin !== location.origin || (u.pathname === location.pathname && u.search === location.search)) return;
      setOn(true);
    };
    document.addEventListener('click', down);
    return () => document.removeEventListener('click', down);
  }, []);
  // 8초가 지나도 안 오면 줄만 거둔다
  useEffect(() => {
    if (!on) return;
    const id = setTimeout(() => setOn(false), 8000);
    return () => clearTimeout(id);
  }, [on]);
  return on ? <div aria-hidden data-noprint className="nav-progress pointer-events-none fixed inset-x-0 top-0 z-60 h-0.5 bg-primary" /> : null;
}

export function NavProgress() {
  return (
    <Suspense fallback={null}>
      <Bar />
    </Suspense>
  );
}
