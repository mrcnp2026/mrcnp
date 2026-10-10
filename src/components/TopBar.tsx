// 상단 바 — 왼쪽 메뉴 버튼 + 로고 + 오른쪽 도구. 흰 바탕 + 1px 선 (그라데이션·색 그림자 없음, R-10-8).
// 항상 한 줄. 자리가 모자란 좁은 폰(320px)에서는 로고가 비율대로 줄어든다 (가로 스크롤 금지).
// 아이폰 노치 아래로 내려오게 safe-area 여백. 화면에 붙어 있지만(sticky) 출퇴근 버튼을 가리지 않는다 (12장 5번은 하단 고정 금지).
// 붙어 있으려면 감싸는 상자 없이 이 header가 직접 본문 옆에 놓여야 한다 — 숨길 때는 className으로 (lg:hidden).
import type { ReactNode } from 'react';
import { Logo } from './Logo';

export function TopBar({ left, right, variant = 'full', className = '' }: { left?: ReactNode; right?: ReactNode; variant?: 'full' | 'mark'; className?: string }) {
  return (
    <header className={`sticky top-0 z-10 border-b border-border bg-bg pt-[env(safe-area-inset-top)] ${className}`}>
      <div className="mx-auto flex min-h-14 w-full max-w-md items-center gap-1 px-4 md:max-w-none">
        {left}
        <Logo variant={variant} height={28} priority className="h-auto min-w-0 shrink" />
        {right && <div className="ml-auto flex shrink-0 items-center">{right}</div>}
      </div>
    </header>
  );
}
