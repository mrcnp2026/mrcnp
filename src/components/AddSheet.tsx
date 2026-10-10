'use client';
// 새로 만들기 창 — 폰에서는 화면 아래에서 올라오는 창, PC(1024px~)에서는 원래 자리에 그대로 펼쳐 둔다.
// (2026-10-10 의뢰인: 시프티처럼 화면은 목록이 먼저, 쓰는 양식은 + 버튼 뒤로)
// 여는 길: 오른쪽 아래 + 버튼(components/Fab) · 주소의 ?new=… · 다른 화면에서 값을 채워 넘어온 경우(defaultOpen).
// 양식은 한 번만 그린다 — 닫혀 있어도 쓰던 내용이 남는다. 움직임 없이 나타났다 사라진다 (R-10-8).
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState, type ReactNode } from 'react';

export const OPEN_SHEET_EVENT = 'open-add-sheet';
export const CLOSE_SHEET_EVENT = 'close-add-sheet'; // 저장이 끝난 양식이 자기 창을 닫는다

export function AddSheet({ id, title, children, defaultOpen = false, className = '' }: { id: string; title: string; children: ReactNode; defaultOpen?: boolean; className?: string }) {
  const t = useTranslations('side');
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    const onOpen = (e: Event) => (e as CustomEvent<string>).detail === id && setOpen(true);
    const onClose = (e: Event) => (e as CustomEvent<string>).detail === id && setOpen(false);
    window.addEventListener(OPEN_SHEET_EVENT, onOpen);
    window.addEventListener(CLOSE_SHEET_EVENT, onClose);
    return () => {
      window.removeEventListener(OPEN_SHEET_EVENT, onOpen);
      window.removeEventListener(CLOSE_SHEET_EVENT, onClose);
    };
  }, [id]);
  useEffect(() => {
    if (!open) return;
    const phone = window.matchMedia('(max-width: 1023px)');
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && phone.matches && setOpen(false);
    window.addEventListener('keydown', onKey);
    if (phone.matches) document.body.style.overflow = 'hidden'; // 창 뒤의 화면이 같이 밀리지 않게 (폰에서만)
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <div data-add-sheet={id} className={`${open ? 'fixed inset-0 z-40 flex flex-col justify-end' : 'hidden'} lg:static lg:z-auto lg:block ${className}`}>
      <button type="button" tabIndex={-1} aria-label={t('close')} onClick={() => setOpen(false)} className="flex-1 bg-text opacity-40 lg:hidden" />
      <div role={open ? 'dialog' : undefined} aria-label={title} className="flex max-h-[calc(100dvh-3rem)] flex-col rounded-t-card bg-surface pb-[env(safe-area-inset-bottom)] lg:block lg:max-h-none lg:rounded-none lg:bg-transparent lg:pb-0">
        <div className="flex items-center justify-between gap-2 py-1 pr-2 pl-5 lg:hidden">
          <p className="font-bold">{title}</p>
          <button type="button" aria-label={t('close')} onClick={() => setOpen(false)} className="flex size-11 shrink-0 items-center justify-center rounded-button text-primary">
            <X aria-hidden size={24} strokeWidth={1.75} />
          </button>
        </div>
        <div className="overflow-y-auto px-3 pb-3 lg:overflow-visible lg:p-0">{children}</div>
      </div>
    </div>
  );
}
