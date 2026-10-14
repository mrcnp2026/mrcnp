'use client';
// 통합설정 잠금 화면 — 처음이면 숫자 4자리 정하기(두 번), 다음부터는 숫자 4자리 넣기 (2026-10-14 결정 사항 개발-29)
// 맞으면 30분 동안 통합설정이 열린다. 5번 연속 틀리면 15분 잠긴다. 잊었으면 다른 관리자에게 지워 달라고 한다.
import { LockKeyhole } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from './client-api';
import { ErrorNote } from './ErrorNote';

const field = 'num w-40 rounded-button border border-border bg-bg px-4 py-3 text-center text-2xl tracking-[0.5em] text-text focus:border-primary focus:outline-none';

export function ConsoleGate({ mode, lockedUntil }: { mode: 'set' | 'open'; lockedUntil: string | null }) {
  const t = useTranslations('consoleGate');
  const router = useRouter();
  const f = useFormatter();
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 4);

  return (
    <main className="mx-auto flex w-full max-w-md flex-col items-center gap-5 px-4 py-16 text-center">
      <span className="flex size-14 items-center justify-center rounded-card bg-primary-tint text-primary">
        <LockKeyhole aria-hidden size={28} strokeWidth={1.75} />
      </span>
      <div>
        <h1 className="text-2xl font-bold">{t(mode === 'set' ? 'setTitle' : 'openTitle')}</h1>
        <p className="pt-2 text-sm text-muted">{t(mode === 'set' ? 'setLead' : 'openLead')}</p>
      </div>
      {lockedUntil ? (
        <p role="alert" className="rounded-card bg-warn-tint p-3 text-sm font-semibold text-warn">{t('locked', { time: f.dateTime(new Date(lockedUntil), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) })}</p>
      ) : (
        <form
          className="flex flex-col items-center gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setErr(null);
            const r = mode === 'set' ? await callApi('/api/console/pin', { action: 'set', pin, again }) : await callApi<{ ok: boolean; left?: number }>('/api/console/pin', { action: 'open', pin });
            setBusy(false);
            if (!r.ok) return setErr(r);
            if (mode === 'open' && 'data' in r && r.data && (r.data as { ok: boolean }).ok === false) {
              setLeft((r.data as { left: number }).left);
              setPin('');
              return;
            }
            router.refresh();
          }}
        >
          <label className="flex flex-col items-center gap-1 text-sm text-muted">
            {t(mode === 'set' ? 'newPin' : 'pin')}
            <input type="password" inputMode="numeric" autoComplete="off" autoFocus required pattern="\d{4}" maxLength={4} value={pin} onChange={(e) => setPin(digits(e.target.value))} className={field} aria-label={t(mode === 'set' ? 'newPin' : 'pin')} data-console-pin />
          </label>
          {mode === 'set' && (
            <label className="flex flex-col items-center gap-1 text-sm text-muted">
              {t('again')}
              <input type="password" inputMode="numeric" autoComplete="off" required pattern="\d{4}" maxLength={4} value={again} onChange={(e) => setAgain(digits(e.target.value))} className={field} aria-label={t('again')} data-console-pin-again />
            </label>
          )}
          {left !== null && <p role="alert" className="text-sm font-semibold text-danger">{t('wrong', { n: left })}</p>}
          {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="consoleGate" />}
          <button type="submit" disabled={busy || pin.length !== 4 || (mode === 'set' && again.length !== 4)} className="inline-flex h-11 min-w-40 items-center justify-center rounded-button bg-primary px-5 font-bold text-on-primary disabled:opacity-50">
            {t(mode === 'set' ? 'save' : 'open')}
          </button>
        </form>
      )}
      <p className="text-xs text-faint">{t(mode === 'set' ? 'setNote' : 'forgot')}</p>
      <Link href="/admin" className="inline-flex min-h-11 items-center self-start text-sm font-bold text-primary lg:min-h-0">
        {t('back')} ›
      </Link>
    </main>
  );
}
