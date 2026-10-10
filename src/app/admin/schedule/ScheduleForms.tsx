'use client';
// 날짜별 근무일정 양식 (2026-10-10 2단계) — 틀을 고르면 시각·유형이 채워지고, 직원을 여러 명 골라 한 번에 넣는다. + 일정 취소 버튼.
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CLOSE_SHEET_EVENT } from '@/components/AddSheet';
import { callApi } from '@/components/client-api';
import { DateTimeInput } from '@/components/DateTimeInput';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';
import { SHIFT_KINDS, type ShiftKind } from '@/lib/shifts';

const field = 'min-h-11 w-full rounded-button border border-border bg-bg px-3 text-base text-text';
type Err = { code: string; requestId?: string } | null;

export function ScheduleForm({
  date,
  templates,
  people,
  sheet,
}: {
  date: string;
  templates: { id: string; name: string; startTime: string; endTime: string; kind: ShiftKind }[];
  people: { id: string; name: string; group: string | null }[];
  sheet: string;
}) {
  const t = useTranslations('admin.schedule');
  const tk = useTranslations('admin.shifts.kinds');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Err>(null);
  const [day, setDay] = useState(date);
  const [tpl, setTpl] = useState('');
  const [start, setStart] = useState('08:00');
  const [end, setEnd] = useState('17:00');
  const [kind, setKind] = useState<ShiftKind>('none');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setBusy(true);
        setErr(null);
        const res = await callApi('/api/admin/schedule', { date: day, startTime: start, endTime: end, kind, templateId: tpl || null, note: fd.get('note'), employeeIds: [...picked] });
        setBusy(false);
        if (!res.ok) return setErr(res);
        setPicked(new Set());
        window.dispatchEvent(new CustomEvent(CLOSE_SHEET_EVENT, { detail: sheet }));
        router.push(`/admin/schedule?d=${day}`);
        router.refresh();
      }}
    >
      <label className="flex flex-col gap-1 text-sm text-muted">
        {t('date')}
        <DateTimeInput type="date" value={day} onChange={setDay} required className={`num ${field}`} />
      </label>
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
              setKind(x.kind);
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
      {kind === 'extra' && <p className="rounded-button bg-primary-tint p-3 text-sm text-primary">{t('extraNote')}</p>}
      <label className="flex flex-col gap-1 text-sm text-muted">
        {t('note')}
        <input name="note" maxLength={200} className={field} autoComplete="off" />
      </label>
      <fieldset className="flex flex-col gap-1">
        <legend className="flex w-full items-center justify-between text-sm text-muted">
          <span>{t('people', { n: picked.size })}</span>
          <span className="flex gap-1">
            <button type="button" onClick={() => setPicked(new Set(people.map((p) => p.id)))} className="min-h-11 px-2 text-sm font-medium text-primary">
              {t('pickAll')}
            </button>
            <button type="button" onClick={() => setPicked(new Set())} className="min-h-11 px-2 text-sm font-medium text-muted">
              {t('pickNone')}
            </button>
          </span>
        </legend>
        <ul className="flex max-h-64 flex-col divide-y divide-border overflow-y-auto rounded-button border border-border px-3">
          {people.map((p) => (
            <li key={p.id}>
              <label className="flex min-h-11 items-center gap-3">
                <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} className="size-5 shrink-0 accent-primary" />
                <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                {p.group && <span className="max-w-32 shrink-0 truncate text-sm text-muted">{p.group}</span>}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.schedule" />}
      <Button type="submit" disabled={busy || picked.size === 0}>
        {t('save')}
      </Button>
    </form>
  );
}

/** 넣은 일정 취소 — 한 번 더 묻는다 */
export function CancelShift({ id, label }: { id: string; label: string }) {
  const t = useTranslations('admin.schedule');
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!ask) {
    return (
      <button type="button" aria-label={label} title={label} onClick={() => setAsk(true)} className="flex size-11 shrink-0 items-center justify-center text-faint">
        <X aria-hidden size={18} />
      </button>
    );
  }
  return (
    <span className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await callApi(`/api/admin/schedule/${id}`, { active: false });
          setBusy(false);
          if (r.ok) router.refresh();
          setAsk(false);
        }}
        className="min-h-11 rounded-button bg-danger px-3 text-sm font-bold text-on-primary disabled:opacity-60"
      >
        {t('cancelConfirm')}
      </button>
      <button type="button" onClick={() => setAsk(false)} className="min-h-11 px-2 text-sm text-muted">
        {t('keep')}
      </button>
    </span>
  );
}

/** 날짜 고르기 — 고르는 즉시 그날로 간다 (좁은 폰에서 「보기」 버튼 자리가 없다) */
export function DayJump({ date, label }: { date: string; label: string }) {
  const router = useRouter();
  return <DateTimeInput type="date" value={date} onChange={(v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && router.push(`/admin/schedule?d=${v}`)} required aria-label={label} className="num min-h-11 w-full min-w-0 rounded-button border border-border bg-bg px-3 text-base" />;
}
