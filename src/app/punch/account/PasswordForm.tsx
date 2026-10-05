'use client';
// 비밀번호 바꾸기(또는 처음 만들기). 이미 비밀번호가 있으면 지금 비밀번호를 함께 묻는다 — 서버가 다시 확인한다.
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { PasswordField } from '@/components/PasswordField';
import { Button } from '@/components/ui';

export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const t = useTranslations();
  const router = useRouter();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  const labels = { showLabel: t('login.showPassword'), hideLabel: t('login.hidePassword') };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setErr(null);
        setSaved(false);
        if (password !== again) return setErr({ code: 'password_mismatch' });
        setBusy(true);
        const r = await callApi('/api/auth/password', { current, password });
        setBusy(false);
        if (!r.ok) return setErr(r);
        setCurrent('');
        setPassword('');
        setAgain('');
        setSaved(true);
        router.refresh(); // 처음 만든 경우 제목·안내가 "바꾸기"로 바뀐다
      }}
    >
      {hasPassword && <PasswordField label={t('account.currentLabel')} value={current} onChange={setCurrent} autoComplete="current-password" {...labels} />}
      <PasswordField label={t('account.newLabel')} value={password} onChange={setPassword} autoComplete="new-password" hint={t('account.hint')} {...labels} />
      <PasswordField label={t('account.confirmLabel')} value={again} onChange={setAgain} autoComplete="new-password" {...labels} />
      <Button type="submit" disabled={busy || !password || !again || (hasPassword && !current)} className="w-full">
        {busy ? t('common.working') : t('account.save')}
      </Button>
      {saved && (
        <p className="flex items-center gap-2 rounded-card border border-ok bg-ok-tint p-3 font-semibold text-ok" aria-live="polite">
          <Check aria-hidden size={20} strokeWidth={1.75} />
          {t('account.saved')}
        </p>
      )}
      {err && <ErrorNote code={err.code} requestId={err.requestId} />}
    </form>
  );
}
