'use client';
// 이상 기록의 담당자 · 처리 기한 (2026-10-19 의뢰인). TaskEdit = 한 건만 바꾸기(접힌 채 「바꾸기」), TaskPolicyForm = 기본 담당 · 기한 일수 · 켜기.
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';
import type { AnomalyTaskPolicy } from '@/lib/anomaly';

const field = 'min-h-11 w-full rounded-button border border-border bg-bg px-3 text-sm lg:min-h-9';
type Person = { id: string; name: string };

export function TaskEdit({ employeeId, workDate, assigneeId, dueOn, note, people, live, ready, short = false }: { employeeId: string; workDate: string; assigneeId: string | null; dueOn: string | null; note: string | null; people: Person[]; live: boolean; ready: boolean; short?: boolean }) {
  const t = useTranslations('admin.anomalies.task');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-8 items-center text-sm font-bold whitespace-nowrap text-primary hover:underline">
        {t(short ? 'changeShort' : 'change')}
      </button>
    );
  return (
    <form
      className="flex w-full min-w-56 flex-col gap-2 rounded-button bg-surface p-3 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setErr(null);
        const r = await callApi('/api/admin/anomalies', { action: 'assign', employeeId, workDate, live, assigneeId: String(f.get('assignee') ?? '') || null, dueOn: String(f.get('due') ?? '') || null, note: String(f.get('note') ?? '').trim() || null });
        setBusy(false);
        if (!r.ok) return setErr(r);
        setOpen(false);
        router.refresh();
      }}
    >
      {!ready && <p className="text-warn">{t('dbPending')}</p>}
      <label className="flex flex-col gap-1">
        <span className="text-muted">{t('assignee')}</span>
        <select name="assignee" defaultValue={assigneeId ?? ''} className={field}>
          <option value="">{t('assigneeDefault')}</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-muted">{t('due')}</span>
        <input name="due" type="date" min={workDate} defaultValue={dueOn ?? ''} className={`num ${field}`} />
        <span className="text-xs text-faint">{t('dueHint')}</span>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-muted">{t('note')}</span>
        <input name="note" maxLength={300} defaultValue={note ?? ''} className={field} />
      </label>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.anomalies.task" />}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy || !ready}>
          {t('save')}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>
          {t('cancel')}
        </Button>
      </div>
    </form>
  );
}

export function TaskPolicyForm({ policy, version, people }: { policy: AnomalyTaskPolicy; version: number; people: Person[] }) {
  const t = useTranslations('admin.anomalies.task');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  return (
    <form
      className="flex flex-col gap-3 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setErr(null);
        setDone(false);
        const r = await callApi('/api/admin/anomalies', { action: 'taskPolicy', expectedVersion: version, policy: { enabled: f.get('enabled') === 'on', assignee: String(f.get('assignee') ?? 'approvers'), dueDays: Number(f.get('dueDays')), startsOn: policy.startsOn } });
        setBusy(false);
        if (!r.ok) return setErr(r);
        setDone(true);
        router.refresh();
      }}
    >
      <label className="flex min-h-9 items-center gap-2">
        <input name="enabled" type="checkbox" defaultChecked={policy.enabled} className="size-5 accent-primary" />
        {t('enabled')}
      </label>
      <div className="grid gap-3 lg:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span>{t('defaultAssignee')}</span>
          <select name="assignee" defaultValue={policy.assignee} className={field}>
            <option value="approvers">{t('approvers')}</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span>{t('dueDays')}</span>
          <input name="dueDays" type="number" min={0} max={31} step={1} required defaultValue={policy.dueDays} className={`num ${field}`} />
        </label>
      </div>
      <p className="text-xs text-faint">{t('policyHint', { start: policy.startsOn })}</p>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.anomalies.task" />}
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={busy}>
          {t('save')}
        </Button>
        {done && (
          <span role="status" className="text-ok">
            {t('saved')}
          </span>
        )}
      </div>
    </form>
  );
}
