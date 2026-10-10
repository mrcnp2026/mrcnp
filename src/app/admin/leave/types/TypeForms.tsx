'use client';
// 휴가 종류 양식 (2026-10-10) — 만들기·고치기 / 끄기·켜기. 기본 종류(연차·반차 등)는 이름과 시간을 바꿀 수 없다.
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CLOSE_SHEET_EVENT } from '@/components/AddSheet';
import { callApi } from '@/components/client-api';
import { DateTimeInput } from '@/components/DateTimeInput';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';
import { unitOfHours } from '@/lib/leave';

const field = 'min-h-11 w-full rounded-button border border-border bg-bg px-3 text-base text-text disabled:text-muted';
type Err = { code: string; requestId?: string } | null;
export type TypeValues = { code: string; name: string; hours: number; startTime: string | null; endTime: string | null; groupName: string | null; isPaid: boolean; deductsBalance: boolean; builtin: boolean };
const HOURS = [...Array(16)].map((_, i) => (i + 1) / 2); // 0.5 ~ 8

export function LeaveTypeForm({ initial, sheet, groups }: { initial?: TypeValues; sheet?: string; groups: string[] }) {
  const t = useTranslations('admin.leaveTypes');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<Err>(null);
  const [hours, setHours] = useState(initial?.hours ?? 4);
  const [fixed, setFixed] = useState(!!initial?.startTime);
  const [start, setStart] = useState(initial?.startTime ?? '08:00');
  const [end, setEnd] = useState(initial?.endTime ?? '12:00');
  const [paid, setPaid] = useState(initial?.isPaid ?? true);
  const [deducts, setDeducts] = useState(initial?.deductsBalance ?? true);
  const check = 'flex min-h-11 items-center gap-3 text-base text-text';
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        setBusy(true);
        setErr(null);
        setSaved(false);
        const res = await callApi<{ code?: string }>(initial ? `/api/admin/leave/types/${initial.code}` : '/api/admin/leave/types', {
          name: initial?.builtin ? initial.name : fd.get('name'),
          hours,
          startTime: fixed ? start : null,
          endTime: fixed ? end : null,
          groupName: fd.get('groupName'),
          isPaid: paid,
          deductsBalance: deducts,
        });
        setBusy(false);
        if (!res.ok) return setErr(res);
        if (sheet) window.dispatchEvent(new CustomEvent(CLOSE_SHEET_EVENT, { detail: sheet }));
        if (!initial) form.reset();
        else setSaved(true);
        router.refresh();
      }}
    >
      <label className="flex flex-col gap-1 text-sm text-muted">
        {t('name')}
        <input name="name" required maxLength={40} defaultValue={initial?.name} disabled={initial?.builtin} placeholder={t('namePlaceholder')} className={field} autoComplete="off" />
      </label>
      <label className="flex flex-col gap-1 text-sm text-muted">
        {t('hours')}
        <select value={hours} onChange={(e) => setHours(Number(e.target.value))} disabled={initial?.builtin} className={`num ${field}`}>
          {HOURS.map((h) => (
            <option key={h} value={h}>
              {t('hoursOption', { h, d: unitOfHours(h) })}
            </option>
          ))}
        </select>
      </label>
      {initial?.builtin && <p className="text-sm text-faint">{t('builtinNote')}</p>}
      <label className={check}>
        <input type="checkbox" checked={fixed} onChange={(e) => setFixed(e.target.checked)} className="size-5 shrink-0 accent-primary" />
        {t('fixedTime')}
      </label>
      {fixed ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-sm text-muted">
            {t('start')}
            <DateTimeInput type="time" value={start} onChange={setStart} required className={`num ${field}`} />
          </label>
          <label className="flex flex-col gap-1 text-sm text-muted">
            {t('end')}
            <DateTimeInput type="time" value={end} onChange={setEnd} required className={`num ${field}`} />
          </label>
        </div>
      ) : (
        <p className="text-sm text-faint">{t(hours < 8 ? 'freeTimeNote' : 'fullDayNote')}</p>
      )}
      <label className="flex flex-col gap-1 text-sm text-muted">
        {t('group')}
        <input name="groupName" maxLength={40} defaultValue={initial?.groupName ?? ''} list="leave-type-groups" placeholder={t('groupPlaceholder')} className={field} autoComplete="off" />
        <datalist id="leave-type-groups">
          {groups.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
      </label>
      <label className={check}>
        <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} className="size-5 shrink-0 accent-primary" />
        {t('paid')}
      </label>
      <label className={check}>
        <input type="checkbox" checked={deducts} onChange={(e) => setDeducts(e.target.checked)} className="size-5 shrink-0 accent-primary" />
        {t('deducts', { d: unitOfHours(hours) })}
      </label>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.leaveTypes" />}
      {saved && <p className="text-sm font-semibold text-ok">{t('saved')}</p>}
      <Button type="submit" disabled={busy}>
        {t(initial ? 'save' : 'create')}
      </Button>
    </form>
  );
}

/** 끄기·켜기 — 끄면 새 신청에서만 빠진다 */
export function LeaveTypeToggle({ code, active }: { code: string; active: boolean }) {
  const t = useTranslations('admin.leaveTypes');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Err>(null);
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="outline"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          const r = await callApi(`/api/admin/leave/types/${code}`, { active: !active });
          setBusy(false);
          if (!r.ok) return setErr(r);
          router.refresh();
        }}
      >
        {t(active ? 'turnOff' : 'turnOn')}
      </Button>
      <p className="px-1 text-sm text-faint">{t(active ? 'turnOffHint' : 'turnOnHint')}</p>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.leaveTypes" />}
    </div>
  );
}
