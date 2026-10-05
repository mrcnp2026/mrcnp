'use client';
// 권한 변경 대기 (두 번째 관리자 확인, R-2의 8): 요청한 사람에게는 "확인을 기다리는 중 + 취소", 다른 관리자에게는 "확인 / 거부".
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button, Card } from '@/components/ui';

export function RoleRequestCard({ id, change, requester, reason, mine }: { id: string; change: string; requester: string; reason: string; mine: boolean }) {
  const t = useTranslations('admin.manage');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  const decide = async (decision: 'approved' | 'rejected' | 'cancelled') => {
    setBusy(true);
    setErr(null);
    const r = await callApi(`/api/admin/role-requests/${id}`, { decision });
    setBusy(false);
    if (!r.ok) setErr(r);
    router.refresh();
  };
  return (
    <Card className="flex flex-col gap-3 bg-primary-tint">
      <div>
        <p className="text-sm font-bold text-primary">{t('pendingTitle')}</p>
        <p className="mt-1 text-lg font-extrabold">{change}</p>
        <p className="mt-1 text-sm text-muted">{t('pendingBy', { who: requester })}</p>
        <p className="text-sm break-words whitespace-pre-wrap text-muted">{t('pendingReason', { reason })}</p>
      </div>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.manage" />}
      {mine ? (
        <>
          <p className="text-sm text-muted">{t('pendingWait')}</p>
          <Button variant="outline" className="bg-bg" disabled={busy} onClick={() => decide('cancelled')}>
            {t('pendingCancel')}
          </Button>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="bg-bg" disabled={busy} onClick={() => decide('rejected')}>
            {t('pendingReject')}
          </Button>
          <Button disabled={busy} onClick={() => decide('approved')}>
            {t('pendingApprove')}
          </Button>
        </div>
      )}
    </Card>
  );
}
