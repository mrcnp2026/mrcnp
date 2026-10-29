'use client';
// 긴 설명 줄여 보이기 — 접고 펴는 카드(Fold.tsx)와는 다른 것 (2026-10-28 의뢰인: 「통합설정 긴 텍스트들은 뭐고」 — 항목 밑 설명이 늘 다 펼쳐져 입력 칸보다 길었다).
// 처음엔 lines 줄만 보이고, 넘치는 글이 있을 때만 「자세히」가 붙는다. 누르면 다 펼치고 「접기」로 바뀐다.
// 설명은 항목 바로 밑에 그대로 둔다(결정 사항 개발-52) — 처음 보이는 길이만 줄인다. 글이 짧으면 단추 없이 그대로.
import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

const CLAMP = { 1: 'line-clamp-1', 2: 'line-clamp-2', 3: 'line-clamp-3' } as const;

export function Clamp({ children, lines = 2, after, className = '' }: { children: ReactNode; lines?: 1 | 2 | 3; after?: ReactNode; className?: string }) {
  const t = useTranslations('common');
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || open) return;
    const check = () => setLong(el.scrollHeight > el.clientHeight + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);
  return (
    <div className={className}>
      <div ref={box} className={open ? '' : CLAMP[lines]}>
        {children}
      </div>
      {(open || !long) && after}
      {(long || open) && (
        <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="mt-0.5 inline-flex min-h-7 items-center gap-0.5 text-xs font-semibold text-muted hover:text-text">
          {open ? t('foldLess') : t('foldMore')}
          <ChevronDown aria-hidden size={14} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </button>
      )}
    </div>
  );
}
