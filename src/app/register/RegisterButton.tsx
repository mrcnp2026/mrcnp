'use client';
import { browserSupportsWebAuthn, startRegistration } from '@simplewebauthn/browser';
import { Check, Fingerprint } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { callApi, passkeyBrowserError } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { InstallGuide } from '@/components/InstallGuide';
import { Button } from '@/components/ui';

export function RegisterButton({ token }: { token: string }) {
  const t = useTranslations();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);

  async function register() {
    setErr(null);
    if (!browserSupportsWebAuthn()) return setErr({ code: 'unsupported' });
    setBusy(true);
    try {
      const opts = await callApi<Parameters<typeof startRegistration>[0]['optionsJSON']>('/api/passkey/register/options', { token });
      if (!opts.ok) return setErr(opts);
      let response;
      try {
        response = await startRegistration({ optionsJSON: opts.data }); // 폰이 화면 잠금(지문·얼굴·PIN)을 묻는다
      } catch (e) {
        return setErr({ code: passkeyBrowserError(e) });
      }
      const r = await callApi<{ next: string }>('/api/passkey/register/verify', { token, response });
      if (!r.ok) return setErr(r);
      setDone(r.data.next);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col gap-3">
        <p className="flex items-center gap-2 rounded-card border border-ok bg-ok-tint p-3 font-semibold text-ok">
          <Check aria-hidden size={20} strokeWidth={1.75} />
          {t('register.done')}
        </p>
        <InstallGuide />
        <Button onClick={() => window.location.assign(done)} className="w-full">
          {t('register.continue')}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <Button onClick={register} disabled={busy} className="min-h-14 w-full">
        <Fingerprint aria-hidden size={24} strokeWidth={1.75} />
        {busy ? t('common.working') : t('register.button')}
      </Button>
      {err && <ErrorNote code={err.code} requestId={err.requestId} />}
    </div>
  );
}
