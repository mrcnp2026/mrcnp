'use client';
// 회사 설정 › 급여의 입력 양식들 (PRD v1.3 17장). 저장은 명시적 버튼으로만 하고, 저장하면 화면을 새로 읽는다.
// 다른 담당자가 먼저 저장했으면(409) 입력을 지우지 않고 안내만 보인다.
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';
import type { ItemRow } from '@/lib/payroll/data';
import { MANUAL_FIELDS, RATE_KINDS, type ReferenceKind } from '@/lib/payroll/reference';
import { CALC_KINDS, ORDINARY, type AllowanceKind, type AllowancePolicy, type EmployeeDefaults, type Ledger, type Masking, type SettingPayload, type SettingSection, type WorkingTime } from '@/lib/payroll/settings';

const field = 'min-h-9 w-full rounded-button border border-border bg-bg px-3 text-sm text-text';
const NS = 'admin.paySettings';
type Err = { code: string; requestId?: string } | null;

function usePost() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Err>(null);
  const [done, setDone] = useState(false);
  const post = async <T,>(path: string, body: Record<string, unknown>): Promise<T | null> => {
    setBusy(true);
    setErr(null);
    setDone(false);
    const r = await callApi<T>(path, body);
    setBusy(false);
    if (!r.ok) {
      setErr(r);
      return null;
    }
    setDone(true);
    router.refresh();
    return r.data;
  };
  return { busy, err, done, post };
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:items-start lg:gap-4">
      <span className="pt-2 font-bold">{label}</span>
      <span className="flex min-w-0 flex-col gap-1">
        {children}
        {hint && <span className="text-xs text-faint">{hint}</span>}
      </span>
    </label>
  );
}

function Foot({ busy, err, done, label }: { busy: boolean; err: Err; done: boolean; label: string }) {
  const t = useTranslations('admin.paySettings');
  const tc = useTranslations('common');
  return (
    <>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace={NS} />}
      {done && <p role="status" className="text-sm font-semibold text-ok">{t('saved')}</p>}
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? tc('working') : label}
        </Button>
      </div>
    </>
  );
}

/** 적용 시작일 + 사유 — 판을 쌓는 양식의 공통 칸. 첫 판에는 사유가 없어도 된다 */
function When({ first, today }: { first: boolean; today: string }) {
  const t = useTranslations('admin.paySettings');
  return (
    <>
      <Row label={t('validFrom')} hint={t('validFromHint')}>
        <input type="date" name="validFrom" required defaultValue={first ? today.slice(0, 4) + '-01-01' : ''} className={`num ${field} lg:max-w-56`} />
      </Row>
      <Row label={t('reason')} hint={first ? t('reasonFirstHint') : t('reasonHint')}>
        <input name="reason" required={!first} maxLength={500} className={field} autoComplete="off" />
      </Row>
    </>
  );
}

const opts = (list: readonly (string | number)[], label: (k: string) => string) =>
  list.map((k) => (
    <option key={k} value={k}>
      {label(String(k))}
    </option>
  ));

/** S01 · S02 · S08 · S09 — 회사 설정 한 화면 */
export function SettingForm({ section, current, version, today }: { section: SettingSection; current: SettingPayload | null; version: number; today: string }) {
  const t = useTranslations('admin.paySettings');
  const { busy, err, done, post } = usePost();
  const [mode, setMode] = useState((current as Ledger | null)?.payDayMode ?? 'MONTH_END');
  const e = current as EmployeeDefaults | null;
  const l = current as Ledger | null;
  const m = current as Masking | null;
  const w = current as WorkingTime | null;
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (ev) => {
        ev.preventDefault();
        const fd = new FormData(ev.currentTarget);
        const b: Record<string, unknown> = Object.fromEntries(fd);
        if (section === 'employee-defaults') Object.assign(b, { durunuri: fd.get('durunuri') === 'on', smeTaxCut: fd.get('smeTaxCut') === 'on' });
        await post(`/api/admin/payroll/settings/${section}`, { ...b, expectedVersion: version });
      }}
    >
      {section === 'employee-defaults' && (
        <>
          <Row label={t('s01.payType')} hint={t('s01.payTypeHint')}>
            <select name="payType" defaultValue={e?.payType ?? ''} className={`${field} lg:max-w-56`}>
              <option value="">{t('notChosen')}</option>
              {opts(['MONTHLY', 'HOURLY', 'ANNUAL'], (k) => t(`payType.${k}`))}
            </select>
          </Row>
          <Row label={t('s01.durunuri')} hint={t('s01.durunuriHint')}>
            <span className="flex min-h-9 items-center gap-2">
              <input type="checkbox" name="durunuri" defaultChecked={e?.durunuri ?? false} className="size-5 accent-primary" />
              {t('use')}
            </span>
          </Row>
          <Row label={t('s01.smeTaxCut')} hint={t('s01.smeTaxCutHint')}>
            <span className="flex min-h-9 items-center gap-2">
              <input type="checkbox" name="smeTaxCut" defaultChecked={e?.smeTaxCut ?? false} className="size-5 accent-primary" />
              {t('use')}
            </span>
          </Row>
        </>
      )}
      {section === 'ledger' && (
        <>
          <Row label={t('s02.payMonth')}>
            <select name="payMonth" defaultValue={l?.payMonth ?? 'CURRENT'} className={`${field} lg:max-w-56`}>
              {opts(['CURRENT', 'NEXT'], (k) => t(`s02.payMonthOf.${k}`))}
            </select>
          </Row>
          <Row label={t('s02.payDay')} hint={t('s02.payDayHint')}>
            <span className="flex flex-wrap items-center gap-2">
              <select name="payDayMode" value={mode} onChange={(ev) => setMode(ev.target.value as Ledger['payDayMode'])} className={`${field} lg:max-w-40`}>
                {opts(['MONTH_END', 'FIXED_DAY'], (k) => t(`s02.payDayModeOf.${k}`))}
              </select>
              {mode === 'FIXED_DAY' && <input name="payDay" type="number" min={1} max={31} required defaultValue={l?.payDay ?? ''} aria-label={t('s02.payDay')} className={`num ${field} max-w-24`} />}
            </span>
          </Row>
          <Row label={t('s02.holidayShift')} hint={t('s02.holidayShiftHint')}>
            <select name="holidayShift" defaultValue={l?.holidayShift ?? ''} className={`${field} lg:max-w-72`}>
              <option value="">{t('notChosen')}</option>
              {opts(['KEEP', 'PREV_BUSINESS_DAY', 'NEXT_BUSINESS_DAY'], (k) => t(`s02.holidayShiftOf.${k}`))}
            </select>
          </Row>
          <Row label={t('s02.insuranceBasis')} hint={t('s02.insuranceBasisHint')}>
            <select name="insuranceBasis" defaultValue={l?.insuranceBasis ?? 'NOTICE'} className={`${field} lg:max-w-md`}>
              {opts(['NOTICE', 'PAYROLL_BASE', 'REPORTED_BASE'], (k) => t(`s02.insuranceBasisOf.${k}`))}
            </select>
          </Row>
          <Row label={t('s02.withholding')} hint={t('s02.withholdingHint')}>
            <select name="withholdingRatio" defaultValue={l?.withholdingRatio ?? 100} className={`num ${field} lg:max-w-32`}>
              {opts([80, 100, 120], (k) => `${k}%`)}
            </select>
          </Row>
        </>
      )}
      {section === 'masking' && (
        <Row label={t('s08.minutes')} hint={t('s08.minutesHint')}>
          <input name="unmaskMinutes" type="number" min={1} max={60} required defaultValue={m?.unmaskMinutes ?? 5} className={`num ${field} lg:max-w-32`} />
        </Row>
      )}
      {section === 'working-time' && (
        <>
          <Row label={t('s09.weekly')}>
            <input name="weeklyHours" type="number" min={1} max={52} required defaultValue={w?.weeklyHours ?? 40} className={`num ${field} lg:max-w-32`} />
          </Row>
          <Row label={t('s09.overtime')} hint={t('s09.overtimeHint')}>
            <input name="weeklyOvertimeLimit" type="number" min={0} max={40} required defaultValue={w?.weeklyOvertimeLimit ?? 12} className={`num ${field} lg:max-w-32`} />
          </Row>
          <Row label={t('s09.monthly')} hint={t('s09.monthlyHint')}>
            <input name="monthlyHours" type="number" min={1} max={400} defaultValue={w?.monthlyHours ?? ''} className={`num ${field} lg:max-w-32`} />
          </Row>
        </>
      )}
      <When first={version === 0} today={today} />
      <Foot busy={busy} err={err} done={done} label={t('save')} />
    </form>
  );
}

/** S03 · S04 — 항목 등록 · 고침 (고치면 새 판) */
export function ItemForm({ kind, item, today }: { kind: 'PAYMENT' | 'DEDUCTION'; item?: ItemRow; today: string }) {
  const t = useTranslations('admin.paySettings');
  const { busy, err, done, post } = usePost();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (ev) => {
        ev.preventDefault();
        const fd = new FormData(ev.currentTarget);
        await post('/api/admin/payroll/items', { ...Object.fromEntries(fd), kind, code: item?.code ?? fd.get('code'), fixedAllowance: fd.get('fixedAllowance') === 'on', expectedVersion: item?.version ?? 0 });
      }}
    >
      {!item && (
        <Row label={t('item.code')} hint={t('item.codeHint')}>
          <input name="code" required pattern="[A-Za-z0-9_]{2,40}" maxLength={40} className={`num ${field} lg:max-w-72`} autoComplete="off" />
        </Row>
      )}
      <Row label={t('item.koName')}>
        <input name="koName" required maxLength={60} defaultValue={item?.koName ?? ''} className={field} autoComplete="off" />
      </Row>
      <Row label={t('item.enName')}>
        <input name="enName" required maxLength={60} defaultValue={item?.enName ?? ''} className={field} autoComplete="off" />
      </Row>
      <Row label={t('item.calcKind')} hint={t('item.calcKindHint')}>
        <select name="calcKind" defaultValue={item?.calcKind ?? 'FIXED'} className={`${field} lg:max-w-72`}>
          {opts(CALC_KINDS, (k) => t(`calcKind.${k}`))}
        </select>
      </Row>
      <Row label={t('item.amount')} hint={t('item.amountHint')}>
        <input name="defaultAmount" inputMode="numeric" pattern="[0-9,]*" defaultValue={item?.defaultAmount ?? ''} className={`num ${field} lg:max-w-56`} autoComplete="off" />
      </Row>
      {kind === 'PAYMENT' && (
        <>
          <Row label={t('item.fixed')}>
            <span className="flex min-h-9 items-center gap-2">
              <input type="checkbox" name="fixedAllowance" defaultChecked={item?.fixedAllowance ?? false} className="size-5 accent-primary" />
              {t('item.fixedYes')}
            </span>
          </Row>
          <Row label={t('item.tax')} hint={t('item.taxHint')}>
            <select name="taxTreatment" defaultValue={item?.taxTreatment ?? 'TAXABLE'} className={`${field} lg:max-w-72`}>
              {opts(['TAXABLE', 'EXEMPT', 'PARTIAL'], (k) => t(`tax.${k}`))}
            </select>
          </Row>
          <Row label={t('item.limit')} hint={t('item.limitHint')}>
            <input name="taxExemptLimit" inputMode="numeric" pattern="[0-9,]*" defaultValue={item?.taxExemptLimit ?? ''} className={`num ${field} lg:max-w-56`} autoComplete="off" />
          </Row>
          <Row label={t('item.ordinary')} hint={t('item.ordinaryHint')}>
            <select name="ordinaryWage" defaultValue={item?.ordinaryWage ?? 'UNKNOWN'} className={`${field} lg:max-w-72`}>
              {opts(ORDINARY, (k) => t(`ordinary.${k}`))}
            </select>
          </Row>
        </>
      )}
      <Row label={t('item.sort')}>
        <input name="sort" type="number" min={0} max={9999} defaultValue={item?.sort ?? 0} className={`num ${field} lg:max-w-32`} />
      </Row>
      <When first={!item} today={today} />
      <Foot busy={busy} err={err} done={done} label={t(item ? 'saveNew' : 'add')} />
    </form>
  );
}

/** 사용 여부 스위치 (항목 · 수당). 사용중지는 앞으로 안 쓴다는 뜻이고 지우지 않는다 */
export function UseToggle({ path, id, on, label }: { path: string; id: string; on: boolean; label: string }) {
  const t = useTranslations('admin.paySettings');
  const { busy, err, post } = usePost();
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={busy} onClick={() => post(path, { action: 'use', id, inUse: !on })} className={`inline-flex h-8 min-w-16 items-center justify-center rounded-chip px-3 text-xs font-bold ${on ? 'bg-primary text-on-primary' : 'bg-surface text-muted'}`}>
        {t(on ? 'inUse' : 'notInUse')}
      </button>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace={NS} />}
    </span>
  );
}

/** 통상 쓰는 값 한꺼번에 넣기 — 전부 「임시」로 들어간다 */
export function SeedButton({ path, label }: { path: string; label: string }) {
  const { busy, err, post } = usePost();
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => post(path, { action: 'seed' })}>
        {label}
      </Button>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace={NS} />}
    </span>
  );
}

/** S07 — 수당의 회사 기준 */
export function AllowanceForm({ kind, current, version, today }: { kind: AllowanceKind; current: AllowancePolicy | null; version: number; today: string }) {
  const t = useTranslations('admin.paySettings');
  const { busy, err, done, post } = usePost();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (ev) => {
        ev.preventDefault();
        await post('/api/admin/payroll/policies', { ...Object.fromEntries(new FormData(ev.currentTarget)), kind, expectedVersion: version });
      }}
    >
      <Row label={t(kind === 'shutdown' ? 's07.share' : 's07.premium')} hint={t(kind === 'shutdown' ? 's07.shareHint' : 's07.premiumHint')}>
        <input name="premium" inputMode="decimal" pattern="[0-9](\.[0-9]{1,4})?" defaultValue={current?.premium ?? ''} className={`num ${field} lg:max-w-32`} autoComplete="off" />
      </Row>
      {kind === 'holiday' && (
        <Row label={t('s07.premiumOver8h')} hint={t('s07.premiumOver8hHint')}>
          <input name="premiumOver8h" inputMode="decimal" pattern="[0-9](\.[0-9]{1,4})?" defaultValue={current?.premiumOver8h ?? ''} className={`num ${field} lg:max-w-32`} autoComplete="off" />
        </Row>
      )}
      <Row label={t('s07.note')}>
        <input name="note" maxLength={300} defaultValue={current?.note ?? ''} className={field} autoComplete="off" />
      </Row>
      <When first={version === 0} today={today} />
      <Foot busy={busy} err={err} done={done} label={t('saveNew')} />
    </form>
  );
}

/** 「임시 → 검증됨」 — 경영지원실의 검증 결과를 근거와 함께 남긴다 */
export function VerifyButton({ target, id, verified }: { target: 'setting' | 'item' | 'policy' | 'reference'; id: string; verified: boolean }) {
  const t = useTranslations('admin.paySettings');
  const { busy, err, post } = usePost();
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-bold text-primary underline">
        {t(verified ? 'verify.undo' : 'verify.mark')}
      </button>
    );
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={async (ev) => {
        ev.preventDefault();
        if (await post('/api/admin/payroll/verify', { target, id, state: verified ? 'TEMPORARY' : 'VERIFIED', note: new FormData(ev.currentTarget).get('note') })) setOpen(false);
      }}
    >
      <input name="note" required={!verified} maxLength={500} placeholder={t('verify.note')} aria-label={t('verify.note')} className={`${field} lg:w-80`} autoComplete="off" />
      <Button type="submit" size="sm" disabled={busy}>
        {t(verified ? 'verify.undo' : 'verify.mark')}
      </Button>
      <button type="button" onClick={() => setOpen(false)} className="min-h-9 px-2 text-sm text-muted">
        {t('cancel')}
      </button>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace={NS} />}
    </form>
  );
}

/** 수집 결과 가져오기 — 수집기가 만든 파일(latest.json · tax-bands-….json)을 올리면 「검토 대기」로 들어간다 */
export function ImportForm() {
  const t = useTranslations('admin.paySettings');
  const { busy, err, post } = usePost();
  const [out, setOut] = useState<{ staged: number; unchanged: number; skipped: { source: string; why: string }[] } | null>(null);
  const [bad, setBad] = useState(false);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (ev) => {
        ev.preventDefault();
        const fd = new FormData(ev.currentTarget);
        setBad(false);
        setOut(null);
        try {
          const read = async (k: string) => {
            const f = fd.get(k);
            return f instanceof File && f.size > 0 ? JSON.parse(await f.text()) : null;
          };
          const latest = await read('latest');
          if (!latest) return setBad(true);
          const r = await post<typeof out>('/api/admin/payroll/reference', { action: 'import', latest, bands: await read('bands') });
          if (r) setOut(r);
        } catch {
          setBad(true);
        }
      }}
    >
      <Row label={t('import.latest')} hint={t('import.latestHint')}>
        <input type="file" name="latest" accept="application/json,.json" required className="text-sm" />
      </Row>
      <Row label={t('import.bands')} hint={t('import.bandsHint')}>
        <input type="file" name="bands" accept="application/json,.json" className="text-sm" />
      </Row>
      {bad && <p role="alert" className="text-sm text-warn">{t('import.bad')}</p>}
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace={NS} />}
      {out && (
        <p role="status" className="rounded-button bg-ok-tint p-3 text-sm text-ok">
          {t('import.result', { staged: out.staged, unchanged: out.unchanged, skipped: out.skipped.length })}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={busy}>
          {t('import.submit')}
        </Button>
      </div>
    </form>
  );
}

/** 직접 입력 — 수집기가 읽지 못하는 자료. 근거를 꼭 적고, 이것도 「검토 대기」로 들어간다 */
export function ManualForm({ kinds }: { kinds: ReferenceKind[] }) {
  const t = useTranslations('admin.paySettings');
  const { busy, err, done, post } = usePost();
  const list = kinds.filter((k) => MANUAL_FIELDS[k]);
  const [kind, setKind] = useState<ReferenceKind>(list.includes('employment.rate') ? 'employment.rate' : list[0]);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (ev) => {
        ev.preventDefault();
        if (await post('/api/admin/payroll/reference', { action: 'manual', kind, ...Object.fromEntries(new FormData(ev.currentTarget)) })) ev.currentTarget?.reset();
      }}
    >
      <Row label={t('manual.kind')}>
        <select value={kind} onChange={(ev) => setKind(ev.target.value as ReferenceKind)} className={`${field} lg:max-w-72`}>
          {opts(list, (k) => t(`ref.${k.replace('.', '_')}`))}
        </select>
      </Row>
      {(MANUAL_FIELDS[kind] ?? []).map((f) => (
        <Row key={`${kind}.${f.key}`} label={t(`refField.${f.key}`)} hint={t(`unit.${f.type}`)}>
          <input name={f.key} required={!f.optional} inputMode="decimal" className={`num ${field} lg:max-w-56`} autoComplete="off" />
        </Row>
      ))}
      <Row label={t('validFrom')} hint={t('manual.validFromHint')}>
        <input type="date" name="validFrom" className={`num ${field} lg:max-w-56`} />
      </Row>
      <Row label={t('manual.source')} hint={t('manual.sourceHint')}>
        <input name="sourceNote" required maxLength={300} className={field} autoComplete="off" />
      </Row>
      <Foot busy={busy} err={err} done={done} label={t('manual.submit')} />
    </form>
  );
}

/** 「확인 후 반영」 · 반려 — 관리자가 본 바로 그 값(hash)으로만 승인된다 */
export function ReviewForm({ id, payloadHash, validFrom, validTo, suggestFrom }: { id: string; payloadHash: string; validFrom: string | null; validTo: string | null; suggestFrom: string | null }) {
  const t = useTranslations('admin.paySettings');
  const { busy, err, post } = usePost();
  return (
    <form
      className="flex flex-col gap-3 border-t border-border pt-3"
      onSubmit={async (ev) => {
        ev.preventDefault();
        const action = ((ev.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value ?? 'approve';
        await post('/api/admin/payroll/reference', { action, id, payloadHash, ...Object.fromEntries(new FormData(ev.currentTarget)) });
      }}
    >
      <div className="grid gap-3 lg:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-bold">
          {t('review.from')}
          <input type="date" name="validFrom" defaultValue={validFrom ?? suggestFrom ?? ''} className={`num font-normal ${field}`} />
          {!validFrom && <span className="text-xs font-normal text-warn">{t('review.fromMissing')}</span>}
        </label>
        <label className="flex flex-col gap-1 text-sm font-bold">
          {t('review.to')}
          <input type="date" name="validTo" defaultValue={validTo ?? ''} className={`num font-normal ${field}`} />
          <span className="text-xs font-normal text-faint">{t('review.toHint')}</span>
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm font-bold">
        {t('review.reason')}
        <input name="reason" required maxLength={500} className={`font-normal ${field}`} autoComplete="off" />
      </label>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace={NS} />}
      <div className="flex justify-end gap-2">
        <Button type="submit" name="action" value="reject" size="sm" variant="outline" disabled={busy}>
          {t('review.reject')}
        </Button>
        <Button type="submit" name="action" value="approve" size="sm" disabled={busy}>
          {t('review.approve')}
        </Button>
      </div>
    </form>
  );
}

type Est = { baseTax: number; childAdjust: number; afterChild: number; ratio: number; incomeTax: number; localTax: number; band: { from: number; to: number | null } | null; tableFrom: string | null; ruleFrom: string | null; temporary: boolean };

/** S06 계산기 — 월 과세급여 · 가족 수 · 자녀 수 · 비율로 소득세를 조회한다. 결과는 저장되지 않는다 */
export function TaxCalc({ today }: { today: string }) {
  const t = useTranslations('admin.paySettings');
  const { busy, err, post } = usePost();
  const [r, setR] = useState<Est | null>(null);
  const won = (n: number) => t('won', { n });
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (ev) => {
        ev.preventDefault();
        const b = Object.fromEntries(new FormData(ev.currentTarget));
        setR(null);
        setR(await post<Est>('/api/admin/payroll/tax/estimate', { ...b, wage: String(b.wage).replace(/,/g, '') }));
      }}
    >
      <div className="grid gap-3 lg:grid-cols-5">
        <label className="flex flex-col gap-1 text-sm font-bold">
          {t('calc.payDate')}
          <input type="date" name="payDate" required defaultValue={today} className={`num font-normal ${field}`} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-bold">
          {t('calc.wage')}
          <input name="wage" required inputMode="numeric" pattern="[0-9,]+" className={`num font-normal ${field}`} autoComplete="off" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-bold">
          {t('calc.family')}
          <select name="family" defaultValue={1} className={`num font-normal ${field}`}>
            {opts([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], (k) => k)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-bold">
          {t('calc.children')}
          <select name="children" defaultValue={0} className={`num font-normal ${field}`}>
            {opts([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], (k) => k)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-bold">
          {t('calc.ratio')}
          <select name="ratio" defaultValue={100} className={`num font-normal ${field}`}>
            {opts([80, 100, 120], (k) => `${k}%`)}
          </select>
        </label>
      </div>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace={NS} />}
      {r && (
        <dl className="num grid gap-x-6 gap-y-1 rounded-button bg-surface p-3 text-sm lg:grid-cols-3">
          {(
            [
              ['calc.base', won(r.baseTax)],
              ['calc.childAdjust', won(r.childAdjust)],
              ['calc.afterRatio', `${won(r.afterChild)} × ${r.ratio}%`],
              ['calc.incomeTax', won(r.incomeTax)],
              ['calc.localTax', won(r.localTax)],
              ['calc.table', r.tableFrom ?? ''],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-2">
              <dt className="text-muted">{t(k)}</dt>
              <dd className={k === 'calc.incomeTax' ? 'font-bold text-primary' : 'font-bold'}>{v}</dd>
            </div>
          ))}
          {r.temporary && <p className="text-xs text-warn lg:col-span-3">{t('calc.temporary')}</p>}
        </dl>
      )}
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={busy}>
          {t('calc.submit')}
        </Button>
      </div>
    </form>
  );
}

export const RATE_KIND_LIST = RATE_KINDS;
