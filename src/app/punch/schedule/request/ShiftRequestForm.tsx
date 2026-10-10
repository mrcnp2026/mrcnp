'use client';
// 근무일정 생성 요청 양식 (2026-10-11) — 템플릿을 고르면 시각·유형이 채워진다. 사유는 필수. + 대기 중인 내 요청 취소 버튼.
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { DateTimeInput } from '@/components/DateTimeInput';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';

const field = 'min-h-11 w-full rounded-button border border-border bg-bg px-3 text-base text-text';
const KINDS = ['none', 'normal', 'outside', 'remote', 'holiday', 'extra'] as const;
type Kind = (typeof KINDS)[number];

export function ShiftRequestForm({ today, templates }: { today: string; templates: { id: string; name: string; startTime: string; endTime: string; kind: string }[] }) {
  const t = useTranslations('scheduleRequest');
  const tk = useTranslations('requests.shiftKind');
  const router = useRouter();
  const [date, setDate] = useState(today);
  const [tpl, setTpl] = useState('');
  const [start, setStart] = useState('08:00');
  const [end, setEnd] = useState('17:00');
  const [kind, setKind] = useState<Kind>('none');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        const r = await callApi('/api/schedule-requests', { date, startTime: start, endTime: end, kind, reason });
        setBusy(false);
        if (!r.ok) return setErr(r);
        router.push('/punch/requests');
        router.refresh();
      }}
    >
      <label className="flex flex-col gap-1 text-sm text-muted">
        {t('date')}
        <DateTimeInput type="date" value={date} onChange={setDate} required className={`num ${field}`} />
      </label>
      {templates.length > 0 && (
        <label className="flex flex-col gap-1 text-sm text-muted">
          {t('template')}
          <select
            value={tpl}
            onChange={(e) => {
              setTpl(e.target.value);
              const x = templates.find((v) => v.id === e.target.value);
              if (x) {
                setStart(x.startTime);
                setEnd(x.endTime);
                setKind((KINDS as readonly string[]).includes(x.kind) ? (x.kind as Kind) : 'none');
              }
            }}
            className={field}
          >
            <option value="">{t('templateNone')}</option>
            {templates.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name} ({x.startTime} - {x.endTime})
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label className="flex min-w-0 flex-col gap-1 text-sm text-muted">
          {t('start')}
          <DateTimeInput type="time" value={start} onChange={setStart} required className={`num ${field}`} />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-sm text-muted">
          {t('end')}
          <DateTimeInput type="time" value={end} onChange={setEnd} required className={`num ${field}`} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm text-muted">
        {t('kind')}
        <select value={kind} onChange={(e) => setKind(e.target.value as Kind)} className={field}>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {k === 'none' ? t('kindNone') : tk(k)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm text-muted">
        {t('reason')}
        <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} required className={field} autoComplete="off" />
      </label>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="scheduleRequest" />}
      <Button type="submit" disabled={busy || reason.trim().length < 1}>
        {t('send')}
      </Button>
    </form>
  );
}

export function CancelShiftRequest({ id }: { id: string }) {
  const t = useTranslations('scheduleRequest');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await callApi(`/api/schedule-requests/${id}`, { cancel: true });
        setBusy(false);
        router.refresh();
      }}
      className="min-h-11 shrink-0 rounded-button border border-border bg-bg px-3 text-sm font-bold text-muted disabled:opacity-60"
    >
      {t('cancel')}
    </button>
  );
}
