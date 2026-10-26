'use client';
// 실패 · 아직 안 보낸 명세서 메일 다시 보내기 — 10장씩 나눠 부른다(서버 시간 제한). 시스템관리자 운영 화면 전용.
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';

type Item = { employeeId: string; slipId: string };
type Res = { sent: number; failed: number; noEmail: number; noBirth: number; skipped: number };

export function ResendMails({ items, one = false }: { items: Item[]; one?: boolean }) {
  const t = useTranslations('admin.opsMail');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  if (items.length === 0) return null;
  const run = async () => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    const tot: Res = { sent: 0, failed: 0, noEmail: 0, noBirth: 0, skipped: 0 };
    for (let i = 0; i < items.length; i += 10) {
      const r = await callApi<Res>('/api/admin/ops/mail', { items: items.slice(i, i + 10) });
      if (!r.ok) {
        setErr(r);
        break;
      }
      for (const k of Object.keys(tot) as (keyof Res)[]) tot[k] += r.data[k];
    }
    setBusy(false);
    setMsg(t('resendDone', { sent: tot.sent, failed: tot.failed }));
    router.refresh();
  };
  return (
    <span className="flex flex-col gap-1">
      <Button type="button" size="sm" variant={one ? 'outline' : undefined} disabled={busy} onClick={run}>
        {busy ? t('sending') : one ? t('resendOne') : t('resendAll', { n: items.length })}
      </Button>
      {msg && <span role="status" className="text-xs text-ok">{msg}</span>}
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.payRuns" />}
    </span>
  );
}
