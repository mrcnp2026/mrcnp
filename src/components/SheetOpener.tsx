'use client';
// PC 화면 오른쪽 위의 "추가하기" 버튼 — 새로 만들기 창(AddSheet)을 연다. 폰에서는 오른쪽 아래 + 버튼(Fab)이 같은 일을 한다.
// (2026-10-11 의뢰인: PC는 시프티처럼 — 제목 오른쪽에 파란 주 버튼 하나, 누르면 가운데 팝업)
import { Plus } from 'lucide-react';
import { OPEN_SHEET_EVENT } from './AddSheet';

// className에 보이는 방식(display)을 준다 — 기본 inline-flex. 폰에서 숨길 때는 'hidden lg:inline-flex' (기본값과 hidden을 함께 쓰면 어느 쪽이 이길지 알 수 없다)
export function SheetOpener({ id, label, className = 'inline-flex' }: { id: string; label: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(OPEN_SHEET_EVENT, { detail: id }))}
      className={`min-h-8 shrink-0 items-center gap-1.5 rounded-button bg-primary px-4 text-sm font-bold whitespace-nowrap text-on-primary ${className}`}
    >
      <Plus aria-hidden size={16} strokeWidth={2.5} />
      {label}
    </button>
  );
}
