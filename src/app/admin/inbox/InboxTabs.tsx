'use client';
// 요청 종류 탭 — 한 번에 한 종류만 보인다 (2026-10-06 의뢰인: 직원이 20명이면 카드 수십 장이 한 화면에 쌓인다).
// 맨 위 숫자 칸 4개가 곧 탭이다: 대기 건수를 보여 주고, 누르면 그 종류의 목록(PC는 표, 폰은 카드)만 보인다.
// 주소 뒤 #overtime·#corrections·#leave·#work 로 바로 열 수 있다 (현황판의 「처리할 일」, 페이지 넘김이 이 주소를 쓴다).
// 고르지 않은 종류도 화면에서만 감춘다 — 확인 중이던 승인 창이 탭을 오가도 사라지지 않게.
import { useEffect, useState, type ReactNode } from 'react';

export type InboxTab = { key: string; label: string; count: number; content: ReactNode };

export function InboxTabs({ tabs, label }: { tabs: InboxTab[]; label: string }) {
  const [active, setActive] = useState(tabs.find((x) => x.count > 0)?.key ?? tabs[0].key);
  useEffect(() => {
    const sync = () => {
      const h = window.location.hash.slice(1);
      if (tabs.some((x) => x.key === h)) setActive(h);
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
    // 탭 목록은 화면이 살아 있는 동안 바뀌지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div role="tablist" aria-label={label} className="grid grid-cols-4 gap-2 lg:gap-4">
        {tabs.map((x) => {
          const on = x.key === active;
          return (
            <button
              key={x.key}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={x.key}
              onClick={() => {
                setActive(x.key);
                window.history.replaceState(null, '', `#${x.key}`);
              }}
              className={`flex min-h-16 flex-col justify-between gap-1 rounded-card border-2 bg-bg p-3 text-left lg:flex-row lg:items-center lg:px-5 lg:py-4 ${on ? 'border-primary' : 'border-bg'}`}
            >
              <span className={`text-xs leading-tight lg:text-sm ${on ? 'font-bold text-primary' : 'text-muted'}`}>{x.label}</span>
              <span className={`num text-2xl leading-none font-extrabold ${x.count > 0 ? 'text-text' : 'text-faint'}`}>{x.count}</span>
            </button>
          );
        })}
      </div>
      {tabs.map((x) => (
        <div key={x.key} id={x.key} role="tabpanel" className={x.key === active ? 'flex scroll-mt-16 flex-col gap-3' : 'hidden'}>
          {x.content}
        </div>
      ))}
    </>
  );
}
