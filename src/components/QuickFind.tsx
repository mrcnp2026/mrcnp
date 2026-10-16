'use client';
// 폰 목록 바로 찾기 (2026-10-16 디자인) — 입력하면 그 자리에서 줄을 거른다(서버에 다시 묻지 않는다).
// 거를 줄에는 data-find="이름 사번 휴대폰 …", 묶음(카드)에는 data-find-group — 남은 줄이 없는 묶음은 통째로 숨긴다.
import { Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export function QuickFind({ target, placeholder, clearLabel, emptyText }: { target: string; placeholder: string; clearLabel: string; emptyText: string }) {
  const [q, setQ] = useState('');
  const [none, setNone] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const root = document.getElementById(target);
    if (!root) return;
    const words = q.trim().toLowerCase().replace(/-/g, '').split(/\s+/).filter(Boolean);
    let shown = 0;
    root.querySelectorAll<HTMLElement>('[data-find]').forEach((el) => {
      const hay = (el.dataset.find ?? '').toLowerCase().replace(/-/g, '');
      const ok = words.every((w) => hay.includes(w));
      el.hidden = !ok;
      if (ok) shown++;
    });
    root.querySelectorAll<HTMLElement>('[data-find-group]').forEach((g) => {
      g.hidden = words.length > 0 && !g.querySelector('[data-find]:not([hidden])');
    });
    setNone(words.length > 0 && shown === 0);
  }, [q, target]);
  return (
    <div className="flex flex-col gap-2">
      <label className="flex min-h-12 items-center gap-2 rounded-button border border-border bg-bg px-3 focus-within:border-primary">
        <Search aria-hidden size={18} className="shrink-0 text-muted" />
        <input ref={ref} value={q} onChange={(e) => setQ(e.target.value)} type="search" enterKeyHint="search" placeholder={placeholder} aria-label={placeholder} className="min-w-0 flex-1 bg-transparent text-base outline-none" />
        {q && (
          <button type="button" onClick={() => { setQ(''); ref.current?.focus(); }} aria-label={clearLabel} className="flex size-9 items-center justify-center rounded-button text-muted hover:bg-surface">
            <X aria-hidden size={18} />
          </button>
        )}
      </label>
      {none && <p className="px-1 text-sm text-muted">{emptyText}</p>}
    </div>
  );
}
