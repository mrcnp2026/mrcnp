'use client';
// 직무 양식 (2026-10-10) — 만들기·고치기 / 이 직무인 직원 고르기 / 끄기·켜기.
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CLOSE_SHEET_EVENT } from '@/components/AddSheet';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';
import { SHIFT_COLOR_CLASS, SHIFT_COLORS, type ShiftColor } from '@/lib/shifts';

const field = 'min-h-11 w-full rounded-button border border-border bg-bg px-3 text-base text-text';
type Err = { code: string; requestId?: string } | null;

export function JobForm({ initial, sheet }: { initial?: { id: string; name: string; color: ShiftColor }; sheet: string }) {
  const t = useTranslations('admin.jobs');
  const tc = useTranslations('admin.shifts.colors');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Err>(null);
  const [color, setColor] = useState<ShiftColor>(initial?.color ?? 'primary');
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        setBusy(true);
        setErr(null);
        const res = await callApi<{ id?: string }>(initial ? `/api/admin/jobs/${initial.id}` : '/api/admin/jobs', { name: fd.get('name'), color });
        setBusy(false);
        if (!res.ok) return setErr(res);
        window.dispatchEvent(new CustomEvent(CLOSE_SHEET_EVENT, { detail: sheet }));
        if (!initial && res.data.id) {
          form.reset();
          router.push(`/admin/jobs/${res.data.id}`);
        }
        router.refresh();
      }}
    >
      <label className="flex flex-col gap-1 text-sm text-muted">
        {t('name')}
        <input name="name" required maxLength={40} defaultValue={initial?.name} placeholder={t('namePlaceholder')} className={field} autoComplete="off" />
      </label>
      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm text-muted">{t('color')}</legend>
        <div className="flex flex-wrap gap-1">
          {SHIFT_COLORS.map((c) => (
            <label key={c} className={`flex size-11 cursor-pointer items-center justify-center rounded-button border-2 ${color === c ? 'border-text' : 'border-transparent'}`}>
              <input type="radio" name="color" value={c} checked={color === c} onChange={() => setColor(c)} aria-label={tc(c)} className="sr-only" />
              <span aria-hidden className={`size-7 rounded-button ${SHIFT_COLOR_CLASS[c]}`} />
            </label>
          ))}
        </div>
      </fieldset>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.jobs" />}
      <Button type="submit" disabled={busy}>
        {t('save')}
      </Button>
    </form>
  );
}

/** 이 직무인 직원 고르기 — 다른 직무인 사람은 그 직무 이름이 옆에 보인다 (고르면 이 직무로 옮겨진다) */
export function JobAssignForm({ id, people }: { id: string; people: { id: string; name: string; group: string | null; other: string | null; on: boolean }[] }) {
  const t = useTranslations('admin.jobs');
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
        const res = await callApi(`/api/admin/jobs/${id}`, { employeeIds: [...picked] });
        setBusy(false);
        if (!res.ok) return setErr(res);
        setSaved(true);
        router.refresh();
      }}
    >
      <p className="num text-sm text-muted">{t('pickedCount', { n: picked.size })}</p>
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
              {p.other && <span className="max-w-32 shrink-0 truncate text-sm text-faint">{p.other}</span>}
            </label>
          </li>
        ))}
      </ul>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.jobs" />}
      {saved && <p className="rounded-button bg-ok-tint p-3 text-sm text-ok">{t('assignSaved')}</p>}
      <Button type="submit" disabled={busy}>
        {t('assignSave')}
      </Button>
    </form>
  );
}

export function JobToggle({ id, active }: { id: string; active: boolean }) {
  const t = useTranslations('admin.jobs');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Err>(null);
  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          const res = await callApi(`/api/admin/jobs/${id}`, { active: !active });
          setBusy(false);
          if (!res.ok) return setErr(res);
          router.refresh();
        }}
      >
        {t(active ? 'turnOff' : 'turnOn')}
      </Button>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.jobs" />}
    </div>
  );
}
