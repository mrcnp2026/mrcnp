'use client';
// 근태 마감 공지 — 전 직원에게 「○월 근태를 ○일에 마감합니다. 그 전에 누락 · 정정 요청을 마쳐 주세요」 (업무 메시지, 2026-10-14 문서 08 ⑥-1)
import { Megaphone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { DateTimeInput } from '@/components/DateTimeInput';
import { ErrorNote } from '@/components/ErrorNote';

export function ClosingNotice({ month, defaultDue }: { month: string; defaultDue: string }) {
  const t = useTranslations('admin.closing.notice');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [due, setDue] = useState(defaultDue);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  const [sent, setSent] = useState<number | null>(null);
  if (!open)
    return (
      <span className="inline-flex items-center gap-2">
        <button type="button" onClick={() => setOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-button border border-border bg-bg px-3.5 text-sm font-semibold text-text hover:bg-surface">
          <Megaphone aria-hidden size={16} />
          {t('open')}
        </button>
        {sent !== null && <span role="status" className="text-sm text-ok">{t('sent', { n: sent })}</span>}
      </span>
    );
  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-card border border-border bg-bg p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        const r = await callApi<{ recipients: number }>('/api/admin/closing', { action: 'notice', month, due });
        setBusy(false);
        if (!r.ok) return setErr(r);
        setSent(r.data.recipients);
        setOpen(false);
        router.refresh();
      }}
    >
      <label className="flex flex-col gap-1 text-sm text-muted">
        {t('due')}
        <DateTimeInput type="date" value={due} onChange={setDue} required className="num min-h-9 rounded-button border border-border bg-bg px-3 text-sm text-text" />
      </label>
      <p className="max-w-md text-sm text-muted">{t('preview', { month, due })}</p>
      <button type="submit" disabled={busy || !due} className="inline-flex h-9 items-center rounded-button bg-primary px-3.5 text-sm font-bold text-on-primary disabled:opacity-50">
        {t('send')}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="inline-flex h-9 items-center px-2 text-sm text-muted">
        {t('cancel')}
      </button>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.closing" />}
    </form>
  );
}
