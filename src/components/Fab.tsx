'use client';
// 오른쪽 아래 둥근 + 버튼 (폰) — 그 화면의 "새로 만들기" 하나. 항상 같은 자리 (2026-10-10 의뢰인: 시프티처럼).
// 하나면 바로 그 창을 열고, 둘 이상이면 고르는 목록이 버튼 위에 뜬다. href를 주면 그 화면으로 간다 (항목마다 href를 줄 수도 있다).
// ★ 출퇴근 버튼은 하단에 고정하지 않는다(마스터 12장 5번)는 규칙은 그대로다 — 이 버튼은 그 예외로, 기록을 찍는 버튼이 아니다.
// PC에서는 양식이 화면에 펼쳐져 있어 보이지 않는다.
import { Plus, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { OPEN_SHEET_EVENT } from './AddSheet';
import { SHEET_ICONS } from './SheetOpener';

// 글자가 있는 알약 모양 (2026-10-23 의뢰인: 직원 홈 PC의 「아이콘 + 글자」 요청 단추와 폰의 「+」만 있는 단추가 달랐다 → 같은 모양으로).
// 목록의 각 항목에도 PC 단추와 같은 아이콘을 붙인다 (id가 아래에 있으면).
const SHAPE = 'flex h-14 max-w-[calc(100vw-2rem)] items-center justify-center gap-2 rounded-chip bg-primary px-5 text-base font-bold text-on-primary shadow-pop';
const openSheet = (id: string) => window.dispatchEvent(new CustomEvent(OPEN_SHEET_EVENT, { detail: id }));

export function Fab({ label, items, href }: { label: string; items?: { id: string; label: string; href?: string }[]; href?: string }) {
  const [menu, setMenu] = useState(false);
  const many = (items?.length ?? 0) > 1;
  return (
    <div className="fab-root fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-20 flex flex-col items-end gap-2 lg:hidden">
      {menu && many && (
        <ul className="flex flex-col gap-1 rounded-card border border-border bg-bg p-2 shadow-pop">
          {items!.map((i) => {
            const Icon = SHEET_ICONS[i.id] ?? Plus;
            const row = 'flex min-h-11 w-full items-center gap-3 rounded-button px-3 text-left font-semibold';
            return (
              <li key={i.id}>
                {i.href ? (
                  <Link href={i.href} className={row} onClick={() => setMenu(false)}>
                    <Icon aria-hidden size={18} strokeWidth={1.75} className="shrink-0 text-primary" />
                    {i.label}
                  </Link>
                ) : (
                  <button
                    type="button"
                    className={row}
                    onClick={() => {
                      setMenu(false);
                      openSheet(i.id);
                    }}
                  >
                    <Icon aria-hidden size={18} strokeWidth={1.75} className="shrink-0 text-primary" />
                    {i.label}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {href ? (
        <Link href={href} data-fab title={label} className={SHAPE}>
          <Plus aria-hidden size={20} strokeWidth={2.25} />
          {label}
        </Link>
      ) : (
        <button type="button" data-fab title={label} aria-expanded={many ? menu : undefined} className={SHAPE} onClick={() => (many ? setMenu((v) => !v) : items?.[0] && openSheet(items[0].id))}>
          {menu ? <X aria-hidden size={20} strokeWidth={2.25} /> : <Plus aria-hidden size={20} strokeWidth={2.25} />}
          {label}
        </button>
      )}
    </div>
  );
}

/** 상세 화면 오른쪽 위 「수정」 — 폰에서 고치기 창을 연다. PC에서는 양식이 화면에 펼쳐져 있어 보이지 않는다 */
export function OpenSheetButton({ sheet, children }: { sheet: string; children: string }) {
  return (
    <button type="button" data-open-sheet={sheet} onClick={() => openSheet(sheet)} className="min-h-11 px-2 font-bold text-primary lg:min-h-8 lg:rounded-button lg:border lg:border-border lg:bg-bg lg:px-4 lg:text-sm lg:text-text">
      {children}
    </button>
  );
}

/** 아무 모양의 단추로 팝업(AddSheet)을 연다 — 링크처럼 생긴 「+ 근무일정 요청」 등 (2026-10-22) */
export function SheetButton({ sheet, className, children }: { sheet: string; className: string; children: React.ReactNode }) {
  return (
    <button type="button" data-open-sheet={sheet} onClick={() => openSheet(sheet)} className={className}>
      {children}
    </button>
  );
}
