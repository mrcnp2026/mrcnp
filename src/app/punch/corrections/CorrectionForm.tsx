'use client';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button, Card } from '@/components/ui';

type Type = 'add_missing' | 'modify' | 'void';
const field = 'min-h-11 w-full rounded-button border border-border bg-bg px-3 text-base text-text';

export function CorrectionForm(props: {
  today: string;
  initialDate: string | null;
  initialKind: 'in' | 'out' | null;
  events: { id: string; label: string }[];
}) {
  const t = useTranslations('corrections');
  const router = useRouter();
  const [type, setType] = useState<Type>('add_missing');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);

  return (
    <Card>
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          setBusy(true);
          setErr(null);
          const r = await callApi('/api/corrections', {
            type,
            workDate: fd.get('workDate'),
            kind: fd.get('kind'),
            targetId: fd.get('targetId'),
            time: fd.get('time'),
            nextDay: fd.get('nextDay') === 'on',
            reason: fd.get('reason'),
          });
          setBusy(false);
          if (!r.ok) return setErr(r);
          setSent(true);
          e.currentTarget?.reset();
          router.refresh();
        }}
      >
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm text-muted">{t('typeLabel')}</legend>
          {(['add_missing', 'modify', 'void'] as const).map((k) => (
            <label key={k} className="flex min-h-11 items-center gap-2">
              <input type="radio" name="type" checked={type === k} onChange={() => setType(k)} className="size-5" />
              <span>{t(`type.${k}`)}</span>
            </label>
          ))}
        </fieldset>

        {type === 'add_missing' ? (
          <>
            <label className="flex flex-col gap-1 text-sm text-muted">
              {t('date')}
              <input name="workDate" type="date" required max={props.today} defaultValue={props.initialDate ?? ''} className={`num ${field}`} />
            </label>
            <label className="flex flex-col gap-1 text-sm text-muted">
              {t('which')}
              <select name="kind" defaultValue={props.initialKind ?? 'out'} className={field}>
                <option value="in">{t('kind.in')}</option>
                <option value="out">{t('kind.out')}</option>
              </select>
            </label>
          </>
        ) : (
          <label className="flex flex-col gap-1 text-sm text-muted">
            {t('record')}
            <select name="targetId" required className={field}>
              {props.events.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {type !== 'void' && (
          <>
            <label className="flex flex-col gap-1 text-sm text-muted">
              {t('time')}
              <input name="time" type="time" required className={`num ${field}`} />
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input name="nextDay" type="checkbox" className="size-5" />
              {t('nextDay')}
            </label>
          </>
        )}

        <label className="flex flex-col gap-1 text-sm text-muted">
          {t('reason')}
          <textarea name="reason" required maxLength={200} rows={2} className="w-full rounded-button border border-border bg-bg p-3 text-base text-text" />
          <span className="text-xs text-faint">{t('reasonHint')}</span>
        </label>

        {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="corrections" />}
        {sent && <p className="text-sm font-semibold text-ok">{t('sent')}</p>}
        <Button type="submit" disabled={busy} className="w-full">
          {t('submit')}
        </Button>
      </form>
    </Card>
  );
}
