'use client';
// 휴게 안 함 표시 (결정 사항 급여-60, 2026-11-02 의뢰인) — 근무 기록 상세 화면의 휴게시간대 줄.
// 휴게시간대마다 「쉼」 또는 「휴게 안 함 · 사유」를 보이고, 관리자가 사유를 적어 표시하거나 되돌린다. 계산은 서버가 다시 한다.
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';

export type BreakRow = { start: string; end: string; waiver: { id: string; reason: string } | null };

export function BreakWaivers({ employeeId, date, rows, canEdit }: { employeeId: string; date: string; rows: BreakRow[]; canEdit: boolean }) {
  const t = useTranslations('admin.breakWaiver');
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null); // 사유를 적고 있는 휴게시간대의 시작 시각
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  const send = async (body: Record<string, unknown>) => {
    setBusy(true);
    setErr(null);
    const r = await callApi('/api/admin/break-waivers', body);
    setBusy(false);
    if (!r.ok) return setErr(r);
    setOpen(null);
    setReason('');
    router.refresh();
  };
  if (rows.length === 0) return null;
  return (
    <section className="flex flex-col gap-2 rounded-card border border-border bg-bg p-4">
      <h2 className="text-sm font-bold">{t('title')}</h2>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.breakWaiver" />}
      <ul className="flex flex-col divide-y divide-border">
        {rows.map((r) => (
          <li key={r.start} className="flex flex-col gap-2 py-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="num font-medium">
                {r.start} - {r.end}
              </span>
              <span className={r.waiver ? 'text-sm font-bold text-warn' : 'text-sm text-muted'}>{r.waiver ? t('waived') : t('rested')}</span>
              {r.waiver && <span className="min-w-0 break-words text-sm text-muted">{r.waiver.reason}</span>}
              {canEdit && !r.waiver && open !== r.start && (
                <button type="button" onClick={() => { setOpen(r.start); setReason(''); }} className="ml-auto min-h-11 rounded-button border border-border px-3 text-sm font-bold text-primary">
                  {t('mark')}
                </button>
              )}
              {canEdit && r.waiver && (
                <button type="button" disabled={busy} onClick={() => send({ action: 'release', id: r.waiver!.id })} className="ml-auto min-h-11 rounded-button border border-border px-3 text-sm font-bold text-muted disabled:opacity-60">
                  {t('undo')}
                </button>
              )}
            </div>
            {open === r.start && (
              <form
                className="flex flex-col gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  send({ action: 'add', employeeId, date, start: r.start, end: r.end, reason });
                }}
              >
                <label className="flex flex-col gap-1 text-sm">
                  {t('reason')}
                  <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} required placeholder={t('reasonHint')} className="min-h-11 rounded-button border border-border bg-surface px-3" />
                </label>
                <div className="flex gap-2">
                  <button type="submit" disabled={busy || !reason.trim()} className="min-h-11 flex-1 rounded-button bg-primary px-4 text-sm font-bold text-on-primary disabled:opacity-60">
                    {t('save')}
                  </button>
                  <button type="button" onClick={() => setOpen(null)} className="min-h-11 flex-1 rounded-button border border-border bg-bg px-4 text-sm font-bold text-muted">
                    {t('cancel')}
                  </button>
                </div>
              </form>
            )}
          </li>
        ))}
      </ul>
      <p className="text-xs text-faint">{t('hint')}</p>
    </section>
  );
}
