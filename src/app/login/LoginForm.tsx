'use client';
// 로그인 — 아이디(사번 또는 휴대폰 번호) + 비밀번호. PC·폰 어느 기기에서나 (2026-10-05 의뢰인).
import { LogIn } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { PasswordField } from '@/components/PasswordField';
import { Button } from '@/components/ui';

export function LoginForm() {
  const t = useTranslations();
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setErr(null);
        setBusy(true);
        const r = await callApi<{ next: string }>('/api/auth/login', { id, password });
        if (!r.ok) {
          setBusy(false);
          return setErr(r);
        }
        // 전체 새로 고침: 로그인 전후로 화면 언어가 바뀌므로 틀(layout)까지 다시 그려야 한다 (2026-10-02 실측)
        window.location.assign(r.data.next);
      }}
    >
      <label className="flex flex-col gap-1 text-sm text-muted">
        {t('login.idLabel')}
        <input
          value={id}
          onChange={(e) => setId(e.target.value)}
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          inputMode="text"
          maxLength={64}
          required
          className="min-h-14 rounded-button border border-border bg-bg px-4 text-lg text-text"
        />
      </label>
      <PasswordField
        label={t('login.passwordLabel')}
        value={password}
        onChange={setPassword}
        autoComplete="current-password"
        showLabel={t('login.showPassword')}
        hideLabel={t('login.hidePassword')}
      />
      <Button type="submit" disabled={busy || !id.trim() || !password} className="min-h-14 w-full">
        <LogIn aria-hidden size={22} strokeWidth={1.75} />
        {busy ? t('common.working') : t('login.submit')}
      </Button>
      {err && <ErrorNote code={err.code} requestId={err.requestId} />}
      <p className="text-sm text-muted">{t('login.forgot')}</p>
    </form>
  );
}
