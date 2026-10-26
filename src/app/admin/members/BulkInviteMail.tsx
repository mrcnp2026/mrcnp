'use client';
// 미가입 직원 전원에게 이메일로 가입 안내 보내기 (2026-10-26 의뢰인: 카톡 · 문자 서비스가 없으니 메일로 한 번에).
// 누르면 한 번 더 묻는다 — 많은 메일이 나가는 단추다. 보낸 뒤에는 보낸 수 · 이메일이 없어 못 보낸 사람 · 실패한 사람을 알려 준다.
import { Mail } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';

type Result = { sent: number; noEmail: string[]; failed: string[] };

export function BulkInviteMail({ sendable, noEmail, ready }: { sendable: number; noEmail: number; ready: boolean }) {
  const t = useTranslations('admin.members');
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);

  if (res) {
    return (
      <div role="status" className="flex flex-col gap-1 rounded-card border border-ok bg-ok-tint p-3 text-sm">
        <p className="font-bold text-ok">{t('bulkDone', { n: res.sent })}</p>
        {res.noEmail.length > 0 && <p className="text-muted">{t('bulkNoEmail', { n: res.noEmail.length, names: res.noEmail.join(', ') })}</p>}
        {res.failed.length > 0 && <p className="text-warn">{t('bulkFailed', { n: res.failed.length, names: res.failed.join(', ') })}</p>}
      </div>
    );
  }
  if (!ready) return <p className="rounded-card bg-surface p-3 text-sm text-muted">{t('bulkNotReady')}</p>;
  return (
    <div className="flex flex-col gap-2">
      {ask ? (
        <div className="flex flex-col gap-2 rounded-card border border-warn bg-warn-tint p-3 text-sm lg:flex-row lg:items-center">
          <span className="font-bold text-warn lg:flex-1">{t('bulkAsk', { n: sendable, none: noEmail })}</span>
          <span className="flex gap-2">
            <Button
              type="button"
              className="flex-1"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setErr(null);
                const r = await callApi<Result>('/api/admin/employees/invite-mail-all', {});
                setBusy(false);
                if (!r.ok) {
                  setErr(r);
                  setAsk(false);
                  return;
                }
                setRes(r.data);
                router.refresh();
              }}
            >
              {busy ? t('bulkSending') : t('bulkYes')}
            </Button>
            <Button type="button" variant="outline" className="flex-1" disabled={busy} onClick={() => setAsk(false)}>
              {t('bulkNo')}
            </Button>
          </span>
        </div>
      ) : (
        <Button type="button" className="self-start" disabled={sendable === 0} onClick={() => setAsk(true)}>
          <Mail aria-hidden size={18} strokeWidth={1.75} />
          {t('bulkButton', { n: sendable })}
        </Button>
      )}
      {sendable === 0 && noEmail > 0 && <p className="text-xs text-muted">{t('bulkNoneSendable', { none: noEmail })}</p>}
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.members" />}
    </div>
  );
}
