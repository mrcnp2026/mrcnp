'use client';
// 최고관리자 직권 수정 — 찍힌 기록 한 줄의 「고치기」. 시각을 바꾸거나 기록을 지운다(사유 필수, 결정 기록에 남는다).
// 서버: api/admin/punches/[id]/fix (최고관리자만, 원본은 그대로 두고 승인된 정정으로 남긴다).
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';

export function DirectFix({ eventId, label, time, canNextDay }: { eventId: string; label: string; time: string; canNextDay: boolean }) {
  const t = useTranslations('admin.detail');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<'modify' | 'void'>('modify');
  const [value, setValue] = useState(time);
  const [nextDay, setNextDay] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  const ready = reason.trim().length >= 2 && (action === 'void' || /^\d{2}:\d{2}$/.test(value));

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} aria-label={t('fixOf', { what: label })} className="min-h-8 text-sm font-bold text-primary" data-direct-fix>
        {t('fix')}
      </button>
    );
  }
  return (
    <form
      className="flex w-full flex-col gap-2 rounded-button bg-surface p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!ready) return;
        setBusy(true);
        setErr(null);
        const r = await callApi(`/api/admin/punches/${eventId}/fix`, { action, time: value, nextDay, reason });
        setBusy(false);
        if (!r.ok) return setErr(r);
        setOpen(false);
        router.refresh();
      }}
    >
      <p className="text-sm font-semibold text-text">{t('fixTitle', { what: label })}</p>
      <div className="flex gap-2" role="radiogroup">
        {(['modify', 'void'] as const).map((a) => (
          <button key={a} type="button" role="radio" aria-checked={action === a} onClick={() => setAction(a)} className={`min-h-11 flex-1 rounded-button border text-sm font-semibold ${action === a ? 'border-primary bg-primary-tint text-primary' : 'border-border text-text'}`}>
            {t(`fixAction.${a}`)}
          </button>
        ))}
      </div>
      {action === 'modify' && (
        <div className="flex flex-wrap items-center gap-3">
          <input type="time" value={value} onChange={(e) => setValue(e.target.value)} required aria-label={t('fixTime')} className="min-h-11 rounded-button border border-border bg-bg px-3 text-base text-text" />
          {canNextDay && (
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" checked={nextDay} onChange={(e) => setNextDay(e.target.checked)} className="size-4 accent-primary" />
              {t('fixNextDay')}
            </label>
          )}
        </div>
      )}
      {action === 'void' && <p className="text-sm text-warn">{t('fixVoidWarn')}</p>}
      <textarea value={reason} onChange={(e) => setReason(e.target.value)} required maxLength={200} rows={2} placeholder={t('reason')} aria-label={t('reason')} className="w-full rounded-button border border-border bg-bg p-3 text-base text-text" />
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.detail" />}
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>
          {t('back')}
        </Button>
        <Button type="submit" variant={action === 'void' ? 'danger' : 'primary'} className="flex-1" disabled={!ready || busy}>
          {t(action === 'void' ? 'fixVoidConfirm' : 'fixSave')}
        </Button>
      </div>
    </form>
  );
}
