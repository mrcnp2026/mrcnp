'use client';
// 휴가 신청 양식. 일수는 서버가 근무일만 세어 정한다 — 화면은 보내기만 한다.
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DateTimeInput } from '@/components/DateTimeInput';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button, Card } from '@/components/ui';

const field = 'min-h-11 w-full rounded-button border border-border bg-bg px-3 text-base text-text';

export function LeaveForm({ today, types }: { today: string; types: { code: string; name: string; unit: number; deducts: boolean }[] }) {
  const t = useTranslations('leave');
  const router = useRouter();
  const [code, setCode] = useState(types[0]?.code ?? 'annual');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<number | null>(null);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  const oneDay = (types.find((x) => x.code === code)?.unit ?? 1) < 1;

  return (
    <Card>
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const fd = new FormData(form);
          setBusy(true);
          setErr(null);
          setSent(null);
          const r = await callApi<{ days: number }>('/api/leave', {
            typeCode: code,
            startDate: fd.get('startDate'),
            endDate: oneDay ? fd.get('startDate') : fd.get('endDate'),
            reason: fd.get('reason'),
          });
          setBusy(false);
          if (!r.ok) return setErr(r);
          setSent(r.data.days);
          form.reset();
          router.refresh();
        }}
      >
        <h2 className="font-semibold">{t('request')}</h2>
        <label className="flex flex-col gap-1 text-sm text-muted">
          {t('typeLabel')}
          <select value={code} onChange={(e) => setCode(e.target.value)} className={field}>
            {types.map((x) => (
              <option key={x.code} value={x.code}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <div className={`grid gap-3 ${oneDay ? '' : 'grid-cols-2'}`}>
          <label className="flex flex-col gap-1 text-sm text-muted">
            {oneDay ? t('date') : t('start')}
            <DateTimeInput name="startDate" type="date" required defaultValue={today} className={`num ${field}`} />
          </label>
          {!oneDay && (
            <label className="flex flex-col gap-1 text-sm text-muted">
              {t('end')}
              <DateTimeInput name="endDate" type="date" required defaultValue={today} className={`num ${field}`} />
            </label>
          )}
        </div>
        <p className="text-xs text-faint">{t('workdaysOnly')}</p>
        <label className="flex flex-col gap-1 text-sm text-muted">
          {t('reason')}
          <textarea name="reason" maxLength={200} rows={2} className="w-full rounded-button border border-border bg-bg p-3 text-base text-text" />
          <span className="text-xs text-faint">{t('reasonHint')}</span>
        </label>
        {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="leave" />}
        {sent !== null && <p className="text-sm font-semibold text-ok">{t('sent', { n: sent })}</p>}
        <Button type="submit" disabled={busy} className="w-full">
          {t('submit')}
        </Button>
      </form>
    </Card>
  );
}

export function CancelLeave({ id }: { id: string }) {
  const t = useTranslations('leave');
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  if (!ask)
    return (
      <Button variant="outline" className="mt-1 self-start" onClick={() => setAsk(true)}>
        {t('cancel')}
      </Button>
    );
  return (
    <div className="flex flex-col gap-2 rounded-card border border-border p-3">
      <p className="text-sm">{t('cancelConfirm')}</p>
      <div className="flex gap-2">
        <Button
          disabled={busy}
          className="flex-1"
          onClick={async () => {
            setBusy(true);
            const r = await callApi(`/api/leave/${id}/cancel`);
            setBusy(false);
            if (!r.ok) return setErr(r);
            router.refresh();
          }}
        >
          {t('cancelYes')}
        </Button>
        <Button variant="outline" className="flex-1" onClick={() => setAsk(false)}>
          {t('back')}
        </Button>
      </div>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="leave" />}
    </div>
  );
}
