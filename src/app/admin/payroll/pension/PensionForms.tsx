'use client';
// 퇴직연금 DC 화면의 조작부 (묶음 32, 2026-10-20) — 가입 넣기 · 고치기 · 빼기, 그 달 부담금 다시 만들기, 손으로 넣기, 은행에 낸 날 표시.
import { Select } from '@/components/Select';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';

const field = 'min-h-11 w-full min-w-0 rounded-button border border-border bg-bg px-3 text-base lg:min-h-9 lg:text-sm';
type Person = { id: string; name: string; employeeNo: string | null };

function useCall() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const send = async <T,>(body: Record<string, unknown>): Promise<T | null> => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    const r = await callApi<T>('/api/admin/payroll/pension', body);
    setBusy(false);
    if (!r.ok) {
      setErr(r);
      return null;
    }
    router.refresh();
    return r.data;
  };
  return { busy, err, msg, setMsg, send };
}

export function MemberForm({ people, initial }: { people: Person[]; initial?: { employeeId: string; planKind: 'DC' | 'DB'; joinedOn: string; endedOn: string | null; institution: string | null; openingBalance: number | null; openingAsOf: string | null; marketValue?: number | null; marketValueAsOf?: string | null; note: string | null } }) {
  const t = useTranslations('admin.pension');
  const { busy, err, send } = useCall();
  return (
    <form
      className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        await send({ action: 'member.save', ...Object.fromEntries(f) });
      }}
    >
      <label className="flex min-w-0 flex-col gap-1">
        <span className="text-muted">{t('fEmployee')}</span>
        <Select name="employeeId" required defaultValue={initial?.employeeId ?? ''} disabled={!!initial} className={field}>
          <option value="">{t('pick')}</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} {p.employeeNo ? `(${p.employeeNo})` : ''}
            </option>
          ))}
        </Select>
        {initial && <input type="hidden" name="employeeId" value={initial.employeeId} />}
      </label>
      <label className="flex min-w-0 flex-col gap-1">
        <span className="text-muted">{t('fPlan')}</span>
        <Select name="planKind" defaultValue={initial?.planKind ?? 'DC'} className={field}>
          <option value="DC">{t('plan.DC')}</option>
          <option value="DB">{t('plan.DB')}</option>
        </Select>
      </label>
      <label className="flex min-w-0 flex-col gap-1">
        <span className="text-muted">{t('fJoined')}</span>
        <input type="date" name="joinedOn" required defaultValue={initial?.joinedOn ?? ''} className={field} />
      </label>
      <label className="flex min-w-0 flex-col gap-1">
        <span className="text-muted">{t('fInstitution')}</span>
        <input name="institution" maxLength={60} defaultValue={initial?.institution ?? ''} className={field} autoComplete="off" />
      </label>
      <label className="flex min-w-0 flex-col gap-1">
        <span className="text-muted">{t('fOpening')}</span>
        <input name="openingBalance" inputMode="numeric" defaultValue={initial?.openingBalance ?? ''} className={`num ${field}`} autoComplete="off" />
      </label>
      <label className="flex min-w-0 flex-col gap-1">
        <span className="text-muted">{t('fOpeningAsOf')}</span>
        <input type="date" name="openingAsOf" defaultValue={initial?.openingAsOf ?? ''} className={field} />
      </label>
      <label className="flex min-w-0 flex-col gap-1">
        <span className="text-muted">{t('fMarket')}</span>
        <input name="marketValue" inputMode="numeric" defaultValue={initial?.marketValue ?? ''} className={`num ${field}`} autoComplete="off" />
      </label>
      <label className="flex min-w-0 flex-col gap-1">
        <span className="text-muted">{t('fMarketAsOf')}</span>
        <input type="date" name="marketValueAsOf" defaultValue={initial?.marketValueAsOf ?? ''} className={field} />
      </label>
      <label className="flex min-w-0 flex-col gap-1">
        <span className="text-muted">{t('fEnded')}</span>
        <input type="date" name="endedOn" defaultValue={initial?.endedOn ?? ''} className={field} />
      </label>
      <label className="flex min-w-0 flex-col gap-1">
        <span className="text-muted">{t('fNote')}</span>
        <input name="note" maxLength={300} defaultValue={initial?.note ?? ''} className={field} autoComplete="off" />
      </label>
      <div className="flex items-end sm:col-span-2 lg:col-span-4">
        <Button type="submit" size="sm" disabled={busy}>
          {t(initial ? 'saveMember' : 'addMember')}
        </Button>
      </div>
      {err && <div className="sm:col-span-2 lg:col-span-4"><ErrorNote code={err.code} requestId={err.requestId} namespace="admin.pension.err" /></div>}
    </form>
  );
}

export function RemoveMember({ employeeId }: { employeeId: string }) {
  const t = useTranslations('admin.pension');
  const { busy, err, send } = useCall();
  const [sure, setSure] = useState(false);
  return (
    <span className="flex flex-wrap items-center gap-2">
      {sure ? (
        <>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => send({ action: 'member.remove', employeeId })}>
            {t('removeYes')}
          </Button>
          <button type="button" className="min-h-9 px-2 text-sm text-muted" onClick={() => setSure(false)}>
            {t('cancel')}
          </button>
        </>
      ) : (
        <button type="button" className="min-h-9 px-2 text-sm text-muted" onClick={() => setSure(true)}>
          {t('remove')}
        </button>
      )}
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.pension.err" />}
    </span>
  );
}

export function MonthActions({ month, employeeIds }: { month: string; employeeIds: string[] }) {
  const t = useTranslations('admin.pension');
  const { busy, err, msg, setMsg, send } = useCall();
  const [paidOn, setPaidOn] = useState('');
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={async () => { const r = await send<{ made: number; skipped: number }>({ action: 'sync', month }); if (r) setMsg(t('synced', { made: r.made, skipped: r.skipped })); }}>
          {t('sync')}
        </Button>
        <a href={`/api/admin/payroll/pension/export?m=${month}`} className="inline-flex min-h-11 items-center rounded-button border border-border px-3 font-semibold lg:min-h-9">
          {t('export')}
        </a>
      </div>
      {employeeIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className={`${field} w-auto`} aria-label={t('paidOn')} />
          <Button type="button" size="sm" disabled={busy || !paidOn} onClick={async () => { const r = await send<{ marked: number }>({ action: 'paid', month, employeeIds, paidOn }); if (r) setMsg(t('markedPaid', { n: r.marked })); }}>
            {t('markPaid', { n: employeeIds.length })}
          </Button>
        </div>
      )}
      {msg && <p role="status" className="text-ok">{msg}</p>}
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.pension.err" />}
    </div>
  );
}

export function ManualForm({ people, month }: { people: Person[]; month: string }) {
  const t = useTranslations('admin.pension');
  const { busy, err, send } = useCall();
  return (
    <form
      className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        if (await send({ action: 'manual', ...Object.fromEntries(f) })) e.currentTarget?.reset();
      }}
    >
      <Select name="employeeId" required defaultValue="" className={field} aria-label={t('fEmployee')}>
        <option value="">{t('pick')}</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>
      <input type="month" name="month" required defaultValue={month} className={field} aria-label={t('fMonth')} />
      <input name="wageTotal" required inputMode="numeric" placeholder={t('fWage')} className={`num ${field}`} autoComplete="off" />
      <input name="note" maxLength={300} placeholder={t('fNote')} className={field} autoComplete="off" />
      <Button type="submit" size="sm" disabled={busy}>
        {t('manualSave')}
      </Button>
      {err && <div className="sm:col-span-2 lg:col-span-5"><ErrorNote code={err.code} requestId={err.requestId} namespace="admin.pension.err" /></div>}
    </form>
  );
}
