'use client';
// 단추 하나 + 그 단추로 여는 창 (2026-10-29 일용직 검수: 카드 안에서 양식이 길게 펼쳐져 PC는 좁고 폰은 화면이 끝없이 길어졌다).
// 모양은 AddSheet의 팝업과 같다 — 폰은 아래에서 올라오는 창, PC는 가운데 창. 안의 양식은 열 때만 그린다(목록에 사람이 많아도 가볍게).
// 저장이 끝난 양식은 CLOSE_SHEET_EVENT(창 id)로 닫는다 — AddSheet와 같은 신호.
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState, type ReactNode } from 'react';
import { CLOSE_SHEET_EVENT } from './AddSheet';

export function Popup({ id, label, title, children, wide = false, triggerClass, triggerLabel }: { id: string; label: ReactNode; title: string; children: ReactNode; wide?: boolean; triggerClass: string; triggerLabel?: string }) {
  const t = useTranslations('side');
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onClose = (e: Event) => (e as CustomEvent<string>).detail === id && setOpen(false);
    window.addEventListener(CLOSE_SHEET_EVENT, onClose);
    return () => window.removeEventListener(CLOSE_SHEET_EVENT, onClose);
  }, [id]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden'; // 창 뒤의 화면이 같이 밀리지 않게
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);
  return (
    <>
      <button type="button" className={triggerClass} aria-label={triggerLabel} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        {label}
      </button>
      {open && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end lg:items-center lg:justify-center">
          <button type="button" tabIndex={-1} aria-label={t('close')} onClick={() => setOpen(false)} className="fade-from flex-1 bg-text opacity-40 lg:absolute lg:inset-0 lg:opacity-70" />
          <div role="dialog" aria-modal="true" aria-label={title} className={`sheet-up flex max-h-[calc(100dvh-3rem)] flex-col rounded-t-card bg-surface pb-[env(safe-area-inset-bottom)] lg:relative ${wide ? 'lg:w-240' : 'lg:w-180'} lg:max-w-[calc(100vw-2rem)] lg:rounded-card lg:border lg:border-border lg:bg-bg lg:pb-0 lg:shadow-card`}>
            <div className="flex items-center justify-between gap-2 py-1 pr-2 pl-5 lg:border-b lg:border-border lg:py-2 lg:text-lg">
              <p className="font-bold">{title}</p>
              <button type="button" aria-label={t('close')} onClick={() => setOpen(false)} className="flex size-11 shrink-0 items-center justify-center rounded-button text-primary">
                <X aria-hidden size={24} strokeWidth={1.75} />
              </button>
            </div>
            <div className="overflow-y-auto px-3 pb-3 lg:p-4">{children}</div>
          </div>
        </div>
      )}
    </>
  );
}
