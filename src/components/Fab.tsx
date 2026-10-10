'use client';
// 오른쪽 아래 둥근 + 버튼 (폰) — 그 화면의 "새로 만들기" 하나. 항상 같은 자리 (2026-10-10 의뢰인: 시프티처럼).
// 하나면 바로 그 창을 열고, 둘 이상이면 고르는 목록이 버튼 위에 뜬다. href를 주면 그 화면으로 간다.
// ★ 출퇴근 버튼은 하단에 고정하지 않는다(마스터 12장 5번)는 규칙은 그대로다 — 이 버튼은 그 예외로, 기록을 찍는 버튼이 아니다.
// PC에서는 양식이 화면에 펼쳐져 있어 보이지 않는다.
import { Plus, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { OPEN_SHEET_EVENT } from './AddSheet';

const SHAPE = 'flex size-14 items-center justify-center rounded-chip bg-primary text-on-primary';
const openSheet = (id: string) => window.dispatchEvent(new CustomEvent(OPEN_SHEET_EVENT, { detail: id }));

export function Fab({ label, items, href }: { label: string; items?: { id: string; label: string }[]; href?: string }) {
  const [menu, setMenu] = useState(false);
  const many = (items?.length ?? 0) > 1;
  return (
    <div className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-20 flex flex-col items-end gap-2 lg:hidden">
      {menu && many && (
        <ul className="flex flex-col gap-1 rounded-card border border-border bg-bg p-2">
          {items!.map((i) => (
            <li key={i.id}>
              <button
                type="button"
                className="flex min-h-11 w-full items-center rounded-button px-3 text-left font-semibold"
                onClick={() => {
                  setMenu(false);
                  openSheet(i.id);
                }}
              >
                {i.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {href ? (
        <Link href={href} data-fab aria-label={label} title={label} className={SHAPE}>
          <Plus aria-hidden size={28} strokeWidth={2} />
        </Link>
      ) : (
        <button type="button" data-fab aria-label={label} title={label} aria-expanded={many ? menu : undefined} className={SHAPE} onClick={() => (many ? setMenu((v) => !v) : items?.[0] && openSheet(items[0].id))}>
          {menu ? <X aria-hidden size={28} strokeWidth={2} /> : <Plus aria-hidden size={28} strokeWidth={2} />}
        </button>
      )}
    </div>
  );
}
