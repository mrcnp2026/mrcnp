'use client';
// 설명 접기 — 제목 옆 ? 아이콘. 누르면 그 아래에 설명이 펼쳐진다 (2026-10-06 의뢰인: 작은 폰 화면에 설명 글이 너무 많다).
// 한 번 읽으면 되는 배경 설명·계산 기준에만 쓴다. 지금 해야 할 행동·경고는 접지 않고 그대로 보여 준다.
// 부모는 flex flex-wrap — 설명 줄이 제목 아래로 내려간다 (basis-full).
import { CircleHelp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

export function Help({ children }: { children: ReactNode }) {
  const t = useTranslations('common');
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      <button type="button" aria-label={t('help')} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} className={`inline-flex size-11 shrink-0 items-center justify-center rounded-button ${open ? 'text-primary' : 'text-faint'}`}>
        <CircleHelp aria-hidden size={20} strokeWidth={1.75} />
      </button>
      {open && (
        <span id={id} className="order-last block basis-full rounded-button bg-primary-tint p-3 text-sm font-normal text-muted">
          {children}
        </span>
      )}
    </>
  );
}

/**
 * 제목 옆 ? — 누르면 작은 말풍선으로 설명이 뜬다 (2026-10-14 의뢰인: 「상세 설명은 ? 아이콘을 눌러야 나오게, 텍스트를 장황하게 바로 노출하지 말 것」).
 * 화면 제목(h1) · 설정 줄 이름 옆에 둔다. 바깥을 누르거나 Esc로 닫힌다. 해야 할 행동 · 경고는 여기 넣지 않고 그대로 보인다.
 */
export function HelpTip({ children, label }: { children: ReactNode; label?: string }) {
  const t = useTranslations('common');
  const [open, setOpen] = useState(false);
  const id = useId();
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', away);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('mousedown', away);
      window.removeEventListener('keydown', key);
    };
  }, [open]);
  return (
    <span ref={box} className="relative inline-flex align-middle">
      <button type="button" aria-label={label ?? t('help')} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} className={`inline-flex size-11 shrink-0 items-center justify-center rounded-button lg:size-8 ${open ? 'text-primary' : 'text-faint hover:text-primary'}`}>
        <CircleHelp aria-hidden size={18} strokeWidth={1.75} />
      </button>
      {open && (
        <span id={id} role="note" className="absolute top-full left-0 z-30 mt-1 block w-72 lg:w-96 rounded-card border border-border bg-bg p-3.5 text-sm leading-relaxed font-normal tracking-normal whitespace-normal text-text shadow-pop">
          {children}
        </span>
      )}
    </span>
  );
}
