'use client';
// 승인된 정정·대리 등록 취소 — 「취소」를 누르면 사유 칸이 펼쳐진다. 사유는 결정 기록에 남는다.
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';

export function CancelCorrection({ id, label }: { id: string; label: string }) {
  const t = useTranslations('admin.detail');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  const ready = reason.trim().length >= 2;

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} aria-label={t('cancelOf', { what: label })} className="min-h-11 self-start text-sm font-bold text-danger">
        {t('cancelCorrection')}
      </button>
    );
  }
  return (
    <form
      className="flex flex-col gap-2 rounded-button bg-surface p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!ready) return;
        setBusy(true);
        setErr(null);
        const r = await callApi(`/api/admin/corrections/${id}/cancel`, { reason });
        setBusy(false);
        if (!r.ok) return setErr(r);
        setOpen(false);
        router.refresh();
      }}
    >
      <p className="text-sm font-semibold text-text">{t('cancelTitle', { what: label })}</p>
      <p className="text-sm text-warn">{t('cancelWarn')}</p>
      <div className="flex flex-wrap gap-2">
        {(['wrongTime', 'wrongDay', 'wrongPerson'] as const).map((k) => (
          <button key={k} type="button" onClick={() => setReason(t(`cancelPreset.${k}`))} className="min-h-11 rounded-chip bg-bg px-3 text-sm font-medium text-primary">
            {t(`cancelPreset.${k}`)}
          </button>
        ))}
      </div>
      <textarea value={reason} onChange={(e) => setReason(e.target.value)} required maxLength={200} rows={2} aria-label={t('reason')} className="w-full rounded-button border border-border bg-bg p-3 text-base text-text" />
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.detail" />}
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>
          {t('back')}
        </Button>
        <Button type="submit" variant="danger" className="flex-1" disabled={!ready || busy}>
          {t('cancelConfirm')}
        </Button>
      </div>
    </form>
  );
}
