'use client';
// 급여명세서 메일 보내기 단추 (2026-10-19 의뢰인). 여러 명이면 한 번 더 묻고, 5장씩 나눠 보내며 진행을 보인다(서버 시간 제한).
// 한 사람 줄의 단추(one)는 묻지 않고 바로 보낸다. 끝나면 화면을 새로 읽어 발송 여부를 갱신한다.
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';

type Item = { employeeId: string; slipId: string };
type Res = { sent: number; failed: number; noEmail: number; noBirth: number; skipped: number };
const CHUNK = 5;

export function SlipMailSend({ items, label, ready, one = false }: { items: Item[]; label: string; ready: boolean; one?: boolean }) {
  const t = useTranslations('admin.slipMail');
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  const [done, setDone] = useState(0);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Res | null>(null);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);

  const run = async () => {
    setAsk(false);
    setBusy(true);
    setErr(null);
    setRes(null);
    setDone(0);
    const sum: Res = { sent: 0, failed: 0, noEmail: 0, noBirth: 0, skipped: 0 };
    for (let i = 0; i < items.length; i += CHUNK) {
      const r = await callApi<Res>('/api/admin/payroll/slips/mail', { items: items.slice(i, i + CHUNK) });
      if (!r.ok) {
        setErr(r);
        break;
      }
      for (const k of ['sent', 'failed', 'noEmail', 'noBirth', 'skipped'] as const) sum[k] += r.data[k];
      setDone(Math.min(items.length, i + CHUNK));
    }
    setBusy(false);
    setRes(sum);
    router.refresh();
  };

  const disabled = !ready || busy || items.length === 0;
  return (
    <span className="flex flex-col gap-2 text-sm">
      {one ? (
        <button type="button" disabled={disabled} onClick={run} className="inline-flex h-8 items-center self-start rounded-button border border-border bg-bg px-3 text-sm font-bold text-primary disabled:opacity-50" data-slip-mail-one>
          {busy ? t('sending', { done, all: items.length }) : label}
        </button>
      ) : (
        <span className="flex flex-wrap items-center gap-3">
          <Button type="button" size="sm" disabled={disabled} onClick={() => setAsk(true)} data-slip-mail>
            {busy ? t('sending', { done, all: items.length }) : label}
          </Button>
        </span>
      )}
      {ask && (
        <span className="flex flex-col gap-2 rounded-button bg-surface p-3">
          <span>{t('confirm', { n: items.length })}</span>
          <span className="flex gap-2">
            <Button type="button" size="sm" onClick={run}>
              {t('confirmYes')}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setAsk(false)}>
              {t('cancel')}
            </Button>
          </span>
        </span>
      )}
      {res && !one && (
        <span role="status" className={res.failed + res.noEmail + res.noBirth > 0 ? 'text-warn' : 'text-ok'}>
          {t('result', res)}
        </span>
      )}
      {res && one && res.sent === 0 && <span role="status" className="text-warn">{t(res.noEmail ? 'oneNoEmail' : res.noBirth ? 'oneNoBirth' : res.failed ? 'oneFailed' : 'oneSkipped')}</span>}
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.slipMail" />}
    </span>
  );
}
