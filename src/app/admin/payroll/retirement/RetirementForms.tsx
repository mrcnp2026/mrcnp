'use client';
// 퇴직급여 건의 조작부 — 만들기 · 초안 고치기 · 확정 · 거두기 · 새 판. 처리하면 화면을 새로 읽는다.
// 넣는 동안 아래 「검산」이 바로 바뀐다(서버와 같은 계산 함수). 저장하면 서버가 다시 계산해 남긴다.
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';
import { calcRetirement, toRetirementInput, type RetirementInput } from '@/lib/payroll/retirement';

const field = 'num min-h-9 w-full rounded-button border border-border bg-bg px-3 text-sm';
type Err = { code: string; requestId?: string } | null;
const API = '/api/admin/payroll/retirement';

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

const NUMS = ['wage3m', 'days3m', 'bonus1y', 'leavePay1y', 'ordinaryDaily', 'excludedDays'] as const;
type Draft = Record<(typeof NUMS)[number], string> & { periodFrom: string; periodTo: string };
const toDraft = (i: RetirementInput): Draft => ({ periodFrom: i.periodFrom ?? '', periodTo: i.periodTo ?? '', wage3m: i.wage3m?.toString() ?? '', days3m: i.days3m?.toString() ?? '', bonus1y: i.bonus1y ? String(i.bonus1y) : '', leavePay1y: i.leavePay1y ? String(i.leavePay1y) : '', ordinaryDaily: i.ordinaryDaily?.toString() ?? '', excludedDays: i.excludedDays ? String(i.excludedDays) : '' });

/** 입력 칸 + 바로 보이는 검산. create면 건을 만들고, 아니면 초안을 고친다 */
export function CaseForm({ mode, employeeId, kind, id, initial, tax, live }: { mode: 'create' | 'update'; employeeId?: string; kind?: string; id?: string; initial: RetirementInput; tax?: { amount: number | null; basis: string | null }; live?: boolean }) {
  const t = useTranslations('admin.retirement');
  const { busy, err, send, router } = useCall();
  const [d, setD] = useState<Draft>(toDraft(initial));
  const [taxAmount, setTaxAmount] = useState(tax?.amount?.toString() ?? '');
  const [taxBasis, setTaxBasis] = useState(tax?.basis ?? '');
  const [saved, setSaved] = useState(false);
  const input = toRetirementInput(d);
  const r = calcRetirement(input);
  const set = (k: keyof Draft, v: string) => {
    setSaved(false);
    setD({ ...d, [k]: v });
  };
  const nf = (v: number | string | null) => (v === null ? t('blank') : Number(v).toLocaleString('ko-KR', { maximumFractionDigits: 2 }));
  return (
    <form
      className="flex flex-col gap-4 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        if (mode === 'create') {
          const made = await send<{ id: string }>({ action: 'create', employeeId, kind, input, ...(live ? { live: true } : {}) });
          if (made) router.push(`/admin/payroll/retirement/${made.id}`);
        } else if (await send({ action: 'update', id, input, taxAmount, taxBasis })) setSaved(true);
      }}
    >
      <div className="grid gap-3 md:grid-cols-4">
        {(['periodFrom', 'periodTo'] as const).map((k) => (
          <label key={k} className="flex flex-col gap-1">
            <span className="font-bold">{t(`f.${k}`)}</span>
            <input type="date" required value={d[k]} disabled={mode === 'update'} onChange={(e) => set(k, e.target.value)} className={field} />
          </label>
        ))}
        {NUMS.map((k) => (
          <label key={k} className="flex flex-col gap-1">
            <span className="font-bold">{t(`f.${k}`)}</span>
            <input name={k} inputMode="numeric" value={d[k]} onChange={(e) => set(k, e.target.value.replace(/[^\d]/g, ''))} className={field} autoComplete="off" />
          </label>
        ))}
      </div>
      <p className="text-xs text-faint">{t('fieldNote')}</p>
      <dl className="num grid gap-x-6 gap-y-1 rounded-card border border-border bg-surface p-3 md:grid-cols-2" data-check>
        {([['cService', r.serviceDays === null ? t('blank') : t('daysValue', { n: nf(r.serviceDays) })], ['cAverage', r.averageDaily === null ? t('blank') : t('won', { n: nf(r.averageDaily) })], ['cUsed', r.dailyUsed === null ? t('blank') : `${t('won', { n: nf(r.dailyUsed) })} (${t(r.usedOrdinary ? 'usedOrdinary' : 'usedAverage')})`], ['cAmount', r.amount === null ? t('noAmount') : t('won', { n: nf(r.amount) })]] as const).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3">
            <dt className="text-muted">{t(k)}</dt>
            <dd className={k === 'cAmount' ? 'font-extrabold' : ''}>{v}</dd>
          </div>
        ))}
      </dl>
      {r.missing.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-card border border-warn bg-warn-tint p-3 text-warn">
          {r.missing.map((m) => (
            <li key={m}>{t(`missing.${m}`)}</li>
          ))}
        </ul>
      )}
      {mode === 'update' && (
        <div className="grid gap-3 md:grid-cols-4">
          <label className="flex flex-col gap-1">
            <span className="font-bold">{t('f.taxAmount')}</span>
            <input name="taxAmount" inputMode="numeric" value={taxAmount} onChange={(e) => { setSaved(false); setTaxAmount(e.target.value.replace(/[^\d]/g, '')); }} className={field} autoComplete="off" />
          </label>
          <label className="flex flex-col gap-1 md:col-span-3">
            <span className="font-bold">{t('f.taxBasis')}</span>
            <input name="taxBasis" maxLength={300} value={taxBasis} onChange={(e) => { setSaved(false); setTaxBasis(e.target.value); }} className={field.replace('num ', '')} autoComplete="off" />
          </label>
          <p className="text-xs text-faint md:col-span-4">{t('taxNote')}</p>
        </div>
      )}
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.retirement" />}
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={busy}>
          {t(mode === 'create' ? 'createDo' : 'saveDo')}
        </Button>
        {saved && <span role="status" className="text-ok">{t('saved')}</span>}
      </div>
    </form>
  );
}

export function CaseActions({ id, state, kind, ready }: { id: string; state: string; kind: string; ready: boolean }) {
  const t = useTranslations('admin.retirement');
  const { busy, err, send, router } = useCall();
  const [mode, setMode] = useState<'finalize' | 'withdraw' | null>(null);
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {state === 'DRAFT' && kind !== 'ESTIMATE' && mode !== 'finalize' && (
          <Button type="button" size="sm" disabled={busy || !ready} onClick={() => setMode('finalize')}>
            {t('finalize')}
          </Button>
        )}
        {mode === 'finalize' && (
          <>
            <span className="text-warn">{t('finalizeConfirm')}</span>
            <Button type="button" size="sm" disabled={busy} onClick={async () => { await send({ action: 'finalize', id }); setMode(null); }}>
              {t('finalizeYes')}
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setMode(null)}>
              {t('cancel')}
            </Button>
          </>
        )}
        {state !== 'WITHDRAWN' && mode === null && (
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setMode('withdraw')}>
            {t('withdraw')}
          </Button>
        )}
        {state === 'WITHDRAWN' && kind !== 'ESTIMATE' && (
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={async () => { const made = await send<{ id: string }>({ action: 'revise', id }); if (made) router.push(`/admin/payroll/retirement/${made.id}`); }}>
            {t('revise')}
          </Button>
        )}
      </div>
      {mode === 'withdraw' && (
        <form className="flex flex-wrap items-center gap-2" onSubmit={async (e) => { e.preventDefault(); if (await send({ action: 'withdraw', id, reason: new FormData(e.currentTarget).get('reason') })) setMode(null); }}>
          <input name="reason" required minLength={2} maxLength={500} placeholder={t('withdrawReason')} aria-label={t('withdrawReason')} className="min-h-9 min-w-64 flex-1 rounded-button border border-border bg-bg px-3 text-sm" autoComplete="off" />
          <Button type="submit" size="sm" variant="outline" disabled={busy}>
            {t('withdrawDo')}
          </Button>
          <button type="button" onClick={() => setMode(null)} className="min-h-9 px-2 text-sm text-muted">
            {t('cancel')}
          </button>
        </form>
      )}
      {state === 'DRAFT' && kind !== 'ESTIMATE' && !ready && <p className="text-xs text-faint">{t('notReady')}</p>}
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.retirement" />}
    </div>
  );
}
