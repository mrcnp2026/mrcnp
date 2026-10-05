'use client';
// 지문·얼굴 로그인 — 예전에 폰을 등록해 둔 기기에서만 되는 보조 수단 (2026-10-05 의뢰인: 기본 로그인은 아이디 + 비밀번호).
// 등록하지 않은 기기에서 누르면 브라우저가 "보안 키(USB)"를 찾으라고 하므로, 눈에 덜 띄는 작은 버튼으로 둔다.
import { browserSupportsWebAuthn, startAuthentication } from '@simplewebauthn/browser';
import { Fingerprint } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { callApi, passkeyBrowserError } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';

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
        response = await startAuthentication({ optionsJSON: opts.data }); // 기기가 지문·얼굴·PIN을 묻는다
      } catch (e) {
        // '취소'와 '이 기기에 등록된 패스키 없음'을 브라우저가 구분해 주지 않는다 (개인정보 보호) — 둘 다 안내
        const code = passkeyBrowserError(e);
        return setErr({ code: code === 'cancelled' ? 'login_cancelled' : code });
      }
      const r = await callApi<{ next: string }>('/api/passkey/login/verify', { response });
      if (!r.ok) return setErr(r);
      window.location.assign(r.data.next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <button type="button" onClick={signIn} disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-button px-3 text-sm text-muted disabled:opacity-60">
        <Fingerprint aria-hidden size={18} strokeWidth={1.75} className="shrink-0" />
        {busy ? t('common.working') : t('login.button')}
      </button>
      {err && <ErrorNote code={err.code} requestId={err.requestId} />}
    </div>
  );
}
