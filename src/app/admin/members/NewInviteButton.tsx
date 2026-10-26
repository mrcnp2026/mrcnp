'use client';
// 초대 링크 보내기 — 이전 링크가 무효가 되므로 무엇이 바뀌는지 한 줄 보여 주고 한 번 더 확인 (마스터 5장 규칙 5)
import { Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';
import { InviteView, type Invite } from './InviteView';

export function NewInviteButton({ employeeId, name, compact = false, again = false, icon = false }: { employeeId: string; name: string; compact?: boolean; again?: boolean; icon?: boolean }) {
  const t = useTranslations('admin.members');
  const [stage, setStage] = useState<'idle' | 'confirm' | 'busy'>('idle');
  const [invite, setInvite] = useState<Invite | null>(null);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);

  if (invite) {
    return (
      <div className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-text/40 p-4 text-left">
        <div className="w-full max-w-md">
          <InviteView employeeId={employeeId} name={name} invite={invite} onClose={() => setInvite(null)} />
        </div>
      </div>
    );
  }
  // 카드 안의 작은 버튼. 이미 가입한 사람은 "비밀번호를 잊었을 때" 다시 보내는 것이라 글자를 바꾼다
  const button = (
    icon ? (
      // 폰 목록 줄: 아이콘만(이름 · 상태 글자가 잘리지 않게, 2026-10-16 디자인)
      <button type="button" onClick={() => setStage('confirm')} aria-label={`${name} — ${t(again ? 'reInviteShort' : 'inviteShort')}`} title={t(again ? 'reInviteShort' : 'inviteShort')} className="flex size-11 shrink-0 items-center justify-center rounded-button bg-primary-tint text-primary">
        <Send aria-hidden size={18} strokeWidth={2} />
      </button>
    ) : (
    compact ? (
      // 표 줄마다 놓이는 단추는 글자 링크로 — 색칠한 단추가 26줄 반복되던 것 (2026-10-19 디자인: 표 전반의 톤)
      <button type="button" onClick={() => setStage('confirm')} className="inline-flex min-h-9 items-center gap-1 text-sm font-bold whitespace-nowrap text-primary hover:underline">
        <Send aria-hidden size={14} strokeWidth={2} />
        {t(again ? 'reInviteShort' : 'inviteShort')}
      </button>
    ) : (
    <Button variant="outline" onClick={() => setStage('confirm')} className="shrink-0 text-sm">
      <Send aria-hidden size={16} strokeWidth={2} />
      {again ? t('reInvite') : t('newInvite')}
    </Button>
    )
    )
  );
  if (stage === 'idle') return button;
  // 확인은 아래에서 올라오는 창 — 좁은 2열 카드 안에서 글자가 찌그러지지 않게
  return (
    <>
      {button}
      <div className="fade-from fixed inset-0 z-30 flex items-end bg-text/40 text-left" role="dialog" aria-modal="true" aria-label={t('inviteFor', { name })}>
        <div className="sheet-up mx-auto flex w-full max-w-md flex-col gap-4 rounded-t-card bg-bg p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
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
