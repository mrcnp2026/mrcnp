'use client';
// 외근·출장·재택 신청 (②-3 7-11). 장소 필수, 사유 선택, 사후 신청 가능. 직원 언어로 (요점 5).
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DateTimeInput } from '@/components/DateTimeInput';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button, Card } from '@/components/ui';

const field = 'min-h-11 w-full rounded-button border border-border bg-bg px-3 text-base text-text';
const KINDS = ['outside', 'business_trip', 'remote'] as const;

export function WorkForm({ today, initialDate }: { today: string; initialDate: string | null }) {
  const t = useTranslations('work');
  const router = useRouter();
  const [kind, setKind] = useState<(typeof KINDS)[number]>('outside');
  const [hours, setHours] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);

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
          setSent(false);
          const r = await callApi('/api/work', {
            kind,
            startDate: fd.get('startDate'),
            endDate: hours ? fd.get('startDate') : fd.get('endDate'),
            startTime: hours ? fd.get('startTime') : null,
            endTime: hours ? fd.get('endTime') : null,
            place: fd.get('place'),
            reason: fd.get('reason'),
          });
          setBusy(false);
          if (!r.ok) return setErr(r);
          setSent(true);
          form.reset();
          router.refresh();
        }}
      >
        <fieldset className="flex gap-2">
          <legend className="mb-1 text-sm text-muted">{t('kindLabel')}</legend>
          {KINDS.map((k) => (
            <label key={k} className={`flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-button border px-2 text-sm font-semibold ${kind === k ? 'border-primary bg-primary-tint text-primary' : 'border-border text-muted'}`}>
              <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
              {t(`kind.${k}`)}
            </label>
          ))}
        </fieldset>
        <div className={`grid gap-3 ${hours ? '' : 'grid-cols-2'}`}>
          <label className="flex flex-col gap-1 text-sm text-muted">
            {hours ? t('date') : t('start')}
            <DateTimeInput name="startDate" type="date" required defaultValue={initialDate ?? today} className={`num ${field}`} />
          </label>
          {!hours && (
            <label className="flex flex-col gap-1 text-sm text-muted">
              {t('end')}
              <DateTimeInput name="endDate" type="date" required defaultValue={initialDate ?? today} className={`num ${field}`} />
            </label>
          )}
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={hours} onChange={(e) => setHours(e.target.checked)} className="size-5" />
          {t('halfDay')}
        </label>
        {hours && (
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm text-muted">
              {t('from')}
              <DateTimeInput name="startTime" type="time" required className={`num ${field}`} />
            </label>
            <label className="flex flex-col gap-1 text-sm text-muted">
              {t('until')}
              <DateTimeInput name="endTime" type="time" required className={`num ${field}`} />
            </label>
          </div>
        )}
        <label className="flex flex-col gap-1 text-sm text-muted">
          {t('place')}
          <input name="place" required maxLength={100} placeholder={t('placeHint')} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          {t('reason')}
          <textarea name="reason" maxLength={200} rows={2} className="w-full rounded-button border border-border bg-bg p-3 text-base text-text" />
        </label>
        {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="work" />}
        {sent && <p className="text-sm font-semibold text-ok">{t('sent')}</p>}
        <Button type="submit" disabled={busy} className="w-full">
          {t('submit')}
        </Button>
      </form>
    </Card>
  );
}

export function CancelWork({ id }: { id: string }) {
  const t = useTranslations('work');
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
            const r = await callApi(`/api/work/${id}/cancel`);
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
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="work" />}
    </div>
  );
}
