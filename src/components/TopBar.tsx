// 상단 바 — 로고 + 오른쪽 도구. 흰 바탕 + 1px 선 (그라데이션·색 그림자 없음, R-10-8).
// 아이폰 노치 아래로 내려오게 safe-area 여백. 화면에 붙어 있지만(sticky) 출퇴근 버튼을 가리지 않는다 (12장 5번은 하단 고정 금지).
import type { ReactNode } from 'react';
import { Logo } from './Logo';

export function TopBar({ right, variant = 'full' }: { right?: ReactNode; variant?: 'full' | 'mark' }) {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-bg pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex min-h-14 w-full max-w-md items-center justify-between gap-2 px-4 md:max-w-none">
        <Logo variant={variant} height={28} priority />
        {right && <div className="flex items-center">{right}</div>}
      </div>
    </header>
  );
}
