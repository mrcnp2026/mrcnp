'use client';
// 요청 목록에서 지우기 (2026-10-19 의뢰인) — 한 번 누르면 「목록에서 지울까요? [지우기][그대로]」로 바뀌고, 한 번 더 눌러야 지운다(잘못 눌러도 바로 사라지지 않게).
// 요청 기록은 그대로 남고 내 목록에서만 빠진다 (api/requests/hide).
import { Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';

export function HideRequests({ keys, all = false }: { keys: string[]; all?: boolean }) {
  const t = useTranslations('requests');
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (keys.length === 0) return null;

  const run = async () => {
    setBusy(true);
    setFailed(false);
    const r = await callApi('/api/requests/hide', { keys });
    setBusy(false);
    if (!r.ok) return setFailed(true);
    setAsking(false);
    router.refresh();
  };

  if (!asking) {
    return all ? (
      <button type="button" onClick={() => setAsking(true)} className="inline-flex h-9 items-center gap-1.5 rounded-button border border-border bg-bg px-3 text-sm font-semibold text-muted hover:bg-surface">
        <Trash2 aria-hidden size={16} />
        {t('hideAll')}
      </button>
    ) : (
      <button type="button" onClick={() => setAsking(true)} aria-label={t('hide')} title={t('hide')} className="inline-flex size-9 shrink-0 items-center justify-center rounded-button text-faint hover:bg-surface hover:text-danger">
        <Trash2 aria-hidden size={18} />
      </button>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-sm" role="group">
      <span className="font-semibold">{all ? t('hideAllAsk', { n: keys.length }) : t('hideAsk')}</span>
      <button type="button" disabled={busy} onClick={run} className="inline-flex h-8 items-center rounded-button bg-danger px-3 font-bold text-on-primary disabled:opacity-60">
        {t('hideYes')}
      </button>
      <button type="button" disabled={busy} onClick={() => setAsking(false)} className="inline-flex h-8 items-center rounded-button border border-border bg-bg px-3 font-semibold">
        {t('hideNo')}
      </button>
      {failed && <span className="w-full text-danger">{t('hideFailed')}</span>}
    </span>
  );
}
