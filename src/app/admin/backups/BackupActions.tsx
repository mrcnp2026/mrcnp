'use client';
// 백업 화면의 단추들 (2026-10-25 의뢰인): 「지금 백업」, 줄마다 「내려받기」 · 「이 백업으로 되돌리기」.
import { Download, RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button, Card, CardTitle } from '@/components/ui';

type Err = { code: string; requestId?: string } | null;

export function BackupActions() {
  const t = useTranslations('admin.backups');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Err>(null);
  const [done, setDone] = useState<string | null>(null);
  return (
    <Card className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <div className="lg:flex-1">
        <CardTitle>{t('nowTitle')}</CardTitle>
        <p className="pt-1 text-sm text-muted">{t('nowNote')}</p>
      </div>
      <div className="flex flex-col items-start gap-2">
        <Button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true); setErr(null); setDone(null);
            const r = await callApi<{ name: string; rows: number; size: number }>('/api/admin/backups/run', {});
            setBusy(false);
            if (!r.ok) return setErr(r);
            setDone(t('nowDone', { rows: r.data.rows.toLocaleString() }));
            router.refresh();
          }}
        >
          {busy ? t('nowWorking') : t('nowDo')}
        </Button>
        {done && <p role="status" className="text-sm font-semibold text-ok">{done}</p>}
        {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.backups" />}
      </div>
    </Card>
  );
}

export function BackupRow({ name }: { name: string }) {
  const t = useTranslations('admin.backups');
  return (
    <span className="flex shrink-0 items-center gap-2">
      <a href={`/api/admin/backups/download?name=${encodeURIComponent(name)}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-button border border-border px-3 text-sm font-semibold text-text hover:bg-surface">
        <Download aria-hidden size={16} />
        <span className="hidden sm:inline">{t('download')}</span>
      </a>
      <Link href={`/admin/backups/restore?name=${encodeURIComponent(name)}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-button bg-primary px-3 text-sm font-bold text-on-primary">
        <RotateCcw aria-hidden size={16} />
        {t('restoreGo')}
      </Link>
    </span>
  );
}
