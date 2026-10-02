'use client';
// 초대 링크 보내기 — 이전 링크가 무효가 되므로 무엇이 바뀌는지 한 줄 보여 주고 한 번 더 확인 (마스터 5장 규칙 5)
import { Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';
import { InviteView, type Invite } from './InviteView';

export function NewInviteButton({ employeeId, name, compact = false, again = false }: { employeeId: string; name: string; compact?: boolean; again?: boolean }) {
  const t = useTranslations('admin.members');
  const [stage, setStage] = useState<'idle' | 'confirm' | 'busy'>('idle');
  const [invite, setInvite] = useState<Invite | null>(null);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);

  if (invite) {
    return (
      <div className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-text/40 p-4">
        <div className="w-full max-w-md">
          <InviteView name={name} invite={invite} onClose={() => setInvite(null)} />
        </div>
      </div>
    );
  }
  // 카드 안의 작은 버튼. 이미 가입한 사람은 "폰 바꿨을 때" 다시 보내는 것이라 글자를 바꾼다
  const button = (
    <Button variant="outline" onClick={() => setStage('confirm')} className={compact ? 'min-h-11 w-full px-2 text-sm whitespace-nowrap' : 'shrink-0 text-sm'}>
      <Send aria-hidden size={16} strokeWidth={2} />
      {compact ? t(again ? 'reInviteShort' : 'inviteShort') : again ? t('reInvite') : t('newInvite')}
    </Button>
  );
  if (stage === 'idle') return button;
  // 확인은 아래에서 올라오는 창 — 좁은 2열 카드 안에서 글자가 찌그러지지 않게
  return (
    <>
      {button}
      <div className="fixed inset-0 z-30 flex items-end bg-text/40" role="dialog" aria-modal="true" aria-label={t('inviteFor', { name })}>
        <div className="mx-auto flex w-full max-w-md flex-col gap-4 rounded-t-card bg-bg p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <p className="text-lg font-bold">{t('inviteFor', { name })}</p>
          <p className="text-muted">{t('newInviteConfirm', { name })}</p>
          {err && <ErrorNote code={err.code} requestId={err.requestId} />}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => setStage('idle')}>
              {t('cancel')}
            </Button>
            <Button
              disabled={stage === 'busy'}
              onClick={async () => {
                setStage('busy');
                setErr(null);
                const r = await callApi<{ invite: Invite }>(`/api/admin/employees/${employeeId}/invite`);
                if (!r.ok) {
                  setStage('confirm');
                  return setErr(r);
                }
                setStage('idle');
                setInvite(r.data.invite);
              }}
            >
              {t('confirm')}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
