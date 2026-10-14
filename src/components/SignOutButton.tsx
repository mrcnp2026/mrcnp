'use client';
import { LogOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { callApi } from './client-api';

export function SignOutButton({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('common');
  return (
    <button
      type="button"
      className={compact ? 'inline-flex min-h-10 items-center gap-1.5 rounded-button px-2 text-sm whitespace-nowrap text-muted' : 'inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-button border border-border bg-bg px-4 text-sm whitespace-nowrap text-muted lg:min-h-8'}
      onClick={async () => {
        await callApi('/api/auth/signout');
        window.location.assign('/login'); // 언어·세션이 바뀌므로 전체 새로 고침
      }}
    >
      <LogOut aria-hidden size={18} strokeWidth={1.75} />
      {t('signOut')}
    </button>
  );
}
