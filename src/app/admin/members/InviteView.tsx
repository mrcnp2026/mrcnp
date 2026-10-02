'use client';
// 초대 QR 보여 주기. 토큰 원문은 이 화면에만 있고 DB에는 지문(해시)만 남는다
import { Copy } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button, Card } from '@/components/ui';

export type Invite = { url: string; qrDataUrl: string; expiresAt: string };

export function InviteView({ name, invite, onClose }: { name: string; invite: Invite; onClose: () => void }) {
  const t = useTranslations('admin.members');
  const f = useFormatter();
  const [copied, setCopied] = useState(false);
  const localhost = new URL(invite.url).hostname === 'localhost';
  return (
    <Card className="flex flex-col items-center gap-3 border-primary">
      <h2 className="text-xl font-semibold">{t('inviteFor', { name })}</h2>
      {/* eslint-disable-next-line @next/next/no-img-element -- 서버가 만든 data: 주소라 이미지 최적화 대상이 아니다 */}
      <img src={invite.qrDataUrl} width={240} height={240} alt={t('inviteFor', { name })} className="rounded-card border border-border" />
      <p className="text-center text-sm text-muted">{t('inviteHelp', { name })}</p>
      <p className="num text-sm text-faint">
        {t('inviteValidUntil', { time: f.dateTime(new Date(invite.expiresAt), { dateStyle: 'medium', timeStyle: 'short' }) })}
      </p>
      {localhost && <p className="rounded-card bg-warn-tint p-3 text-sm text-warn">{t('localhostWarning')}</p>}
      <div className="flex w-full flex-col gap-2">
        <p className="text-sm text-muted">{t('inviteLink')}</p>
        <p className="break-all rounded-button bg-surface p-2 text-xs text-muted">{invite.url}</p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={async () => {
              await navigator.clipboard.writeText(invite.url);
              setCopied(true);
            }}
          >
            <Copy aria-hidden size={18} strokeWidth={1.75} />
            {copied ? t('copied') : t('copy')}
          </Button>
          <Button variant="outline" className="flex-1" onClick={onClose}>
            {t('close')}
          </Button>
        </div>
      </div>
    </Card>
  );
}
