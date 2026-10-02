'use client';
// 언어 전환 — 검수된 언어만, 각 언어의 자기 이름으로 (7-11 요점 6, B-21).
// 2개 이하면 토글 버튼(English | 한국어), 3개 이상이면 드롭다운 — 4개를 버튼으로 늘어놓으면 360px 머리줄이 넘친다.
// (2026-10-02 의뢰인: "드롭다운은 눈에 안 띈다, 토글로")
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

  const change = (locale: string) => {
    if (locale === current) return;
    start(async () => {
      const r = await callApi('/api/locale', { locale });
      if (r.ok) router.refresh();
    });
  };

  if (options.length <= 2) {
    return (
      <div role="group" aria-label={t('language')} className="flex rounded-chip border border-border bg-surface p-0.5">
        {options.map((o) => {
          const on = o.code === current;
          return (
            <button
              key={o.code}
              type="button"
              lang={o.code}
              aria-pressed={on}
              disabled={pending}
              onClick={() => change(o.code)}
              className={`min-h-11 rounded-chip px-2.5 text-sm font-semibold ${on ? 'bg-primary text-on-primary' : 'text-muted'}`}
            >
              {o.name}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <label className="flex items-center gap-2 text-sm text-muted">
      <Languages aria-hidden size={18} strokeWidth={1.75} />
      <span className="sr-only">{t('language')}</span>
      <select
        className="min-h-11 rounded-button border border-border bg-bg px-2 text-base text-text"
        value={current}
        disabled={pending}
        aria-label={t('language')}
        onChange={(e) => change(e.target.value)}
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
