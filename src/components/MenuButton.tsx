'use client';
// 목록 위 줄 안의 메뉴 버튼(☰) — 상단 로고 줄을 숨긴 화면에서 왼쪽 메뉴(MenuDrawer)를 연다. 폰에서만 보인다.
import { Menu } from 'lucide-react';

export const OPEN_MENU_EVENT = 'app:open-menu';

export function MenuButton({ label }: { label: string }) {
  return (
    <button type="button" aria-label={label} onClick={() => window.dispatchEvent(new Event(OPEN_MENU_EVENT))} className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-button text-text lg:hidden">
      <Menu aria-hidden size={24} strokeWidth={1.75} />
    </button>
  );
}
