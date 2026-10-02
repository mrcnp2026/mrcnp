'use client';
import { browserSupportsWebAuthn, startAuthentication } from '@simplewebauthn/browser';
import { Fingerprint } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { callApi, passkeyBrowserError } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';

export function LoginButton() {
  const t = useTranslations();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);

  async function signIn() {
    setErr(null);
    if (!browserSupportsWebAuthn()) return setErr({ code: 'unsupported' });
    setBusy(true);
    try {
      const opts = await callApi<Parameters<typeof startAuthentication>[0]['optionsJSON']>('/api/passkey/login/options');
      if (!opts.ok) return setErr(opts);
      let response;
      try {
        response = await startAuthentication({ optionsJSON: opts.data }); // 폰이 지문·얼굴·PIN을 묻는다
      } catch (e) {
        // 로그인에서는 '취소'와 '이 폰에 등록된 패스키 없음'을 브라우저가 구분해 주지 않는다 (개인정보 보호) — 둘 다 안내
        const code = passkeyBrowserError(e);
        return setErr({ code: code === 'cancelled' ? 'login_cancelled' : code });
      }
      const r = await callApi<{ next: string }>('/api/passkey/login/verify', { response });
      if (!r.ok) return setErr(r);
      // 전체 새로 고침: 로그인 전후로 화면 언어가 바뀌므로 틀(layout)까지 다시 그려야 한다 (2026-10-02 실측)
      window.location.assign(r.data.next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Button onClick={signIn} disabled={busy} className="min-h-14 w-full">
        <Fingerprint aria-hidden size={24} strokeWidth={1.75} />
        {busy ? t('common.working') : t('login.button')}
      </Button>
      {err && <ErrorNote code={err.code} requestId={err.requestId} />}
    </div>
  );
}
