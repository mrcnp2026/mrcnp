'use client';
// 개인정보·위치정보 수집 동의 창 (의뢰인 2026-10-05): 로그인하면 뜨고, 「동의합니다」를 눌러야 사라진다. 닫기 버튼이 없다.
// 동의하지 않으면 앱을 쓸 수 없으므로, 갇히지 않게 로그아웃과 언어 바꾸기만 남겨 둔다.
// 안내문은 번역 파일(consent.*)에 있다 — 고치면 src/config/consent.ts의 판을 올린다.
import { ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from './client-api';
import { ErrorNote } from './ErrorNote';
import { LanguageSwitcher } from './LanguageSwitcher';
import { Button } from './ui';

const ITEMS = ['basic', 'punch', 'network', 'device', 'location'] as const;

export function ConsentGate({ version, languages }: { version: string; languages: { code: string; name: string }[] }) {
  const t = useTranslations('consent');
  const tc = useTranslations('common');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-text/40 md:items-center" role="dialog" aria-modal="true" aria-labelledby="consent-title">
      <div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-md flex-col rounded-t-card bg-bg md:rounded-card">
        <div className="flex items-center justify-between gap-2 px-6 pt-5">
          <h2 id="consent-title" className="flex items-center gap-2 text-xl font-extrabold tracking-tight">
            <ShieldCheck aria-hidden size={22} strokeWidth={1.75} className="shrink-0 text-primary" />
            {t('title')}
          </h2>
          <LanguageSwitcher options={languages} />
        </div>
        <div className="flex flex-col gap-4 overflow-y-auto px-6 py-4 text-sm">
          <p className="text-muted">{t('intro')}</p>
          <section className="flex flex-col gap-2">
            <h3 className="font-bold">{t('collectTitle')}</h3>
            <ul className="flex flex-col gap-2">
              {ITEMS.map((k) => (
                <li key={k} className="rounded-button bg-surface p-3">
                  <p className="font-semibold">{t(`item.${k}.name`)}</p>
                  <p className="text-muted">{t(`item.${k}.detail`)}</p>
                </li>
              ))}
            </ul>
          </section>
          <section className="flex flex-col gap-1">
            <h3 className="font-bold">{t('purposeTitle')}</h3>
            <p className="text-muted">{t('purpose')}</p>
          </section>
          <section className="flex flex-col gap-1">
            <h3 className="font-bold">{t('keepTitle')}</h3>
            <p className="text-muted">{t('keep')}</p>
          </section>
          <section className="flex flex-col gap-1">
            <h3 className="font-bold">{t('refuseTitle')}</h3>
            <p className="text-muted">{t('refuse')}</p>
          </section>
          <p className="num text-xs text-faint">{t('version', { v: version })}</p>
        </div>
        <div className="flex flex-col gap-2 border-t border-border px-6 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="consent" />}
          <Button
            className="min-h-14 w-full"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setErr(null);
              const r = await callApi('/api/consent', { version });
              if (!r.ok) {
                setBusy(false);
                // 안내문이 그 사이 바뀌었으면 새 안내문을 다시 읽어 온다
                if (r.code === 'consent_outdated') router.refresh();
                return setErr(r);
              }
              router.refresh(); // 서버가 동의를 확인하면 이 창을 더 그리지 않는다
            }}
          >
            {busy ? tc('working') : t('agree')}
          </Button>
          <button
            type="button"
            className="min-h-11 text-sm text-muted"
            onClick={async () => {
              await callApi('/api/auth/signout');
              window.location.assign('/login');
            }}
          >
            {t('later')}
          </button>
        </div>
      </div>
    </div>
  );
}
