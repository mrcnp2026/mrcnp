'use client';
// 기록 확정 버튼 (의뢰인 2026-10-11) — 상세 화면 아래의 큰 [확정하기] / [확정 풀기], 목록 날짜 머리줄의 「모두 확정」.
// 확정 풀기는 한 번 더 묻는다 (풀면 급여 계산에서 빠지고 정정이 다시 열린다).
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';

type Item = { employeeId: string; date: string };

export function ConfirmButton({ item, confirmed }: { item: Item; confirmed: boolean }) {
  const t = useTranslations('admin.confirm');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  const send = async (confirm: boolean) => {
    setBusy(true);
    setErr(null);
    const r = await callApi('/api/admin/records/confirm', { items: [item], confirm });
    setBusy(false);
    setAsk(false);
    if (!r.ok) return setErr(r);
    router.refresh();
  };
  return (
    <div className="flex flex-col gap-2">
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.confirm" />}
      {!confirmed && (
        <button type="button" disabled={busy} onClick={() => send(true)} className="-mx-4 min-h-14 bg-primary text-lg font-bold text-on-primary disabled:opacity-60 lg:mx-0 lg:rounded-button">
          {t('confirm')}
        </button>
      )}
      {confirmed && !ask && (
        <button type="button" onClick={() => setAsk(true)} className="min-h-11 self-start rounded-button border border-border bg-bg px-4 text-sm font-bold text-muted">
          {t('release')}
        </button>
      )}
      {confirmed && ask && (
        <div className="flex flex-col gap-2 rounded-card border border-warn bg-warn-tint p-4">
          <p className="text-sm text-warn">{t('releaseAsk')}</p>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => send(false)} className="min-h-11 flex-1 rounded-button bg-danger px-4 text-sm font-bold text-on-primary disabled:opacity-60">
              {t('release')}
            </button>
            <button type="button" onClick={() => setAsk(false)} className="min-h-11 flex-1 rounded-button border border-border bg-bg px-4 text-sm font-bold text-muted">
              {t('keep')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** 그날 보이는 기록을 한 번에 확정 — 안 된 건수는 옆에 알린다 (퇴근 없음 · 대기 중인 정정 · 본인 기록) */
export function ConfirmAll({ items }: { items: Item[] }) {
  const t = useTranslations('admin.confirm');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  if (items.length === 0) return null;
  return (
    <span className="flex shrink-0 items-center gap-2">
      {note && <span role="status" className="text-xs font-medium text-muted">{note}</span>}
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await callApi<{ done: number; skipped: unknown[] }>('/api/admin/records/confirm', { items, confirm: true });
          setBusy(false);
          if (!r.ok) return setNote(t('failed'));
          setNote(r.data.skipped.length > 0 ? t('partly', { done: r.data.done, skipped: r.data.skipped.length }) : null);
          router.refresh();
        }}
        className="min-h-9 rounded-button border border-primary bg-bg px-3 text-sm font-bold text-primary disabled:opacity-60"
      >
        {t('all', { n: items.length })}
      </button>
    </span>
  );
}
