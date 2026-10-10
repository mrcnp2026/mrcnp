'use client';
// 근무일정 틀 양식 (2026-10-10) — 만들기·고치기 / 적용할 직원 고르기 / 끄기·켜기.
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CLOSE_SHEET_EVENT } from '@/components/AddSheet';
import { callApi } from '@/components/client-api';
import { DateTimeInput } from '@/components/DateTimeInput';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';
import { SHIFT_COLOR_CLASS, SHIFT_COLORS, SHIFT_KINDS, type ShiftColor, type ShiftKind } from '@/lib/shifts';

const field = 'min-h-11 w-full rounded-button border border-border bg-bg px-3 text-base text-text';
type Err = { code: string; requestId?: string } | null;
export type ShiftValues = { id: string; name: string; startTime: string; endTime: string; kind: ShiftKind; color: ShiftColor; memo: string };

export function ShiftForm({ initial, sheet }: { initial?: ShiftValues; sheet: string }) {
  const t = useTranslations('admin.shifts');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Err>(null);
  const [color, setColor] = useState<ShiftColor>(initial?.color ?? 'primary');
  const [kind, setKind] = useState<ShiftKind>(initial?.kind ?? 'none');
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        setBusy(true);
        setErr(null);
        const res = await callApi<{ id?: string }>(initial ? `/api/admin/shifts/${initial.id}` : '/api/admin/shifts', { name: fd.get('name'), startTime: fd.get('startTime'), endTime: fd.get('endTime'), kind, color, memo: fd.get('memo') });
        setBusy(false);
        if (!res.ok) return setErr(res);
        window.dispatchEvent(new CustomEvent(CLOSE_SHEET_EVENT, { detail: sheet }));
        if (!initial && res.data.id) {
          form.reset();
          router.push(`/admin/shifts/${res.data.id}`);
        }
        router.refresh();
      }}
    >
      <label className="flex flex-col gap-1 text-sm text-muted">
        {t('name')}
        <input name="name" required maxLength={40} defaultValue={initial?.name} placeholder={t('namePlaceholder')} className={field} autoComplete="off" />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-sm text-muted">
          {t('start')}
          <DateTimeInput name="startTime" type="time" required defaultValue={initial?.startTime ?? '08:00'} className={`num ${field}`} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          {t('end')}
          <DateTimeInput name="endTime" type="time" required defaultValue={initial?.endTime ?? '17:00'} className={`num ${field}`} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm text-muted">
        {t('kind')}
        <select value={kind} onChange={(e) => setKind(e.target.value as ShiftKind)} className={field}>
          {SHIFT_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`kinds.${k}`)}
            </option>
          ))}
        </select>
      </label>
      {kind === 'deemed' && <p className="rounded-button bg-primary-tint p-3 text-sm text-primary">{t('deemedNote')}</p>}
      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm text-muted">{t('color')}</legend>
        <div className="flex flex-wrap gap-1">
          {SHIFT_COLORS.map((c) => (
            <label key={c} className={`flex size-11 cursor-pointer items-center justify-center rounded-button border-2 ${color === c ? 'border-text' : 'border-transparent'}`}>
              <input type="radio" name="color" value={c} checked={color === c} onChange={() => setColor(c)} aria-label={t(`colors.${c}`)} className="sr-only" />
              <span aria-hidden className={`size-7 rounded-button ${SHIFT_COLOR_CLASS[c]}`} />
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex flex-col gap-1 text-sm text-muted">
        {t('memo')}
        <input name="memo" maxLength={200} defaultValue={initial?.memo} className={field} autoComplete="off" />
      </label>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.shifts" />}
      <Button type="submit" disabled={busy}>
        {t('save')}
      </Button>
    </form>
  );
}

/** 이 틀을 적용할 직원 고르기 — 다른 틀을 쓰는 사람은 그 틀 이름이 옆에 보인다 (고르면 이 틀로 옮겨진다) */
export function ShiftAssignForm({ id, people }: { id: string; people: { id: string; name: string; group: string | null; other: string | null; on: boolean }[] }) {
  const t = useTranslations('admin.shifts');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Err>(null);
  const [saved, setSaved] = useState(false);
  const [picked, setPicked] = useState(() => new Set(people.filter((p) => p.on).map((p) => p.id)));
  const toggle = (pid: string) => {
    setSaved(false);
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(pid)) n.delete(pid);
      else n.add(pid);
      return n;
    });
  };
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        const res = await callApi(`/api/admin/shifts/${id}`, { employeeIds: [...picked] });
        setBusy(false);
        if (!res.ok) return setErr(res);
        setSaved(true);
        router.refresh();
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="num text-sm text-muted">{t('pickedCount', { n: picked.size })}</p>
        <div className="flex gap-1">
          <button type="button" onClick={() => (setSaved(false), setPicked(new Set(people.map((p) => p.id))))} className="min-h-11 px-2 text-sm font-medium text-primary">
            {t('pickAll')}
          </button>
          <button type="button" onClick={() => (setSaved(false), setPicked(new Set()))} className="min-h-11 px-2 text-sm font-medium text-muted">
            {t('pickNone')}
          </button>
        </div>
      </div>
      {people.length === 0 && <p className="text-sm text-faint">{t('noPeople')}</p>}
      <ul className="flex flex-col divide-y divide-border">
        {people.map((p) => (
          <li key={p.id}>
            <label className="flex min-h-12 items-center gap-3 py-1">
              <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} className="size-5 shrink-0 accent-primary" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-medium">{p.name}</span>
                {p.group && <span className="truncate text-sm text-muted">{p.group}</span>}
              </span>
              {p.other && <span className="shrink-0 text-sm text-faint">{t('usingOther', { name: p.other })}</span>}
            </label>
          </li>
        ))}
      </ul>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.shifts" />}
      {saved && <p className="rounded-button bg-ok-tint p-3 text-sm text-ok">{t('assignSaved')}</p>}
      <Button type="submit" disabled={busy}>
        {t('assignSave')}
      </Button>
    </form>
  );
}

export function ShiftToggle({ id, active }: { id: string; active: boolean }) {
  const t = useTranslations('admin.shifts');
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Err>(null);
  const run = async () => {
    setBusy(true);
    setErr(null);
    const res = await callApi(`/api/admin/shifts/${id}`, { active: !active });
    setBusy(false);
    if (!res.ok) return setErr(res);
    setAsk(false);
    router.refresh();
  };
  return (
    <div className="flex flex-col items-start gap-2">
      {active && !ask ? (
        <button type="button" onClick={() => setAsk(true)} className="min-h-11 text-sm font-medium text-muted">
          {t('turnOff')}
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <Button type="button" variant={active ? 'danger' : 'outline'} disabled={busy} onClick={run}>
            {active ? t('turnOffConfirm') : t('turnOn')}
          </Button>
          {active && (
            <button type="button" onClick={() => setAsk(false)} className="min-h-11 px-2 text-sm text-muted">
              {t('cancel')}
            </button>
          )}
        </div>
      )}
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.shifts" />}
    </div>
  );
}
