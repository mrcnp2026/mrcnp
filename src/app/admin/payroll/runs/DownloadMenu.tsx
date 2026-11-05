'use client';
// 「급여대장 받기」 — 누르면 엑셀 · PDF 중 고른다 (2026-11-05 의뢰인: 받기 단추가 여럿이면 헷갈린다, 대장 하나 · 명세서 하나로).
// 메뉴 모양은 알림 메뉴(Alerts)와 같다. 바깥을 누르거나 Esc면 닫힌다.
import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export function DownloadMenu({ label, items }: { label: string; items: { href: string; title: string; desc: string }[] }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: Event) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', off);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', off); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div ref={box} className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className="inline-flex h-8 items-center gap-1 rounded-button border border-border bg-bg px-3.5 text-sm font-semibold text-text hover:bg-surface">
        {label}
        <ChevronDown aria-hidden size={14} className={`text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div role="menu" className="absolute top-10 left-0 z-30 w-72 rounded-card border border-border bg-bg p-2 shadow-pop">
          {items.map((it) => (
            <a key={it.href} href={it.href} role="menuitem" onClick={() => setOpen(false)} className="flex min-h-11 flex-col justify-center rounded-button px-2 py-1.5 hover:bg-surface">
              <span className="text-sm font-semibold">{it.title}</span>
              <span className="text-xs text-muted">{it.desc}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
