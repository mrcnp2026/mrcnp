'use client';
// 사원별 급여 › 세무의 「주민번호 · 계좌 (암호 보관)」 (급여-36). 화면에는 가린 값만 — 원문은 이유를 적고 「원문 보기」를 누른 그때만 받아 30초 뒤 지운다.
// 원문 보기 허락은 다른 관리자가 준다(기한 있음).
import { Select } from '@/components/Select';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';

type Kind = 'RRN' | 'FOREIGN_NO' | 'PASSPORT' | 'BANK';
type Row = { id: string; kind: Kind; masked: string };
type Grant = { id: string; adminId: string; grantedBy: string; reason: string; expiresAt: string };
type Err = { code: string; requestId?: string } | null;
const field = 'min-h-11 rounded-button border border-border bg-bg px-3 text-sm lg:min-h-9';
const NS = 'admin.staffPay.sens.err';
const SHOW_MS = 30_000;

function SensitiveLine({ employeeId, kind, row, canEdit }: { employeeId: string; kind: Kind; row: Row | null; canEdit: boolean }) {
  const t = useTranslations('admin.staffPay.sens');
  const router = useRouter();
  const [mode, setMode] = useState<'edit' | 'view' | 'off' | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Err>(null);
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    if (!shown) return;
    const h = setTimeout(() => setShown(null), SHOW_MS);
    return () => clearTimeout(h);
  }, [shown]);
  const send = async (body: Record<string, unknown>) => {
    setBusy(true);
    setErr(null);
    const r = await callApi<{ value?: string }>(`/api/admin/payroll/staff/${employeeId}`, body);
    setBusy(false);
    if (!r.ok) {
      setErr(r);
      return null;
    }
    return r.data;
  };
  const toggle = (m: typeof mode) => {
    setErr(null);
    setMode(mode === m ? null : m);
  };
  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="text-muted">{t(`kind.${kind}`)}</span>
        <span className={`num ${row ? 'font-bold' : 'text-faint'}`}>{(shown && /^\d{13}$/.test(shown) ? `${shown.slice(0, 6)}-${shown.slice(6)}` : shown) ?? row?.masked ?? t('none')}</span>
      </div>
      {shown && (
        <p role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-card bg-primary-tint px-3 py-2 text-xs text-primary">
          {t('shown')}
          <button type="button" className="min-h-9 font-bold underline" onClick={() => setShown(null)}>{t('hide')}</button>
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {canEdit && <Button type="button" size="sm" variant="outline" aria-expanded={mode === 'edit'} onClick={() => toggle('edit')}>{t(row ? 'replace' : 'add')}</Button>}
        {row && !shown && <Button type="button" size="sm" variant="outline" aria-expanded={mode === 'view'} onClick={() => toggle('view')}>{t('view')}</Button>}
        {row && <Button type="button" size="sm" variant="outline" aria-expanded={mode === 'off'} onClick={() => toggle('off')}>{t('disable')}</Button>}
      </div>
      {mode === 'edit' && (
        <form
          className="grid gap-3 rounded-card border border-border p-3 md:grid-cols-2"
          autoComplete="off"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const ok = await send({ action: 'sensitive.save', kind, value: f.get('value'), bank: f.get('bank'), needBasis: f.get('basis') });
            if (ok) {
              setMode(null);
              router.refresh();
            }
          }}
        >
          {kind === 'BANK' && (
            <label className="flex flex-col gap-1">
              <span className="font-bold">{t('fBank')}</span>
              <input name="bank" required maxLength={20} className={field} />
            </label>
          )}
          <label className="flex flex-col gap-1">
            <span className="font-bold">{t(kind === 'BANK' ? 'fAccount' : 'fValue')}</span>
            <input name="value" required maxLength={40} inputMode={kind === 'PASSPORT' ? 'text' : 'numeric'} autoComplete="off" spellCheck={false} placeholder={t(`ph.${kind}`)} className={`${field} num`} />
          </label>
          <label className="flex flex-col gap-1 md:col-span-2">
            <span className="font-bold">{t('fBasis')}</span>
            <input name="basis" required minLength={2} maxLength={300} defaultValue={t(`basis.${kind}`)} className={field} />
          </label>
          <div className="flex gap-2 md:col-span-2">
            <Button type="submit" size="sm" disabled={busy}>{t('save')}</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setMode(null)}>{t('close')}</Button>
          </div>
        </form>
      )}
      {mode === 'view' && row && (
        <form
          className="flex flex-col gap-2 rounded-card border border-border p-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const d = await send({ action: 'sensitive.view', recordId: row.id, reason: new FormData(e.currentTarget).get('reason') });
            if (d?.value) {
              setShown(d.value);
              setMode(null);
            }
          }}
        >
          <label className="flex flex-col gap-1">
            <span className="font-bold">{t('fReason')}</span>
            <input name="reason" required minLength={2} maxLength={300} placeholder={t('reasonPh')} className={field} />
          </label>
          <p className="text-xs text-muted">{t('viewNote')}</p>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy}>{t('view')}</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setMode(null)}>{t('close')}</Button>
          </div>
        </form>
      )}
      {mode === 'off' && row && (
        <div className="flex flex-wrap items-center gap-2 rounded-card border border-warn bg-warn-tint p-3 text-xs text-warn">
          <span className="flex-1">{t('disableNote')}</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={async () => {
              if (await send({ action: 'sensitive.disable', recordId: row.id })) {
                setMode(null);
                setShown(null);
                router.refresh();
              }
            }}
          >
            {t('disableYes')}
          </Button>
        </div>
      )}
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace={NS} />}
    </li>
  );
}

function GrantBox({ meId, grants, admins, days }: { meId: string; grants: Grant[]; admins: { id: string; name: string }[]; days: number[] }) {
  const t = useTranslations('admin.staffPay.sens');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Err>(null);
  const name = (id: string) => admins.find((a) => a.id === id)?.name ?? '';
  const day = (iso: string) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
  const mine = grants.find((g) => g.adminId === meId);
  const others = admins.filter((a) => a.id !== meId);
  const send = async (body: Record<string, unknown>) => {
    setBusy(true);
    setErr(null);
    const r = await callApi('/api/admin/payroll/sensitive-grants', body);
    setBusy(false);
    if (!r.ok) return setErr(r), false;
    router.refresh();
    return true;
  };
  return (
    <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
      <p className="font-bold">{t('grantTitle')}</p>
      <p className={mine ? 'text-ok' : 'text-muted'}>{mine ? t('grantMine', { d: day(mine.expiresAt) }) : t('grantNone')}</p>
      {grants.length > 0 && (
        <ul className="flex flex-col divide-y divide-border">
          {grants.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="min-w-0 flex-1">{t('grantLine', { who: name(g.adminId), d: day(g.expiresAt), reason: g.reason, by: name(g.grantedBy) })}</span>
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => send({ action: 'revoke', grantId: g.id })}>{t('revoke')}</Button>
            </li>
          ))}
        </ul>
      )}
      {others.length === 0 ? (
        <p className="text-xs text-faint">{t('grantNoOther')}</p>
      ) : (
        <form
          className="grid gap-3 md:grid-cols-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            if (await send({ action: 'grant', adminId: f.get('admin'), reason: f.get('reason'), days: Number(f.get('days')) })) e.currentTarget?.reset();
          }}
        >
          <label className="flex flex-col gap-1">
            <span className="font-bold">{t('grantTo')}</span>
            <Select name="admin" className={field}>
              {others.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-bold">{t('grantDays')}</span>
            <Select name="days" defaultValue={30} className={field}>
              {days.map((n) => <option key={n} value={n}>{t('daysN', { n })}</option>)}
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-bold">{t('grantReason')}</span>
            <input name="reason" required minLength={2} maxLength={300} placeholder={t('grantReasonPh')} className={field} />
          </label>
          <div className="md:col-span-3">
            <Button type="submit" size="sm" disabled={busy}>{t('grantGive')}</Button>
          </div>
        </form>
      )}
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace={NS} />}
    </div>
  );
}

export function SensitiveForms({ employeeId, kinds, rows, keyReady, meId, grants, admins, days }: { employeeId: string; kinds: Kind[]; rows: Row[]; keyReady: boolean; meId: string; grants: Grant[]; admins: { id: string; name: string }[]; days: number[] }) {
  const t = useTranslations('admin.staffPay.sens');
  return (
    <div className="text-sm">
      <p className="text-muted">{t('intro')}</p>
      {!keyReady && <p className="mt-2 rounded-card bg-warn-tint p-3 text-warn">{t('err.sensitive_key_missing')}</p>}
      <ul className="flex flex-col divide-y divide-border">
        {kinds.map((k) => <SensitiveLine key={k} employeeId={employeeId} kind={k} row={rows.find((r) => r.kind === k) ?? null} canEdit={keyReady} />)}
      </ul>
      <GrantBox meId={meId} grants={grants} admins={admins} days={days} />
    </div>
  );
}
