'use client';
// 언어 전환 — 검수된 언어만, 각 언어의 자기 이름으로 (7-11 요점 6, B-21)
import { Languages } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { callApi } from './client-api';

export function LanguageSwitcher({ options }: { options: { code: string; name: string }[] }) {
  const t = useTranslations('common');
  const current = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  if (options.length < 2) return null;
  return (
    <label className="flex items-center gap-2 text-sm text-muted">
      <Languages aria-hidden size={18} strokeWidth={1.75} />
      <span className="sr-only">{t('language')}</span>
      <select
        className="min-h-11 rounded-button border border-border bg-bg px-2 text-base text-text"
        value={current}
        disabled={pending}
        aria-label={t('language')}
        onChange={(e) => {
          const locale = e.target.value;
          start(async () => {
            const r = await callApi('/api/locale', { locale });
            if (r.ok) router.refresh();
          });
        }}
      >
        {options.map((o) => (
          <option key={o.code} value={o.code} lang={o.code}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}
