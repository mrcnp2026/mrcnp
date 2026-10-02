'use client';
// 초대 보내기 (2026-10-02 의뢰인: "직원 폰으로 보내는 건 링크다. QR을 받아서는 스캔할 수 없다").
// 순서: ① 링크 보내기(문자·카톡 공유 창) ② 링크 복사 ③ 등록 코드(주소창 입력용) ④ QR — 직접 만나서 등록할 때만, 접어 둔다.
// 토큰(=코드) 원문은 이 화면에만 있고 DB에는 지문(해시)만 남는다.
import { ChevronDown, Copy, QrCode, Send } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button, Card } from '@/components/ui';

export type Invite = { url: string; code: string; qrDataUrl: string; expiresAt: string };

export function InviteView({ name, invite, onClose }: { name: string; invite: Invite; onClose: () => void }) {
  const t = useTranslations('admin.members');
  const f = useFormatter();
  const [copied, setCopied] = useState(false);
  const localhost = new URL(invite.url).hostname === 'localhost';
  const text = t('shareText', { name, code: invite.code, url: invite.url });

  return (
    <Card className="flex flex-col gap-3 border-primary">
      <h2 className="text-xl font-semibold">{t('inviteFor', { name })}</h2>
      <p className="num text-sm text-faint">
        {t('inviteValidUntil', { time: f.dateTime(new Date(invite.expiresAt), { dateStyle: 'medium', timeStyle: 'short' }) })}
      </p>
      {localhost && <p className="rounded-card bg-warn-tint p-3 text-sm text-warn">{t('localhostWarning')}</p>}

      <Button
        className="min-h-14 w-full"
        onClick={async () => {
          // 관리자 폰의 공유 창(문자·카카오톡 등)으로 바로 보낸다. 공유 창이 없는 PC는 복사로
          if (navigator.share) {
            try {
              await navigator.share({ text });
            } catch {
              // 공유 창을 닫은 경우
            }
            return;
          }
          await navigator.clipboard.writeText(text);
          setCopied(true);
        }}
      >
        <Send aria-hidden size={20} strokeWidth={1.75} />
        {t('send')}
      </Button>
      <Button
        variant="outline"
        className="w-full"
        onClick={async () => {
          await navigator.clipboard.writeText(text);
          setCopied(true);
        }}
      >
        <Copy aria-hidden size={18} strokeWidth={1.75} />
        {copied ? t('copied') : t('copy')}
      </Button>
      <p className="break-all rounded-button bg-surface p-2 text-xs text-muted">{invite.url}</p>

      <ol className="flex flex-col gap-2 rounded-card bg-surface p-3 text-sm">
        {(['step1', 'step2', 'step3'] as const).map((k, i) => (
          <li key={k} className="flex items-start gap-3">
            <span className="num flex size-6 shrink-0 items-center justify-center rounded-chip bg-primary text-xs font-semibold text-on-primary">{i + 1}</span>
            <span className="pt-0.5">{t(k)}</span>
          </li>
        ))}
      </ol>

      <div className="flex flex-col items-center gap-1 rounded-card border border-border p-3">
        <p className="text-xs text-muted">{t('codeLabel')}</p>
        <p className="num text-3xl font-bold tracking-widest text-primary-deep">{invite.code}</p>
        <p className="text-center text-xs text-muted">{t('codeHelp', { origin: new URL(invite.url).host })}</p>
      </div>

      <details className="rounded-card border border-border px-3">
        <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 text-sm text-muted">
          <span className="flex items-center gap-2">
            <QrCode aria-hidden size={18} strokeWidth={1.75} />
            {t('qrInPerson')}
          </span>
          <ChevronDown aria-hidden size={18} strokeWidth={1.75} />
        </summary>
        <div className="flex flex-col items-center gap-2 pb-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- 서버가 만든 data: 주소라 이미지 최적화 대상이 아니다 */}
          <img src={invite.qrDataUrl} width={220} height={220} alt={t('inviteFor', { name })} className="rounded-card border border-border" />
          <p className="text-center text-xs text-muted">{t('inviteHelp', { name })}</p>
        </div>
      </details>

      <Button variant="outline" className="w-full" onClick={onClose}>
        {t('close')}
      </Button>
    </Card>
  );
}
