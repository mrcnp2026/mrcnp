'use client';
// 연장근로 → 보상휴가 (2026-10-19 의뢰인). 직원 · 달을 고르면 그 달 승인 연장 · 이미 돌린 시간 · 남은 시간을 보이고, 시간 · 배율을 넣어 돌린다.
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';

const field = 'min-h-11 w-full rounded-button border border-border bg-bg px-3 text-sm lg:min-h-9';
type Room = { approved: number; converted: number; left: number; finalized: boolean };
const hours = (m: number) => Math.round((m / 60) * 100) / 100;

export function CompCreate({ people, month: initialMonth, defaultRate, ready }: { people: { id: string; name: string }[]; month: string; defaultRate: number; ready: boolean }) {
  const t = useTranslations('admin.overtimeComp');
  const router = useRouter();
  const [employeeId, setEmployeeId] = useState('');
  const [month, setMonth] = useState(initialMonth);
  const [room, setRoom] = useState<Room | null>(null);
  const [h, setH] = useState('');
  const [rate, setRate] = useState(String(defaultRate));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);

  useEffect(() => {
    setRoom(null);
    if (!employeeId || !/^\d{4}-\d{2}$/.test(month)) return;
    let live = true;
    callApi<Room>('/api/admin/payroll/overtime-comp', { action: 'room', employeeId, month }).then((r) => live && r.ok && setRoom(r.data));
    return () => {
      live = false;
    };
  }, [employeeId, month]);

  const minutes = Math.round(Number(h) * 60);
  const valid = ready && !!room && !room.finalized && minutes > 0 && minutes % 15 === 0 && minutes <= room.left && Number(rate) >= 1 && Number(rate) <= 3;
  return (
    <form
      className="flex flex-col gap-3 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setErr(null);
        setDone(null);
        const r = await callApi('/api/admin/payroll/overtime-comp', { action: 'create', employeeId, month, minutes, rate: Number(rate), usableTo: String(f.get('usableTo') ?? '') || null, note: String(f.get('note') ?? '').trim() || null });
        setBusy(false);
        if (!r.ok) return setErr(r);
        setDone(t('done', { h: hours(minutes), leave: hours(Math.round(minutes * Number(rate))) }));
        setH('');
        router.refresh();
        setEmployeeId('');
      }}
    >
      {!ready && <p className="rounded-button bg-warn-tint p-2 text-warn">{t('dbPending')}</p>}
      <div className="grid gap-3 lg:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span>{t('employee')}</span>
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required className={field}>
            <option value="">{t('pick')}</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span>{t('month')}</span>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} required className={`num ${field}`} />
        </label>
      </div>
      {room && (
        <p className="num rounded-button bg-surface p-2" role="status">
          {t('room', { approved: hours(room.approved), converted: hours(room.converted), left: hours(room.left) })}
          {room.finalized && <span className="block text-warn">{t('finalized')}</span>}
        </p>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span>{t('hours')}</span>
          <input value={h} onChange={(e) => setH(e.target.value)} type="number" min={0.25} step={0.25} max={room ? hours(room.left) : undefined} required className={`num ${field}`} />
          <span className="text-xs text-faint">{t('hoursHint')}</span>
        </label>
        <label className="flex flex-col gap-1">
          <span>{t('rate')}</span>
          <input value={rate} onChange={(e) => setRate(e.target.value)} type="number" min={1} max={3} step={0.01} required className={`num ${field}`} />
          <span className="text-xs text-faint">{t('rateHint')}</span>
        </label>
      </div>
      {minutes > 0 && Number(rate) >= 1 && <p className="num font-semibold">{t('preview', { h: hours(minutes), leave: hours(Math.round(minutes * Number(rate))) })}</p>}
      <div className="grid gap-3 lg:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span>{t('usableTo')}</span>
          <input name="usableTo" type="date" className={`num ${field}`} />
          <span className="text-xs text-faint">{t('usableToHint')}</span>
        </label>
        <label className="flex flex-col gap-1">
          <span>{t('note')}</span>
          <input name="note" maxLength={300} className={field} />
        </label>
      </div>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.overtimeComp" />}
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={busy || !valid}>
          {t('submit')}
        </Button>
        {done && (
          <span role="status" className="text-ok">
            {done}
          </span>
        )}
      </div>
    </form>
  );
}

export function CompCancel({ id }: { id: string }) {
  const t = useTranslations('admin.overtimeComp');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="min-h-8 text-sm font-bold text-danger">
        {t('cancel')}
      </button>
    );
  return (
    <form
      className="flex w-full flex-col gap-2 rounded-button bg-surface p-3 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        const r = await callApi('/api/admin/payroll/overtime-comp', { action: 'cancel', id, reason });
        setBusy(false);
        if (!r.ok) return setErr(r);
        setOpen(false);
        router.refresh();
      }}
    >
      <p className="text-warn">{t('cancelWarn')}</p>
      <input value={reason} onChange={(e) => setReason(e.target.value)} required minLength={2} maxLength={200} placeholder={t('cancelReason')} aria-label={t('cancelReason')} className={field} />
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.overtimeComp" />}
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="danger" disabled={busy || reason.trim().length < 2}>
          {t('cancelYes')}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>
          {t('back')}
        </Button>
      </div>
    </form>
  );
}
