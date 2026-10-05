'use client';
// 비밀번호 만들기 — 초대(링크·8자리 코드)를 확인한 직원이 로그인에 쓸 비밀번호를 스스로 정한다 (2026-10-05 의뢰인).
// 두 번 입력해 오타를 잡는다. 규칙(8자 이상·사번과 다름)은 서버가 다시 본다.
import { Check, KeyRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AddToHomeAndContinue } from '@/components/AddToHome';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { PasswordField } from '@/components/PasswordField';
import { Button } from '@/components/ui';

export function PasswordSetup({ token }: { token: string }) {
  const t = useTranslations();
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);

  if (done) {
    return (
      <div className="flex flex-col gap-3">
        <p className="flex items-center gap-2 rounded-card border border-ok bg-ok-tint p-3 font-semibold text-ok">
          <Check aria-hidden size={20} strokeWidth={1.75} />
          {t('register.done')}
        </p>
        <p className="text-sm text-muted">{t('install.why')}</p>
        <AddToHomeAndContinue next={done} />
      </div>
    );
  }
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setErr(null);
        if (password !== again) return setErr({ code: 'password_mismatch' });
        setBusy(true);
        const r = await callApi<{ next: string }>('/api/auth/password/setup', { token, password });
        setBusy(false);
        if (!r.ok) return setErr(r);
        setDone(r.data.next);
      }}
    >
      <PasswordField
        label={t('register.passwordLabel')}
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        showLabel={t('login.showPassword')}
        hideLabel={t('login.hidePassword')}
        hint={t('register.passwordHint')}
      />
      <PasswordField
        label={t('register.confirmLabel')}
        value={again}
        onChange={setAgain}
        autoComplete="new-password"
        showLabel={t('login.showPassword')}
        hideLabel={t('login.hidePassword')}
      />
      <Button type="submit" disabled={busy || !password || !again} className="min-h-14 w-full">
        <KeyRound aria-hidden size={22} strokeWidth={1.75} />
        {busy ? t('common.working') : t('register.button')}
      </Button>
      {err && <ErrorNote code={err.code} requestId={err.requestId} />}
    </form>
  );
}
