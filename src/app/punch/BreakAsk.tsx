'use client';
// 퇴근한 뒤 「오늘 저녁 휴게를 쉬었나요?」 (2026-11-04 의뢰인: 지금 방식 + 퇴근할 때 직원에게 묻기). 퇴근 기록은 이미 남은 뒤에 뜬다.
// 「쉬었어요」는 아무것도 보내지 않는다(그대로 휴게를 뺀다). 「못 쉬고 일했어요」는 관리자에게 대기로 간다 — 승인 전까지 급여는 그대로.
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';

export function BreakAsk({ date, start, end, onClose }: { date: string; start: string; end: string; onClose: () => void }) {
  const t = useTranslations('home.breakAsk');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  if (sent) {
    return (
      <div role="status" className="flex items-center justify-between gap-3 rounded-button bg-surface p-3 text-sm">
        <span>{t('sent')}</span>
        <button type="button" onClick={onClose} className="min-h-11 px-2 font-semibold text-primary">{t('close')}</button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3 rounded-button bg-surface p-4">
      <p className="font-semibold">{t('question', { start, end })}</p>
      <p className="text-sm text-muted">{t('why')}</p>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>{t('rested')}</Button>
        <Button type="button" disabled={busy} onClick={async () => {
          setBusy(true);
          setErr(null);
          const r = await callApi('/api/punch/break-skip', { date });
          setBusy(false);
          if (!r.ok) return setErr(r);
          setSent(true);
        }}>{t('worked')}</Button>
      </div>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="home" />}
    </div>
  );
}
