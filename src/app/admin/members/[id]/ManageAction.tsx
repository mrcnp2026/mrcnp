'use client';
// 직원 관리 동작 하나 (퇴사 처리·복직·폰 해제·권한 변경) — 줄을 누르면 펼쳐지고, 사유를 적어야 실행된다.
// 사유는 변경 기록에 남는다. 자주 쓰는 사유는 버튼으로 채운다 (자유 입력만 두면 "."을 찍는다).
import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';

export function ManageAction({
  title,
  hint,
  confirmLabel,
  endpoint,
  body,
  presets,
  notes = [],
  danger = false,
}: {
  title: string;
  hint: string;
  confirmLabel: string;
  endpoint: string;
  body: Record<string, unknown>;
  presets: string[];
  notes?: string[]; // 실행 전에 꼭 봐야 하는 것 (퇴사 처리의 남은 일 등)
  danger?: boolean;
}) {
  const t = useTranslations('admin.manage');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  const ready = reason.trim().length >= 2;

  return (
    <div className="border-t border-border first:border-t-0">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex min-h-14 w-full items-center gap-3 px-5 text-left">
        <span className="min-w-0 flex-1">
          <span className={`block font-medium ${danger ? 'text-danger' : ''}`}>{title}</span>
          <span className="block text-xs text-muted">{hint}</span>
        </span>
        <ChevronDown aria-hidden size={18} strokeWidth={2} className={`shrink-0 text-faint ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <form
          className="flex flex-col gap-3 px-5 pb-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!ready) return;
            setBusy(true);
            setErr(null);
            const r = await callApi(endpoint, { ...body, reason });
            setBusy(false);
            if (!r.ok) return setErr(r);
            setOpen(false);
            setReason('');
            router.refresh();
          }}
        >
          {notes.length > 0 && (
            <ul className="flex flex-col gap-1 rounded-button bg-warn-tint p-3 text-sm text-warn">
              {notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
          <span className="text-sm text-muted">{t('reason')}</span>
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <button key={p} type="button" onClick={() => setReason(p)} className="min-h-11 rounded-chip bg-surface px-3 text-sm font-medium text-primary">
                {p}
              </button>
            ))}
          </div>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} required maxLength={200} rows={2} aria-label={t('reason')} className="w-full rounded-button border border-border bg-bg p-3 text-base text-text" />
          <span className="text-xs text-faint">{t('reasonHint')}</span>
          {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.manage" />}
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" variant={danger ? 'danger' : 'primary'} disabled={!ready || busy} className="flex-1">
              {confirmLabel}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
