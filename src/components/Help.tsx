'use client';
// 설명 접기 — 제목 옆 ? 아이콘. 누르면 그 아래에 설명이 펼쳐진다 (2026-10-06 의뢰인: 작은 폰 화면에 설명 글이 너무 많다).
// 한 번 읽으면 되는 배경 설명·계산 기준에만 쓴다. 지금 해야 할 행동·경고는 접지 않고 그대로 보여 준다.
// 부모는 flex flex-wrap — 설명 줄이 제목 아래로 내려간다 (basis-full).
import { CircleHelp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState, type ReactNode } from 'react';

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
        <p id={id} className="basis-full rounded-button bg-primary-tint p-3 text-sm font-normal text-muted">
          {children}
        </p>
      )}
    </>
  );
}
