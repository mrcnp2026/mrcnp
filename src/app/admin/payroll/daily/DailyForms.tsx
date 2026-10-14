'use client';
// 일용직 화면의 조작부 — 대상자 · 고용 기간 넣기, 근무 한 줄 넣기 · 확정 · 무효, 일용 대장 만들기 · 계산 · 검토 · 확정. 처리하면 화면을 새로 읽는다.
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';

const field = 'min-h-9 rounded-button border border-border bg-bg px-3 text-sm';
const small = 'inline-flex h-8 items-center rounded-button border border-border bg-bg px-3 text-sm font-bold text-muted disabled:opacity-50';
const API = '/api/admin/payroll/daily';
type Err = { code: string; requestId?: string } | null;
const digits = (v: string) => v.replace(/[^\d]/g, '');

function useCall() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Err>(null);
  const send = async <T,>(body: Record<string, unknown>): Promise<T | null> => {
    setBusy(true);
    setErr(null);
    const r = await callApi<T>(API, body);
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
const Fail = ({ err }: { err: Err }) => (err ? <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.daily" /> : null);

export function PayeeAdd() {
  const t = useTranslations('admin.daily');
  const { busy, err, send } = useCall();
  return (
    <form
      className="flex flex-wrap items-end gap-3 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget, f = new FormData(form);
        if (await send({ action: 'payee.add', internalNo: f.get('internalNo'), name: f.get('name'), phone: f.get('phone'), note: f.get('note') })) form.reset();
      }}
    >
      {([['internalNo', 30, true], ['name', 60, true], ['phone', 30, false], ['note', 300, false]] as const).map(([k, max, req]) => (
        <label key={k} className="flex flex-col gap-1">
          <span className="font-bold">{t(`payee.${k}`)}</span>
          <input name={k} required={req} maxLength={max} className={field} autoComplete="off" />
        </label>
      ))}
      <Button type="submit" size="sm" disabled={busy}>{t('payeeAdd')}</Button>
      <Fail err={err} />
    </form>
  );
}

export function PayeeToggle({ id, active, name }: { id: string; active: boolean; name: string }) {
  const t = useTranslations('admin.daily');
  const { busy, err, send } = useCall();
  return (
    <span className="flex flex-col gap-1">
      <button type="button" className={small} disabled={busy} onClick={() => send({ action: 'payee.active', id, active: !active })} aria-label={t(active ? 'payeeOffOf' : 'payeeOnOf', { name })}>{t(active ? 'payeeOff' : 'payeeOn')}</button>
      <Fail err={err} />
    </span>
  );
}

const TRI = ['UNKNOWN', 'YES', 'NO'] as const;
/** 고용 기간 넣기 — 기간 · 현장 · 일단가 · 세금/보험 적용 상태. 「모름」으로 두면 그 사람은 계산되지 않는다 */
export function EngagementAdd({ payeeId, today, name }: { payeeId: string; today: string; name: string }) {
  const t = useTranslations('admin.daily');
  const { busy, err, send } = useCall();
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" className={small} onClick={() => setOpen(true)} aria-label={t('engAddOf', { name })}>{t('engAdd')}</button>;
  return (
    <form
      className="flex flex-wrap items-end gap-3 rounded-card border border-border bg-surface p-3 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        if (await send({ action: 'engagement.add', payeeId, startsOn: f.get('startsOn'), endsOn: f.get('endsOn'), project: f.get('project'), dayRate: f.get('dayRate'), taxState: f.get('taxState'), ei: f.get('ei'), np: f.get('np'), hi: f.get('hi'), basisNote: f.get('basisNote') })) setOpen(false);
      }}
    >
      <label className="flex flex-col gap-1"><span className="font-bold">{t('eng.startsOn')}</span><input type="date" name="startsOn" required defaultValue={today} className={field} /></label>
      <label className="flex flex-col gap-1"><span className="font-bold">{t('eng.endsOn')}</span><input type="date" name="endsOn" className={field} /></label>
      <label className="flex flex-col gap-1"><span className="font-bold">{t('eng.project')}</span><input name="project" maxLength={80} className={field} autoComplete="off" /></label>
      <label className="flex flex-col gap-1"><span className="font-bold">{t('eng.dayRate')}</span><input name="dayRate" inputMode="numeric" onInput={(e) => { e.currentTarget.value = digits(e.currentTarget.value); }} className={`num w-32 ${field}`} autoComplete="off" /></label>
      <label className="flex flex-col gap-1">
        <span className="font-bold">{t('eng.taxState')}</span>
        <select name="taxState" defaultValue="UNKNOWN" className={field}>
          {(['UNKNOWN', 'DAILY', 'NONE'] as const).map((k) => (
            <option key={k} value={k}>{t(`tax.${k}`)}</option>
          ))}
        </select>
      </label>
      {(['ei', 'np', 'hi'] as const).map((k) => (
        <label key={k} className="flex flex-col gap-1">
          <span className="font-bold">{t(`eng.${k}`)}</span>
          <select name={k} defaultValue="UNKNOWN" className={field}>
            {TRI.map((v) => (
              <option key={v} value={v}>{t(`tri.${v}`)}</option>
            ))}
          </select>
        </label>
      ))}
      <label className="flex min-w-64 flex-1 flex-col gap-1"><span className="font-bold">{t('eng.basisNote')}</span><input name="basisNote" maxLength={300} className={field} autoComplete="off" /></label>
      <Button type="submit" size="sm" disabled={busy}>{t('save')}</Button>
      <button type="button" onClick={() => setOpen(false)} className="min-h-9 px-2 text-sm text-muted">{t('cancel')}</button>
      <p className="w-full text-xs text-faint">{t('engNote')}</p>
      <Fail err={err} />
    </form>
  );
}
export function EngagementOff({ id, label }: { id: string; label: string }) {
  const t = useTranslations('admin.daily');
  const { busy, err, send } = useCall();
  return (
    <span className="flex flex-col gap-1">
      <button type="button" className={small} disabled={busy} onClick={() => send({ action: 'engagement.set', id, disable: true })} aria-label={label}>{t('engOff')}</button>
      <Fail err={err} />
    </span>
  );
}

type PayeeOpt = { id: string; name: string; internalNo: string; projects: string[] };
/** 근무 한 줄 넣기 — 대상자 · 날짜 · 현장 · 공수 · 일단가(비우면 고용 기간의 일단가) · 그 밖의 항목 하나씩 */
export function WorkAdd({ payees, day, live }: { payees: PayeeOpt[]; day: string; live?: boolean }) {
  const t = useTranslations('admin.daily');
  const { busy, err, send } = useCall();
  const [payeeId, setPayeeId] = useState('');
  const projects = payees.find((p) => p.id === payeeId)?.projects ?? [];
  return (
    <form
      className="flex flex-wrap items-end gap-3 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const items = (['NONTAX', 'TAXABLE', 'DEDUCTION'] as const).flatMap((k) => (f.get(`a_${k}`) ? [{ kind: k, label: String(f.get(`l_${k}`) || t(`item.${k}`)), amount: Number(f.get(`a_${k}`)) }] : []));
        await send({ action: 'work.add', payeeId, workDate: f.get('workDate'), project: f.get('project') ?? '', segmentKey: f.get('segmentKey'), quantity: Number(f.get('quantity')), dayRate: f.get('dayRate'), items, basisNote: f.get('basisNote'), ...(live ? { live: true } : {}) });
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="font-bold">{t('work.payee')}</span>
        <select required value={payeeId} onChange={(e) => setPayeeId(e.target.value)} className={field}>
          <option value="">{t('pick')}</option>
          {payees.map((p) => (
            <option key={p.id} value={p.id}>{p.name} ({p.internalNo})</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1"><span className="font-bold">{t('work.date')}</span><input type="date" name="workDate" required defaultValue={day} className={field} /></label>
      <label className="flex flex-col gap-1">
        <span className="font-bold">{t('work.project')}</span>
        <select name="project" className={field} key={payeeId}>
          {projects.length === 0 && <option value="">{t('noProject')}</option>}
          {projects.map((p) => (
            <option key={p} value={p}>{p || t('noProject')}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1"><span className="font-bold">{t('work.quantity')}</span><input name="quantity" type="number" step="0.25" min="0.25" max="3" defaultValue="1" required className={`num w-24 ${field}`} /></label>
      <label className="flex flex-col gap-1"><span className="font-bold">{t('work.dayRate')}</span><input name="dayRate" inputMode="numeric" onInput={(e) => { e.currentTarget.value = digits(e.currentTarget.value); }} className={`num w-32 ${field}`} autoComplete="off" /></label>
      <label className="flex flex-col gap-1"><span className="font-bold">{t('work.segment')}</span><input name="segmentKey" maxLength={10} defaultValue="A" className={`w-20 ${field}`} autoComplete="off" /></label>
      {(['NONTAX', 'TAXABLE', 'DEDUCTION'] as const).map((k) => (
        <span key={k} className="flex flex-col gap-1">
          <span className="font-bold">{t(`item.${k}`)}</span>
          <span className="flex gap-1">
            <input name={`l_${k}`} maxLength={40} placeholder={t('itemLabel')} aria-label={t('itemLabelOf', { kind: t(`item.${k}`) })} className={`w-28 ${field}`} autoComplete="off" />
            <input name={`a_${k}`} inputMode="numeric" onInput={(e) => { e.currentTarget.value = digits(e.currentTarget.value); }} placeholder={t('itemAmount')} aria-label={t('itemAmountOf', { kind: t(`item.${k}`) })} className={`num w-28 ${field}`} autoComplete="off" />
          </span>
        </span>
      ))}
      <label className="flex min-w-48 flex-1 flex-col gap-1"><span className="font-bold">{t('work.basis')}</span><input name="basisNote" maxLength={300} className={field} autoComplete="off" /></label>
      <Button type="submit" size="sm" disabled={busy}>{t('workAdd')}</Button>
      <p className="w-full text-xs text-faint">{t('workNote')}</p>
      <Fail err={err} />
    </form>
  );
}

export function WorkControls({ id, version, status, label }: { id: string; version: number; status: string; label: string }) {
  const t = useTranslations('admin.daily');
  const { busy, err, send } = useCall();
  if (status === 'VOID') return null;
  return (
    <span className="flex flex-wrap gap-2" aria-label={label}>
      {status === 'DRAFT' && <button type="button" className={small} disabled={busy} onClick={() => send({ action: 'work.status', id, expectedVersion: version, status: 'CONFIRMED' })}>{t('workConfirm')}</button>}
      <button type="button" className={small} disabled={busy} onClick={() => send({ action: 'work.status', id, expectedVersion: version, status: 'VOID' })}>{t('workVoid')}</button>
      <Fail err={err} />
    </span>
  );
}

export function DailyRunCreate({ month, payDate, live }: { month: string; payDate: string; live?: boolean }) {
  const t = useTranslations('admin.daily');
  const { busy, err, send, router } = useCall();
  return (
    <form
      className="flex flex-wrap items-end gap-3 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const made = await send<{ id: string }>({ action: 'run.create', month: f.get('month'), payDate: f.get('payDate'), ...(live ? { live: true } : {}) });
        if (made) router.push(`/admin/payroll/daily/runs/${made.id}`);
      }}
    >
      <label className="flex flex-col gap-1"><span className="font-bold">{t('run.month')}</span><input type="month" name="month" required defaultValue={month} className={field} /></label>
      <label className="flex flex-col gap-1"><span className="font-bold">{t('run.payDate')}</span><input type="date" name="payDate" required defaultValue={payDate} className={field} /></label>
      <Button type="submit" size="sm" disabled={busy}>{t('runCreate')}</Button>
      <Fail err={err} />
    </form>
  );
}

export function DailyRunActions({ id, version, status, stale, blocked, latest }: { id: string; version: number; status: string; stale: boolean; blocked: number; latest: boolean }) {
  const t = useTranslations('admin.daily');
  const { busy, err, send, router } = useCall();
  const [ask, setAsk] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  if (status === 'FINALIZED') {
    if (!latest) return null;
    // 확정한 대장 고치기 — 원본은 그대로 두고 정정 판을 만든다 (2026-10-14)
    return (
      <div className="flex flex-col gap-2 text-sm">
        {ask ? (
          <div className="flex flex-wrap items-center gap-2">
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder={t('correctReason')} aria-label={t('correctReason')} className="h-9 min-w-0 flex-1 rounded-button border border-border bg-bg px-3 sm:max-w-md" />
            <Button type="button" size="sm" disabled={busy || reason.trim().length < 2} onClick={async () => { const r = await send<{ id: string }>({ action: 'run.correct', id, reason }); if (r) router.push(`/admin/payroll/daily/runs/${r.id}`); }}>{t('correctStart')}</Button>
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setAsk(false)}>{t('cancel')}</Button>
          </div>
        ) : (
          <Button type="button" size="sm" variant="outline" className="self-start" onClick={() => setAsk(true)}>{t('correct')}</Button>
        )}
        <p className="text-xs text-faint">{t('correctHint')}</p>
        <Fail err={err} />
      </div>
    );
  }
  const base = { id, expectedVersion: version };
  const canReview = status === 'CALCULATED' && !stale && blocked === 0, canFinalize = status === 'REVIEWED' && !stale && blocked === 0;
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant={status === 'DRAFT' || stale ? undefined : 'outline'} disabled={busy} onClick={async () => { setMsg(null); const r = await send<{ calculated: { ok: number; blocked: number } }>({ action: 'run.calculate', ...base }); if (r) setMsg(t('calcDone', r.calculated)); }}>
          {t(status === 'DRAFT' ? 'calculate' : 'recalculate')}
        </Button>
        <Button type="button" size="sm" variant={canReview ? undefined : 'outline'} disabled={busy || !canReview} onClick={() => send({ action: 'run.review', ...base })}>{t('review')}</Button>
        {ask ? (
          <>
            <span className="text-warn">{t('finalizeConfirm')}</span>
            <Button type="button" size="sm" disabled={busy} onClick={async () => { await send({ action: 'run.finalize', ...base }); setAsk(false); }}>{t('finalizeYes')}</Button>
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setAsk(false)}>{t('cancel')}</Button>
          </>
        ) : (
          <Button type="button" size="sm" variant={canFinalize ? undefined : 'outline'} disabled={busy || !canFinalize} onClick={() => setAsk(true)}>{t('finalize')}</Button>
        )}
      </div>
      {msg && <p role="status" className="text-ok">{msg}</p>}
      <Fail err={err} />
    </div>
  );
}
