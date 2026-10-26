'use client';
// 직원 정보 수정 — 등록 화면과 같은 칸 (EmployeeFields) + 내국인/외국인 (2026-10-23 의뢰인: 「국적 · 체류 상세」 단추를 없애고 고치기 안에서 고른다).
// 저장하면 고친 사람이 변경 기록에 남는다.
import { Select } from '@/components/Select';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';
import { COUNTRIES, VISAS, type ForeignInfo } from '@/lib/foreign-rules';
import { EmployeeFields, type EmployeeValues, type OrgOption } from '../EmployeeFields';

const finput = 'min-h-11 w-full min-w-0 rounded-button border border-border bg-bg px-3 text-base text-text';
const flabel = 'flex min-w-0 flex-col gap-1 text-sm text-muted';

export function ProfileForm({ employeeId, initial, groups, jobs, foreign, today, onDone }: { employeeId: string; initial: EmployeeValues; groups: OrgOption[]; jobs: OrgOption[]; foreign: ForeignInfo; today: string; onDone?: () => void }) {
  const t = useTranslations('admin.members');
  const tc = useTranslations('common');
  const tf = useTranslations('details.foreign');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  const known = (COUNTRIES as readonly string[]).includes(foreign.nationality ?? '');
  const [nat, setNat] = useState(foreign.nationality ? (known ? foreign.nationality : 'OTHER') : '');
  const [other, setOther] = useState(foreign.nationality && !known ? foreign.nationality : '');
  const [visaType, setVisaType] = useState(foreign.visaType ?? '');
  const [stayUntil, setStayUntil] = useState(foreign.stayUntil ?? '');
  const [firstWork, setFirstWork] = useState(foreign.firstWorkInKorea ?? '');
  const [englishName, setEnglishName] = useState(foreign.englishName ?? '');
  const [permit, setPermit] = useState(foreign.activityPermitUntil ?? '');
  const [visit, setVisit] = useState(foreign.immigrationVisitOn ?? '');
  const [dorm, setDorm] = useState(foreign.dormitory ?? '');
  const country = (c: string) => (tf.has(`country.${c}`) ? tf(`country.${c}`) : c);
  const chosen = nat === 'OTHER' ? other.trim().toUpperCase() : nat;
  return (
    <form
      className="flex flex-col gap-6"
      onChange={() => setSaved(false)}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        setSaved(false);
        const r = await callApi(`/api/admin/employees/${employeeId}/profile`, Object.fromEntries(new FormData(e.currentTarget)));
        if (!r.ok) {
          setBusy(false);
          return setErr(r);
        }
        const fr = await callApi(
          `/api/admin/employees/${employeeId}/foreign`,
          chosen
            ? { nationality: chosen, visaType: visaType || null, stayUntil: stayUntil || null, firstWorkInKorea: firstWork || null, englishName: englishName || null, activityPermitUntil: permit || null, immigrationVisitOn: visit || null, dormitory: dorm || null }
            : { nationality: null, visaType: null, stayUntil: null, firstWorkInKorea: null, englishName: null, activityPermitUntil: null, immigrationVisitOn: null, dormitory: null },
        );
        setBusy(false);
        if (!fr.ok) return setErr(fr);
        setSaved(true);
        router.refresh();
        onDone?.();
      }}
    >
      <EmployeeFields initial={initial} groups={groups} jobs={jobs} today={today} />
      <fieldset className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-bold text-primary">{tf('cell')}</legend>
        <label className={flabel}>
          {tf('nationality')}
          <Select value={nat} onChange={(e) => setNat(e.target.value)} className={finput}>
            <option value="">{tf('domestic')}</option>
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>
                {country(c)}
              </option>
            ))}
            <option value="OTHER">{tf('otherCountry')}</option>
          </Select>
        </label>
        {nat === 'OTHER' && (
          <label className={flabel}>
            {tf('otherCode')}
            <input value={other} onChange={(e) => setOther(e.target.value)} maxLength={2} className={`${finput} uppercase`} autoComplete="off" />
          </label>
        )}
        {chosen && (
          <>
            <label className={flabel}>
              {tf('visa')}
              <input value={visaType} onChange={(e) => setVisaType(e.target.value)} list="visa-list" maxLength={10} placeholder="E-9" className={`${finput} uppercase`} autoComplete="off" />
              <datalist id="visa-list">
                {VISAS.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </label>
            <label className={flabel}>
              {tf('stayUntil')}
              <input type="date" value={stayUntil} onChange={(e) => setStayUntil(e.target.value)} className={finput} />
            </label>
            <label className={flabel}>
              {tf('firstWork')}
              <input type="date" value={firstWork} max={today} onChange={(e) => setFirstWork(e.target.value)} className={finput} />
            </label>
            <label className={flabel}>
              {tf('englishName')}
              <input value={englishName} onChange={(e) => setEnglishName(e.target.value)} maxLength={60} className={`${finput} uppercase`} autoComplete="off" />
            </label>
            <label className={flabel}>
              {tf('dormitory')}
              <input value={dorm} onChange={(e) => setDorm(e.target.value)} maxLength={100} className={finput} autoComplete="off" />
            </label>
            <label className={flabel}>
              {tf('permit')}
              <input type="date" value={permit} onChange={(e) => setPermit(e.target.value)} className={finput} />
            </label>
            <label className={flabel}>
              {tf('visit')}
              <input type="date" value={visit} onChange={(e) => setVisit(e.target.value)} className={finput} />
            </label>
          </>
        )}
      </fieldset>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.members" />}
      {saved && <p role="status" className="text-sm font-semibold text-ok">{t('profileSaved')}</p>}
      <div className="flex gap-2">
        {onDone && (
          <button type="button" onClick={onDone} className="min-h-12 flex-1 rounded-button border border-border bg-bg px-4 text-sm font-semibold lg:flex-none">
            {t('profileCancel')}
          </button>
        )}
        <Button type="submit" disabled={busy} className="flex-1 lg:flex-none lg:px-8">
          {busy ? tc('working') : t('profileSave')}
        </Button>
      </div>
    </form>
  );
}
