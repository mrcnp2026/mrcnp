'use client';
// 초대 링크 보내기 — 이전 링크가 무효가 되므로 무엇이 바뀌는지 한 줄 보여 주고 한 번 더 확인 (마스터 5장 규칙 5)
import { Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';
import { InviteView, type Invite } from './InviteView';

export function NewInviteButton({ employeeId, name }: { employeeId: string; name: string }) {
  const t = useTranslations('admin.members');
  const [stage, setStage] = useState<'idle' | 'confirm' | 'busy'>('idle');
  const [invite, setInvite] = useState<Invite | null>(null);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);

  if (invite) {
    return (
      <div className="fixed inset-0 z-20 flex items-start justify-center overflow-y-auto bg-text/40 p-4">
        <div className="w-full max-w-md">
          <InviteView name={name} invite={invite} onClose={() => setInvite(null)} />
        </div>
      </div>
    );
  }
  if (stage === 'idle') {
    return (
      <Button variant="outline" onClick={() => setStage('confirm')} className="shrink-0 text-sm">
        <Send aria-hidden size={18} strokeWidth={1.75} />
        {t('newInvite')}
      </Button>
    );
  }
  return (
    <div className="flex max-w-56 flex-col gap-2 text-sm">
      <p className="text-muted">{t('newInviteConfirm', { name })}</p>
      <div className="flex gap-2">
        <Button
          disabled={stage === 'busy'}
          className="flex-1 text-sm"
          onClick={async () => {
            setStage('busy');
            const r = await callApi<{ invite: Invite }>(`/api/admin/employees/${employeeId}/invite`);
            setStage('idle');
            if (!r.ok) return setErr(r);
            setInvite(r.data.invite);
          }}
        >
          {t('confirm')}
        </Button>
        <Button variant="outline" className="flex-1 text-sm" onClick={() => setStage('idle')}>
          {t('cancel')}
        </Button>
      </div>
      {err && <ErrorNote code={err.code} requestId={err.requestId} />}
    </div>
  );
}
