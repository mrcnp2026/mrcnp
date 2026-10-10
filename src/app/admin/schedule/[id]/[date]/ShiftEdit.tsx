'use client';
// 근무일정 한 건 수정 (2026-10-11) — 날짜별로 넣은 일정이면 그 일정을 고치고, 평소 일정(템플릿·회사 규칙)이면 「이 날만 다르게」 날짜별 일정을 새로 넣는다.
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { DateTimeInput } from '@/components/DateTimeInput';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';
import { SHIFT_KINDS, type ShiftKind } from '@/lib/shifts';

const field = 'min-h-11 w-full rounded-button border border-border bg-bg px-3 text-base text-text';

export function ShiftEdit({ shiftId, employeeId, date, init }: { shiftId: string | null; employeeId: string; date: string; init: { startTime: string; endTime: string; kind: ShiftKind; note: string } }) {
  const t = useTranslations('admin.scheduleDetail');
  const tk = useTranslations('admin.shifts.kinds');
  const router = useRouter();
  const [start, setStart] = useState(init.startTime);
  const [end, setEnd] = useState(init.endTime);
  const [kind, setKind] = useState<ShiftKind>(init.kind);
  const [note, setNote] = useState(init.note);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        const r = shiftId
          ? await callApi(`/api/admin/schedule/${shiftId}`, { startTime: start, endTime: end, kind, note })
          : await callApi('/api/admin/schedule', { date, startTime: start, endTime: end, kind, templateId: null, note, employeeIds: [employeeId] });
        setBusy(false);
        if (!r.ok) return setErr(r);
        router.push(`/admin/schedule/${employeeId}/${date}`);
        router.refresh();
      }}
    >
      {!shiftId && <p className="rounded-button bg-primary-tint p-3 text-sm text-primary">{t('onlyThisDay')}</p>}
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
        <select value={kind} onChange={(e) => setKind(e.target.value as ShiftKind)} className={field}>
          {SHIFT_KINDS.map((k) => (
            <option key={k} value={k}>
              {tk(k)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm text-muted">
        {t('note')}
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className={field} autoComplete="off" />
      </label>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.schedule" />}
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="flex-1" onClick={() => router.push(`/admin/schedule/${employeeId}/${date}`)}>
          {t('cancelEdit')}
        </Button>
        <Button type="submit" className="flex-1" disabled={busy}>
          {t('save')}
        </Button>
      </div>
    </form>
  );
}
