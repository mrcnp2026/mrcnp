'use client';
// 통합설정 잠금 화면 — 처음이면 숫자 4자리 정하기(두 번), 다음부터는 숫자 4자리 넣기 (2026-10-14 결정 사항 개발-29)
// 맞으면 30분 동안 통합설정이 열린다. 5번 연속 틀리면 15분 잠긴다. 잊었으면 다른 관리자에게 지워 달라고 한다.
import { LockKeyhole } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { callApi } from './client-api';
import { ErrorNote } from './ErrorNote';
import { Button } from './ui';

const field = 'num w-40 rounded-button border border-border bg-bg px-4 py-3 text-center text-2xl tracking-[0.5em] text-text focus:border-primary focus:outline-none';

export function ConsoleGate({ mode, lockedUntil }: { mode: 'set' | 'open'; lockedUntil: string | null }) {
  const t = useTranslations('consoleGate');
  const router = useRouter();
  const f = useFormatter();
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  // 맞힌 뒤 통합설정 화면이 그려질 때까지도 고리가 돌게 — refresh가 끝나기 전에 단추가 펴지면 「멈춘 것처럼」 보인다
  const [opening, startOpening] = useTransition();
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
            if (!r.ok) {
              setBusy(false);
              return setErr(r);
            }
            if (mode === 'open' && 'data' in r && r.data && (r.data as { ok: boolean }).ok === false) {
              setBusy(false);
              setLeft((r.data as { left: number }).left);
              setPin('');
              return;
            }
            startOpening(() => {
              setBusy(false);
              router.refresh();
            });
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
          {/* 다른 단추처럼 누르면 줄어들어 고리가 돈다 (2026-10-28 의뢰인) — 공통 Button = MorphButton */}
          <Button type="submit" disabled={busy || opening || pin.length !== 4 || (mode === 'set' && again.length !== 4)} className="min-w-40 px-5">
            {t(mode === 'set' ? 'save' : 'open')}
          </Button>
        </form>
      )}
      <p className="text-xs text-faint">{t(mode === 'set' ? 'setNote' : 'forgot')}</p>
      <Link href="/admin" className="inline-flex min-h-11 items-center self-start text-sm font-bold text-primary lg:min-h-0">
        {t('back')} ›
      </Link>
    </main>
  );
}
