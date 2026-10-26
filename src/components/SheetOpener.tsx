'use client';
// PC 화면 오른쪽 위의 "추가하기" 버튼 — 새로 만들기 창(AddSheet)을 연다. 폰에서는 오른쪽 아래 + 버튼(Fab)이 같은 일을 한다.
// (2026-10-11 의뢰인: PC는 시프티처럼 — 제목 오른쪽에 파란 주 버튼 하나, 누르면 가운데 팝업)
import { Briefcase, Building2, CalendarPlus, ClipboardPlus, FilePenLine, FileUp, GraduationCap, ListPlus, MapPin, MapPinned, Megaphone, Plane, Plus, ShieldCheck, UserPlus, type LucideIcon } from 'lucide-react';
import { OPEN_SHEET_EVENT } from './AddSheet';

// className에 보이는 방식(display)을 준다 — 기본 inline-flex. 폰에서 숨길 때는 'hidden lg:inline-flex' (기본값과 hidden을 함께 쓰면 어느 쪽이 이길지 알 수 없다)
// text: 폰 제목 줄용 글자 버튼(「+ 추가」 — 직원 화면의 「+ 추가」와 같은 모양)
// 아이콘 + 글자 알약 (2026-10-23 의뢰인: 직원 홈의 요청 단추처럼 「+」 대신 뜻이 보이는 아이콘으로 통일). 홈 PC 단추와 같은 크기 · 모양
export const SHEET_ICONS: Record<string, LucideIcon> = {
  shift: CalendarPlus, leave: Plane, work: MapPinned, correction: FilePenLine, // 직원
  branch: Building2, job: Briefcase, 'leave-type': ListPlus, member: UserPlus, place: MapPin, schedule: CalendarPlus, // 관리자
  'board-new': Megaphone, payee: UserPlus, enroll: ShieldCheck, notice: FileUp, record: ClipboardPlus, 'training-new': GraduationCap,
};

export function SheetOpener({ id, label, className = 'inline-flex', text = false, outline = false }: { id: string; label: string; className?: string; text?: boolean; outline?: boolean }) {
  const Icon = SHEET_ICONS[id] ?? Plus;
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(OPEN_SHEET_EVENT, { detail: id }))}
      className={text ? `min-h-11 shrink-0 items-center px-2 text-base font-bold whitespace-nowrap text-primary ${className}` : `h-9 shrink-0 items-center gap-1.5 rounded-button px-3.5 text-sm font-semibold whitespace-nowrap ${outline ? 'border border-border bg-bg text-text hover:bg-surface' : 'bg-primary text-on-primary'} ${className}`}
    >
      {text ? '+ ' : <Icon aria-hidden size={16} />}
      {label}
    </button>
  );
}
