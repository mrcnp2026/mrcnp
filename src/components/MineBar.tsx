// 「내 기록 · 내 일정 · 내 휴가」 화면의 위 줄 (2026-10-11 의뢰인: 시프티처럼 로고 줄 없이) — ☰ · 화면 이름 · 오른쪽 [내 기록] 단추.
// 단추는 켜진 모양이고(지금 내 것만 보는 중), 누르면 전체 목록으로 간다 — 관리자에게만 넘긴다. 폰에서만 보인다(PC는 왼쪽 메뉴).
import Link from 'next/link';
import type { ReactNode } from 'react';
import { MenuButton } from './MenuButton';

// flush: 위 여백 없는 틀(PageShell flush) 안에서는 위로 당기지 않는다 — 당기면 검색 줄이 16px 위에서 시작해 화면에 붙으면서 바로 아래 단추를 덮었다
// (2026-10-28 의뢰인 아이폰 스샷: 근무일정의 「일정 현황 / 달력」 단추 윗부분이 검색 줄에 가려진다)
export function MineBar({ menu, title, side, children, flush = false }: { menu: string; title: string; side?: { href: string; label: string }; children?: ReactNode; flush?: boolean }) {
  return (
    <div className={`sticky top-0 z-20 -mx-4 ${flush ? '' : '-mt-4'} border-b border-border bg-bg pt-[env(safe-area-inset-top)] lg:hidden`}>
      <div className="flex min-h-14 items-center gap-2 px-4">
        <span data-dup-menu className="contents"><MenuButton label={menu} /></span>
        <span data-dup-bar className="min-w-0 flex-1 truncate text-lg font-bold">{title}</span>
        {side && (
          <Link href={side.href} aria-pressed="true" className="inline-flex min-h-11 shrink-0 items-center rounded-button border border-primary bg-primary px-4 text-sm font-bold text-on-primary">
            {side.label}
          </Link>
        )}
      </div>
      {children}
    </div>
  );
}
