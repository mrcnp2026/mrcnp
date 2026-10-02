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
      {/* 좁은 폰에서는 아이콘만 (머리줄에 언어 토글이 같이 들어간다) — 글자는 화면 읽기용으로 남긴다 */}
      <span className="sr-only sm:not-sr-only">{t('signOut')}</span>
    </button>
  );
}
