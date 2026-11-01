'use client';
// 이관 정리 화면의 고르기 · 실행 (개발-63). 재확인은 「그대로 유지」를 기본으로 모두 골라 두고, 대기는 한 건씩 인정 / 불인정을 고른다.
// 마감된 달의 건은 고를 수 없다(DB가 막는다 — 그 달 마감을 다시 열어야 한다). 실행하면 서버가 지금 DB로 한 번 더 확인한다.
import { Lock } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { reloadAlerts } from '@/components/Alerts';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';

export type BoardRow = {
  id: string; name: string; employeeNo: string; workDate: string; review: boolean; closed: boolean;
  minutes: number; // 대기: 계산된 연장 · 재확인: 결정했던 인정분
  recomputed: number | null; decided: 'approved' | 'rejected' | 'pending';
};
type Pick = 'keep' | 'approve' | 'reject';
type Result = { ok: number; already: number; closed: number; failed: number; skipped: unknown[] };


export function MigrateBoard({ rows, live }: { rows: BoardRow[]; live: boolean }) {
  const t = useTranslations('migrate');
  const f = useFormatter();
  // 날짜는 언어에 맞게 — 정오로 두어 시간대 때문에 하루가 밀리지 않게
  const day = (d: string, year = false) => f.dateTime(new Date(`${d}T12:00:00+09:00`), { year: year ? 'numeric' : undefined, month: 'numeric', day: 'numeric', weekday: 'short' });
  const hm = (n: number) => t('hm', { h: Math.floor(n / 60), m: n % 60 });
  const router = useRouter();
  const review = rows.filter((r) => r.review);
  const pending = rows.filter((r) => !r.review);
  const [picks, setPicks] = useState<Record<string, Pick | undefined>>(() => Object.fromEntries(review.filter((r) => !r.closed).map((r) => [r.id, 'keep' as Pick])));
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const set = (id: string, v: Pick | undefined) => setPicks((p) => ({ ...p, [id]: v }));
  const chosen = Object.entries(picks).filter((e): e is [string, Pick] => !!e[1]);
  const count = (k: Pick) => chosen.filter(([, v]) => v === k).length;
  const openReview = review.filter((r) => !r.closed);
  const openPending = pending.filter((r) => !r.closed);
  const allKeep = openReview.length > 0 && openReview.every((r) => picks[r.id] === 'keep');

  async function run() {
    setBusy(true);
    setErr(null);
    const r = await callApi<Result>('/api/admin/requests/migrate', { picks: chosen.map(([id, action]) => ({ id, action })), live });
    setBusy(false);
    setAsking(false);
    if (!r.ok) return setErr(r);
    setResult(r.data);
    setPicks({});
    router.refresh();
    reloadAlerts();
  }

  const seg = (on: boolean, tone: 'ok' | 'muted') => `min-h-9 flex-1 rounded-button px-3 text-sm font-bold transition-colors ${on ? (tone === 'ok' ? 'bg-primary text-on-primary' : 'bg-text text-bg') : 'text-muted hover:bg-surface'}`;
  const closedNote = (
    <span className="inline-flex items-center gap-1 text-xs text-warn">
      <Lock aria-hidden size={12} /> {t('closed')}
    </span>
  );

  return (
    <div className="flex flex-col gap-6">
      {result && (
        <p role="status" className="rounded-card bg-ok-tint p-3 text-sm font-bold text-ok">
          {t('done', { ok: result.ok })}
          {result.already + result.skipped.length > 0 && <span className="font-normal"> · {t('doneSkipped', { n: result.already + result.skipped.length })}</span>}
          {result.closed > 0 && <span className="font-normal text-warn"> · {t('doneClosed', { n: result.closed })}</span>}
          {result.failed > 0 && <span className="font-normal text-danger"> · {t('doneFailed', { n: result.failed })}</span>}
        </p>
      )}

      {/* 재확인: 이미 결정한 것 — 결정했던 값 그대로 닫는다 */}
      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-end justify-between gap-2 px-1">
          <div>
            <h2 className="font-bold">{t('reviewTitle', { n: review.length })}</h2>
            <p className="text-xs text-muted">{t('reviewHint')}</p>
          </div>
          {openReview.length > 0 && (
            <label className="flex min-h-9 items-center gap-2 text-sm">
              <input type="checkbox" className="size-4" checked={allKeep} onChange={(e) => setPicks((p) => ({ ...p, ...Object.fromEntries(openReview.map((r) => [r.id, e.target.checked ? ('keep' as Pick) : undefined])) }))} />
              {t('keepAll')}
            </label>
          )}
        </div>
        {review.length === 0 ? (
          <p className="rounded-card bg-surface p-4 text-sm text-muted">{t('none')}</p>
        ) : (
          <ul className="divide-y divide-border rounded-card border border-border bg-bg">
            {review.map((r) => (
              <li key={r.id}>
                <label className={`flex items-center gap-3 px-3 py-2.5 ${r.closed ? 'opacity-60' : 'cursor-pointer'}`}>
                  <input type="checkbox" className="size-4 shrink-0" disabled={r.closed} checked={picks[r.id] === 'keep'} onChange={(e) => set(r.id, e.target.checked ? 'keep' : undefined)} aria-label={t('keepOf', { name: r.name, day: day(r.workDate) })} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm"><b>{r.name}</b> <span className="num text-muted">{day(r.workDate)}</span></span>
                    {r.closed && closedNote}
                  </span>
                  <span className="num shrink-0 text-right text-sm">
                    {r.decided === 'rejected' ? t('wasRejected') : t('minutes', { v: hm(r.minutes) })}
                    <span className="block text-xs text-muted">{t('recomputed', { v: hm(r.recomputed ?? 0) })}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 대기: 아직 결정하지 않은 것 — 한 건씩 인정 / 불인정 */}
      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-end justify-between gap-2 px-1">
          <div>
            <h2 className="font-bold">{t('pendingTitle', { n: pending.length })}</h2>
            <p className="text-xs text-muted">{t('pendingHint')}</p>
          </div>
          {openPending.length > 0 && (
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setPicks((p) => ({ ...p, ...Object.fromEntries(openPending.map((r) => [r.id, 'reject' as Pick])) }))}>{t('rejectAll')}</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setPicks((p) => ({ ...p, ...Object.fromEntries(openPending.map((r) => [r.id, undefined])) }))}>{t('clearAll')}</Button>
            </div>
          )}
        </div>
        {pending.length === 0 ? (
          <p className="rounded-card bg-surface p-4 text-sm text-muted">{t('none')}</p>
        ) : (
          <ul className="divide-y divide-border rounded-card border border-border bg-bg">
            {pending.map((r) => (
              <li key={r.id} className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 ${r.closed ? 'opacity-60' : ''}`}>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm"><b>{r.name}</b> <span className="num text-muted">{day(r.workDate, true)}</span></span>
                  <span className="num text-xs text-muted">{t('calc', { v: hm(r.minutes) })}</span>
                  {r.closed && closedNote}
                </span>
                {!r.closed && (
                  <div role="radiogroup" aria-label={t('pickOf', { name: r.name, day: day(r.workDate) })} className="flex w-full gap-1 rounded-button bg-surface p-1 sm:w-56">
                    <button type="button" role="radio" aria-checked={picks[r.id] === 'approve'} className={seg(picks[r.id] === 'approve', 'ok')} onClick={() => set(r.id, picks[r.id] === 'approve' ? undefined : 'approve')}>{t('approve')}</button>
                    <button type="button" role="radio" aria-checked={picks[r.id] === 'reject'} className={seg(picks[r.id] === 'reject', 'muted')} onClick={() => set(r.id, picks[r.id] === 'reject' ? undefined : 'reject')}>{t('reject')}</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 맨 아래: 고른 건수 → 확인 → 실행 (화면 아래 고정은 폰 하단 탭과 겹쳐서 목록 끝에 둔다) */}
      <div className="rounded-card border border-border bg-surface p-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1 text-sm">
            <b className="num">{t('picked', { n: chosen.length })}</b>
            <span className="block text-xs text-muted">{t('pickedDetail', { keep: count('keep'), approve: count('approve'), reject: count('reject') })}</span>
          </p>
          {asking ? (
            <>
              <button type="button" className="min-h-9 px-2 text-sm text-muted" onClick={() => setAsking(false)}>{t('cancel')}</button>
              <Button type="button" disabled={busy} onClick={run}>{t('runYes', { n: chosen.length })}</Button>
            </>
          ) : (
            <Button type="button" disabled={chosen.length === 0} onClick={() => setAsking(true)}>{t('run')}</Button>
          )}
        </div>
        {asking && <p className="mt-2 text-xs text-warn">{t('confirm')}</p>}
        {err && <div className="mt-2"><ErrorNote code={err.code} requestId={err.requestId} namespace="migrate" /></div>}
      </div>
    </div>
  );
}
