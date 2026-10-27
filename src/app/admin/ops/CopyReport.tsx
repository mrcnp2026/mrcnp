'use client';
// 오류 한 건을 「개발자에게 보낼 내용」으로 복사 (2026-10-27 의뢰인) — 내용은 서버가 만들어 넘겨 준다. 시스템관리자 운영 화면 전용.
import { Check, Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export function CopyReport({ text }: { text: string }) {
  const t = useTranslations('admin.ops');
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 2500);
        } catch {
          window.prompt(t('copyManual'), text);
        }
      }}
      className="inline-flex min-h-9 items-center gap-1.5 self-start rounded-button border border-border px-3 text-xs font-semibold text-text hover:bg-surface"
    >
      {done ? <Check aria-hidden size={14} /> : <Copy aria-hidden size={14} />}
      {done ? t('copied') : t('copy')}
    </button>
  );
}
