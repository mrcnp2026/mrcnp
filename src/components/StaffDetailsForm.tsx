'use client';
// 직원 개인 정보 — 생년월일 · 비상연락처 · 보유 자격증 · 차량 (묶음 17, 2026-10-16 의뢰인: 직원이 직접 넣고 관리자도 고친다).
// 평소에는 짧은 요약(세로를 짧게), [고치기]를 누르면 입력 칸. 비어 있으면 처음부터 입력 칸.
// 폰: 칸은 세로로 쌓고 짧은 칸만 두 개씩 — 가로 넘침 없음.
import { Pencil, Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';
import { ageOn, MAX_CERTS, MAX_CONTACTS, type Certificate, type EmergencyContact, type StaffDetails } from '@/lib/staff-details-rules';

const input = 'min-h-11 w-full min-w-0 rounded-button border border-border bg-bg px-3 text-base lg:min-h-10 lg:text-sm';

export function StaffDetailsForm({ endpoint, initial, today }: { endpoint: string; initial: StaffDetails; today: string }) {
  const t = useTranslations('details');
  const tc = useTranslations('common');
  const router = useRouter();
  const empty = !initial.birthDate && initial.emergencyContacts.length === 0 && initial.certificates.length === 0 && !initial.carModel && !initial.carNumber;
  const [editing, setEditing] = useState(empty);
  const [birthDate, setBirthDate] = useState(initial.birthDate ?? '');
  const [contacts, setContacts] = useState<EmergencyContact[]>(initial.emergencyContacts.length ? initial.emergencyContacts : [{ name: '', relation: '', phone: '' }]);
  const [certs, setCerts] = useState<Certificate[]>(initial.certificates);
  const [carModel, setCarModel] = useState(initial.carModel ?? '');
  const [carNumber, setCarNumber] = useState(initial.carNumber ?? '');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);

  if (!editing) {
    // 요약은 지금 칸의 값으로 — 저장 직후에도 바로 새 값이 보인다(빈 줄은 뺀다)
    const cs = contacts.filter((c) => c.name.trim() || c.phone.trim());
    const ks = certs.filter((c) => c.name.trim());
    const rows: { k: string; v: React.ReactNode }[] = [
      { k: 'birth', v: birthDate ? `${birthDate} (${t('age', { n: ageOn(birthDate, today) })})` : '–' },
      { k: 'contacts', v: cs.length ? cs.map((c, i) => <span key={i} className="block">{`${c.name.trim()}${c.relation.trim() ? ` (${c.relation.trim()})` : ''} · ${c.phone.trim()}`}</span>) : '–' },
      { k: 'certs', v: ks.length ? ks.map((c, i) => <span key={i} className="block">{[c.name.trim(), c.acquiredOn, c.number?.trim()].filter(Boolean).join(' · ')}</span>) : '–' },
      { k: 'car', v: carModel.trim() || carNumber.trim() ? [carModel.trim(), carNumber.trim()].filter(Boolean).join(' · ') : '–' },
    ];
    return (
      <div className="flex flex-col gap-2">
        <dl className="flex flex-col divide-y divide-border">
          {rows.map((r) => (
            <div key={r.k} className="flex gap-3 py-2 text-sm">
              <dt className="w-20 shrink-0 text-muted">{t(r.k)}</dt>
              <dd className="num min-w-0 flex-1 break-words">{r.v}</dd>
            </div>
          ))}
        </dl>
        {saved && <p role="status" className="text-sm font-semibold text-ok">{t('saved')}</p>}
        <button type="button" onClick={() => { setEditing(true); setSaved(false); }} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-button border border-border bg-bg px-4 text-sm font-semibold hover:bg-surface lg:min-h-9 lg:self-start">
          <Pencil aria-hidden size={16} />
          {t('edit')}
        </button>
      </div>
    );
  }

  const setC = (i: number, k: keyof EmergencyContact, v: string) => setContacts((xs) => xs.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const setK = (i: number, k: keyof Certificate, v: string) => setCerts((xs) => xs.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const removeBtn = (onClick: () => void, label: string) => (
    <button type="button" onClick={onClick} aria-label={label} className="flex size-11 shrink-0 items-center justify-center rounded-button text-muted hover:bg-surface lg:size-10">
      <X aria-hidden size={18} />
    </button>
  );
  const addBtn = (onClick: () => void, label: string) => (
    <button type="button" onClick={onClick} className="inline-flex min-h-10 items-center gap-1 self-start rounded-button px-2 text-sm font-semibold text-primary hover:bg-primary-tint">
      <Plus aria-hidden size={16} />
      {label}
    </button>
  );

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        const r = await callApi(endpoint, { birthDate, emergencyContacts: contacts, certificates: certs, carModel, carNumber });
        setBusy(false);
        if (!r.ok) return setErr(r);
        setSaved(true);
        setEditing(false);
        router.refresh();
      }}
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-bold">
          {t('birth')}
          {birthDate && /^\d{4}-\d{2}-\d{2}$/.test(birthDate) && <span className="ml-2 font-normal text-muted">{t('age', { n: ageOn(birthDate, today) })}</span>}
        </span>
        <input type="date" value={birthDate} max={today} min="1900-01-01" onChange={(e) => setBirthDate(e.target.value)} className={`${input} lg:w-56`} />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-bold">{t('contacts')} <span className="font-normal text-faint">{t('upTo', { n: MAX_CONTACTS })}</span></legend>
        {contacts.map((c, i) => (
          <div key={i} className="flex items-start gap-1 rounded-card border border-border p-2 lg:items-center lg:border-0 lg:p-0">
            <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 lg:grid-cols-[1fr_8rem_1fr]">
              <input aria-label={t('cName')} placeholder={t('cName')} value={c.name} maxLength={30} onChange={(e) => setC(i, 'name', e.target.value)} className={input} />
              <input aria-label={t('cRelation')} placeholder={t('cRelation')} value={c.relation} maxLength={20} onChange={(e) => setC(i, 'relation', e.target.value)} className={input} />
              <input aria-label={t('cPhone')} placeholder={t('cPhone')} value={c.phone} inputMode="tel" autoComplete="off" maxLength={20} onChange={(e) => setC(i, 'phone', e.target.value)} className={`${input} col-span-2 lg:col-span-1`} />
            </div>
            {removeBtn(() => setContacts((xs) => xs.filter((_, j) => j !== i)), t('remove'))}
          </div>
        ))}
        {contacts.length < MAX_CONTACTS && addBtn(() => setContacts((xs) => [...xs, { name: '', relation: '', phone: '' }]), t('addContact'))}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-bold">{t('certs')}</legend>
        {certs.map((c, i) => (
          <div key={i} className="flex items-start gap-1 rounded-card border border-border p-2 lg:items-center lg:border-0 lg:p-0">
            <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 lg:grid-cols-[1fr_10rem_10rem]">
              <input aria-label={t('kName')} placeholder={t('kName')} value={c.name} maxLength={60} onChange={(e) => setK(i, 'name', e.target.value)} className={`${input} col-span-2 lg:col-span-1`} />
              <input aria-label={t('kDate')} type="date" value={c.acquiredOn ?? ''} max={today} onChange={(e) => setK(i, 'acquiredOn', e.target.value)} className={input} />
              <input aria-label={t('kNumber')} placeholder={t('kNumber')} value={c.number ?? ''} maxLength={40} onChange={(e) => setK(i, 'number', e.target.value)} className={input} />
            </div>
            {removeBtn(() => setCerts((xs) => xs.filter((_, j) => j !== i)), t('remove'))}
          </div>
        ))}
        {certs.length === 0 && <p className="text-sm text-faint">{t('noCerts')}</p>}
        {certs.length < MAX_CERTS && addBtn(() => setCerts((xs) => [...xs, { name: '', acquiredOn: null, number: null }]), t('addCert'))}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-bold">{t('car')}</legend>
        <div className="grid grid-cols-2 gap-2 lg:max-w-md">
          <input aria-label={t('carModel')} placeholder={t('carModelPh')} value={carModel} maxLength={50} onChange={(e) => setCarModel(e.target.value)} className={input} />
          <input aria-label={t('carNumber')} placeholder={t('carNumberPh')} value={carNumber} maxLength={20} onChange={(e) => setCarNumber(e.target.value)} className={input} />
        </div>
      </fieldset>

      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="details" />}
      <div className="flex gap-2">
        {!empty && (
          <button type="button" onClick={() => setEditing(false)} className="min-h-11 flex-1 rounded-button border border-border bg-bg px-4 text-sm font-semibold lg:flex-none">
            {t('cancel')}
          </button>
        )}
        <Button type="submit" disabled={busy} className="flex-1 lg:flex-none">
          {busy ? tc('working') : t('save')}
        </Button>
      </div>
    </form>
  );
}
