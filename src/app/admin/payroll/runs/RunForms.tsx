'use client';
// 급여대장의 조작부 — 대장 만들기 · 계산/검토/확정 · 대상 빼기/넣기 · 금액 조정. 처리하면 화면을 새로 읽는다.
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';

const field = 'min-h-9 rounded-button border border-border bg-bg px-3 text-sm';
type Err = { code: string; requestId?: string } | null;

function useRun(url: string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Err>(null);
  const send = async <T,>(body: Record<string, unknown>): Promise<T | null> => {
    setBusy(true);
    setErr(null);
    const r = await callApi<T>(url, body);
    setBusy(false);
    if (!r.ok) {
      setErr(r);
      return null;
    }
    router.refresh();
    return r.data;
  };
  return { busy, err, send, router };
}

export function RunCreate({ months, live }: { months: string[]; live: boolean }) {
  const t = useTranslations('admin.payRuns');
  const { busy, err, send, router } = useRun('/api/admin/payroll/runs');
  return (
    <form
      className="flex flex-wrap items-end gap-3 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await send<{ id: string }>({ action: 'create', month: new FormData(e.currentTarget).get('month'), live });
        if (r) router.push(`/admin/payroll/runs/${r.id}`);
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="font-bold">{t('fMonth')}</span>
        <select name="month" className={field}>
          {months.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" size="sm" disabled={busy}>
        {t('create')}
      </Button>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.payRuns" />}
    </form>
  );
}

export function RunActions({ id, version, status, stale, blocked }: { id: string; version: number; status: string; stale: boolean; blocked: number }) {
  const t = useTranslations('admin.payRuns');
  const { busy, err, send } = useRun(`/api/admin/payroll/runs/${id}`);
  const [ask, setAsk] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (status === 'FINALIZED') return null;
  const go = async (action: string) => {
    setMsg(null);
    const r = await send<{ calculated?: { ok: number; blocked: number } }>({ action, expectedVersion: version });
    setAsk(false);
    if (r?.calculated) setMsg(t('calcDone', { ok: r.calculated.ok, blocked: r.calculated.blocked }));
  };
  const canReview = status === 'CALCULATED' && !stale && blocked === 0;
  const canFinalize = status === 'REVIEWED' && !stale && blocked === 0;
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant={status === 'DRAFT' || stale ? undefined : 'outline'} disabled={busy} onClick={() => go('calculate')}>
          {busy ? t('working') : t(status === 'DRAFT' ? 'calculate' : 'recalculate')}
        </Button>
        <Button type="button" size="sm" variant={canReview ? undefined : 'outline'} disabled={busy || !canReview} onClick={() => go('review')}>
          {t('review')}
        </Button>
        {ask ? (
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-warn">{t('finalizeConfirm')}</span>
            <Button type="button" size="sm" disabled={busy} onClick={() => go('finalize')}>
              {t('finalizeYes')}
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setAsk(false)}>
              {t('cancel')}
            </Button>
          </span>
        ) : (
          <Button type="button" size="sm" variant={canFinalize ? undefined : 'outline'} disabled={busy || !canFinalize} onClick={() => setAsk(true)}>
            {t('finalize')}
          </Button>
        )}
      </div>
      {msg && <p role="status" className="text-ok">{msg}</p>}
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.payRuns" />}
    </div>
  );
}

export function MemberToggle({ id, employeeId, included, name }: { id: string; employeeId: string; included: boolean; name: string }) {
  const t = useTranslations('admin.payRuns');
  const { busy, err, send } = useRun(`/api/admin/payroll/runs/${id}`);
  const [open, setOpen] = useState(false);
  if (included && !open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex h-8 items-center rounded-button border border-border bg-bg px-3 text-sm font-bold text-muted">
        {t('exclude')}
      </button>
    );
  if (!included)
    return (
      <span className="flex flex-col gap-1">
        <button type="button" disabled={busy} onClick={() => send({ action: 'include', employeeId })} className="inline-flex h-8 items-center self-start rounded-button border border-border bg-bg px-3 text-sm font-bold text-muted disabled:opacity-50">
          {t('include')}
        </button>
        {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.payRuns" />}
      </span>
    );
  return (
    <form
      className="flex min-w-56 flex-col gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await send({ action: 'exclude', employeeId, reason: new FormData(e.currentTarget).get('reason') })) setOpen(false);
      }}
    >
      <input name="reason" required minLength={2} maxLength={300} placeholder={t('excludeReason')} aria-label={t('excludeReasonOf', { name })} className={field} autoComplete="off" />
      <span className="flex gap-2">
        <Button type="submit" size="sm" variant="outline" disabled={busy}>
          {t('exclude')}
        </Button>
        <button type="button" onClick={() => setOpen(false)} className="min-h-9 px-2 text-sm text-muted">
          {t('cancel')}
        </button>
      </span>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.payRuns" />}
    </form>
  );
}

export function OverrideForm({ id, employeeId, codes, active }: { id: string; employeeId: string; codes: { code: string; kind: 'PAYMENT' | 'DEDUCTION'; label: string }[]; active: { id: string; label: string; amount: string; original: string | null; reason: string }[] }) {
  const t = useTranslations('admin.payRuns');
  const { busy, err, send } = useRun(`/api/admin/payroll/runs/${id}`);
  return (
    <div className="flex flex-col gap-3 text-sm">
      {active.length > 0 && (
        <ul className="flex flex-col gap-2">
          {active.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-button border border-border p-2">
              <span className="num">
                <b>{o.label}</b> {o.original === null ? t('ovNew', { amount: o.amount }) : t('ovChange', { from: o.original, to: o.amount })}
                <span className="block text-xs text-muted">{o.reason}</span>
              </span>
              <button type="button" disabled={busy} onClick={() => send({ action: 'override.withdraw', overrideId: o.id })} className="inline-flex h-8 items-center rounded-button border border-border bg-bg px-3 text-sm font-bold text-muted disabled:opacity-50">
                {t('ovWithdraw')}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="grid gap-3 md:grid-cols-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const el = e.currentTarget;
          const f = new FormData(el);
          const [kind, code] = String(f.get('item')).split(':');
          if (await send({ action: 'override.add', employeeId, itemCode: code, kind, amount: f.get('amount'), reason: f.get('reason') })) el.reset();
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="font-bold">{t('ovItem')}</span>
          <select name="item" className={field}>
            {codes.map((c) => (
              <option key={`${c.kind}:${c.code}`} value={`${c.kind}:${c.code}`}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-bold">{t('ovAmount')}</span>
          <input name="amount" type="number" step="1" required className={field} />
        </label>
        <label className="flex flex-col gap-1 md:col-span-2">
          <span className="font-bold">{t('ovReason')}</span>
          <input name="reason" required minLength={2} maxLength={300} className={field} autoComplete="off" />
        </label>
        <div className="md:col-span-4">
          <Button type="submit" size="sm" variant="outline" disabled={busy}>
            {t('ovAdd')}
          </Button>
        </div>
      </form>
      <p className="text-xs text-faint">{t('ovHint')}</p>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.payRuns" />}
    </div>
  );
}

export function PublishAll({ id, waiting }: { id: string; waiting: number }) {
  const t = useTranslations('admin.payRuns');
  const { busy, err, send } = useRun(`/api/admin/payroll/runs/${id}`);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          size="sm"
          disabled={busy || waiting === 0}
          onClick={async () => {
            setMsg(null);
            const r = await send<{ publish: { published: number } }>({ action: 'publish' });
            if (r) setMsg(t('publishDone', { n: r.publish.published }));
          }}
        >
          {t('publishAll', { n: waiting })}
        </Button>
        {msg && <span role="status" className="text-ok">{msg}</span>}
      </div>
      <p className="text-xs text-faint">{t('publishHint')}</p>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.payRuns" />}
    </div>
  );
}

export function PublishToggle({ id, employeeId, published, name }: { id: string; employeeId: string; published: boolean; name: string }) {
  const t = useTranslations('admin.payRuns');
  const { busy, err, send } = useRun(`/api/admin/payroll/runs/${id}`);
  const [open, setOpen] = useState(false);
  if (!published)
    return (
      <span className="flex flex-col gap-1">
        <button type="button" disabled={busy} onClick={() => send({ action: 'publish', employeeIds: [employeeId] })} className="inline-flex h-8 items-center self-start rounded-button border border-primary bg-bg px-3 text-sm font-bold text-primary disabled:opacity-50">
          {t('publishOne')}
        </button>
        {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.payRuns" />}
      </span>
    );
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex h-8 items-center rounded-button border border-border bg-bg px-3 text-sm font-bold text-muted">
        {t('unpublish')}
      </button>
    );
  return (
    <form
      className="flex min-w-56 flex-col gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await send({ action: 'unpublish', employeeId, reason: new FormData(e.currentTarget).get('reason') })) setOpen(false);
      }}
    >
      <input name="reason" required minLength={2} maxLength={300} placeholder={t('unpublishReason')} aria-label={t('unpublishReasonOf', { name })} className={field} autoComplete="off" />
      <span className="flex gap-2">
        <Button type="submit" size="sm" variant="outline" disabled={busy}>
          {t('unpublish')}
        </Button>
        <button type="button" onClick={() => setOpen(false)} className="min-h-9 px-2 text-sm text-muted">
          {t('cancel')}
        </button>
      </span>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.payRuns" />}
    </form>
  );
}
