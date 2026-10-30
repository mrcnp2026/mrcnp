'use client';
// 옆 메뉴 판의 빈 자리(#side-panel-slot)에 화면이 내용을 그려 넣는다 (2026-10-30 의뢰인: 오늘 현황의 요약을 옆 판으로 — 본문은 그만큼 위로).
// 판은 PC에서만 보이므로, 폰에서는 화면이 본문에 같은 내용을 따로 보인다.
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function PanelPortal({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => setSlot(document.getElementById('side-panel-slot')), []);
  return slot ? createPortal(children, slot) : null;
}
