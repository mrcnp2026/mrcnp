'use client';
// 폰 상단 로고 줄을 화면에 따라 숨긴다 (2026-10-11 의뢰인: 시프티의 목록 화면처럼 — 로고 줄 없이 「☰ · 검색 · 거르기」가 맨 위).
// 숨겨도 안의 메뉴(MenuDrawer)는 살아 있어야 해서 떼어 내지 않고 가리기만 한다 — 목록 위 줄의 ☰(MenuButton)가 신호를 보내 연다.
// 보일 때는 display: contents — 상단 바가 본문 옆에 직접 놓여야 화면에 붙는다(sticky).
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

export const BARE_PATHS = ['/admin/records/list', '/admin/schedule', '/admin/leave'];

export function FrameHeader({ children }: { children: ReactNode }) {
  const path = usePathname();
  return <div className={BARE_PATHS.includes(path) ? 'hidden' : 'contents'}>{children}</div>;
}
