'use client';
import { LogOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { callApi } from './client-api';

export function SignOutButton() {
  const t = useTranslations('common');
  return (
    <button
      type="button"
      className="inline-flex min-h-11 items-center gap-1 px-2 text-sm text-muted"
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
