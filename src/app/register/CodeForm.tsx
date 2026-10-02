'use client';
// 등록 코드 입력 — 주소창에 앱 주소만 치고 들어온 직원이 관리자에게 받은 8자리 코드로 등록한다.
// 소문자·공백·하이픈은 서버가 정리한다 (invite-code.ts).
import { KeyRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui';

export function CodeForm() {
  const t = useTranslations('register');
  const router = useRouter();
  const [code, setCode] = useState('');
  const compact = code.replace(/[\s-]/g, '');
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(`/register?token=${encodeURIComponent(compact.toUpperCase())}`);
      }}
    >
      <label className="flex flex-col gap-1 text-sm text-muted">
        {t('codeLabel')}
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="one-time-code"
          maxLength={9}
          placeholder={t('codePlaceholder')}
          className="num min-h-14 rounded-button border border-border bg-bg px-4 text-center text-2xl font-semibold tracking-widest text-text"
        />
      </label>
      <Button type="submit" disabled={compact.length !== 8} className="min-h-14 w-full">
        <KeyRound aria-hidden size={22} strokeWidth={1.75} />
        {t('codeSubmit')}
      </Button>
      <p className="text-sm text-muted">{t('codeHelp')}</p>
    </form>
  );
}
