'use client';
// 회사 설정 › 급여의 입력 양식들 (PRD v1.3 17장). 저장은 명시적 버튼으로만 하고, 저장하면 화면을 새로 읽는다.
// 다른 담당자가 먼저 저장했으면(409) 입력을 지우지 않고 안내만 보인다.
import { CommonItemsEditor } from './CommonItemsEditor';
import { Select } from '@/components/Select';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { useSaveRule } from '@/components/useSaveRule';
import { Button, Explain, em } from '@/components/ui';
import type { ItemRow } from '@/lib/payroll/data';
import { guessAverageKind, guessTax } from '@/lib/payroll/item-picks';
import { MANUAL_FIELDS, RATE_KINDS, type ReferenceKind } from '@/lib/payroll/reference';
import { AVERAGE_KINDS, CALC_KINDS, INSURER_KEYS, ORDINARY, type AllowanceKind, type AllowancePolicy, type EmployeeDefaults, type Ledger, type Masking, type SettingPayload, type SettingSection, type WorkingTime } from '@/lib/payroll/settings';

export const field = 'min-h-9 w-full rounded-button border border-border bg-bg px-3 text-sm text-text';
export const NS = 'admin.paySettings';
type Err = { code: string; requestId?: string } | null;

export function usePost() {
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

// explain: 항목 밑 설명 상자(components/ui Explain) — 있으면 짧은 hint 대신. 누르면 칸이 바뀌지 않게 label 밖에 둔다
function Row({ label, hint, explain, children }: { label: string; hint?: string; explain?: ReactNode; children: ReactNode }) {
  const row = (
    <label className="flex flex-col gap-1 text-sm lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:items-start lg:gap-4">
      <span className="pt-2 font-bold">{label}</span>
      <span className="flex min-w-0 flex-col gap-1">
        {children}
        {hint && !explain && <span className="text-xs text-faint">{hint}</span>}
      </span>
    </label>
  );
  if (!explain) return row;
  return (
    <div className="flex flex-col gap-2">
      {row}
      <div className="lg:pl-[calc(14rem+1rem)]">{explain}</div>
    </div>
  );
}

// still: 처음 값에서 바뀐 것이 없다 — 저장 단추를 끈다 (저장 규칙, components/useSaveRule)
function Foot({ busy, err, done, label, still = false }: { busy: boolean; err: Err; done: boolean; label: string; still?: boolean }) {
  const t = useTranslations('admin.paySettings');
  const tc = useTranslations('common');
  return (
    <>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace={NS} />}
      {done && <p role="status" className="text-sm font-semibold text-ok">{t('saved')}</p>}
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={busy || still}>
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
export function SettingForm({ section, current, version, today, common }: { section: SettingSection; current: SettingPayload | null; version: number; today: string; common?: { options: { code: string; label: string; defaultAmount: number | null }[]; people: { id: string; name: string }[] } }) {
  const t = useTranslations('admin.paySettings');
  const { busy, err, done, post } = usePost();
  const [mode, setMode] = useState((current as Ledger | null)?.payDayMode ?? 'MONTH_END');
  const e = current as EmployeeDefaults | null;
  const l = current as Ledger | null;
  const m = current as Masking | null;
  const w = current as WorkingTime | null;
  const rule = useSaveRule();
  return (
    <form
      ref={rule.ref}
      className="flex flex-col gap-4"
      onSubmit={async (ev) => {
        ev.preventDefault();
        const fd = new FormData(ev.currentTarget);
        const b: Record<string, unknown> = Object.fromEntries(fd);
        if (section === 'employee-defaults') {
          Object.assign(b, { smeTaxCut: fd.get('smeTaxCut') === 'on' }); // 두루누리는 쓰지 않는다 (2026-10-22)
          // 4대보험 회사 기본 (2026-10-25) — 넷 다 고르면 쓰고, 모두 비워 두면 쓰지 않는다
          b.taxDefaults = { insurance: Object.fromEntries(['pension', 'health', 'employment', 'accident'].map((k) => [k, fd.get(`ins.${k}`) || null])) };
          for (const k of ['pension', 'health', 'employment', 'accident']) delete b[`ins.${k}`];
        }
        if (section === 'masking') b.enabled = fd.get('enabled') === 'on';
        if (section === 'ledger') {
          Object.assign(b, { deductUnpaidLeave: fd.get('deductUnpaidLeave') === 'on', deductLateness: fd.get('deductLateness') === 'on', insuranceBasisOf: Object.fromEntries(INSURER_KEYS.map((k) => [k, fd.get(`basis.${k}`) || null])) });
          for (const k of INSURER_KEYS) delete b[`basis.${k}`];
        }
        if (await post(`/api/admin/payroll/settings/${section}`, { ...b, expectedVersion: version })) rule.settle();
      }}
    >
      {section === 'employee-defaults' && (
        <>
          <Row label={t('s01.insTitle')} hint={t('s01.insHint')}>
            <div className="grid gap-2 sm:grid-cols-2">
              {(['pension', 'health', 'employment', 'accident'] as const).map((k) => (
                <label key={k} className="flex flex-col gap-1 text-sm text-muted">
                  {t(`s01.insurer.${k}`)}
                  <Select name={`ins.${k}`} defaultValue={e?.taxDefaults?.insurance[k] ?? ''} className={field}>
                    <option value="">{t('s01.insNotSet')}</option>
                    <option value="YES">{t('s01.insYes')}</option>
                    <option value="NO">{t('s01.insNo')}</option>
                  </Select>
                </label>
              ))}
            </div>
            <p className="pt-2 text-xs text-faint">{t('s01.insNote')}</p>
          </Row>
          {common && (
            <Row label={t('s01.commonTitle')} hint={t('s01.commonHint')}>
              <CommonItemsEditor initial={e?.commonItems ?? []} options={common.options} people={common.people} />
            </Row>
          )}
          <Row label={t('s01.smeTaxCut')} explain={<Explain link={{ href: 'https://www.nts.go.kr', label: t('s01.smeTaxCutLink') }}>{t.rich('s01.smeTaxCutExplain', { em })}</Explain>}>
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
            <Select name="payMonth" defaultValue={l?.payMonth ?? 'CURRENT'} className={`${field} lg:max-w-56`}>
              {opts(['CURRENT', 'NEXT'], (k) => t(`s02.payMonthOf.${k}`))}
            </Select>
          </Row>
          <Row label={t('s02.payDay')} hint={t('s02.payDayHint')}>
            <span className="flex flex-wrap items-center gap-2">
              <Select name="payDayMode" value={mode} onChange={(ev) => setMode(ev.target.value as Ledger['payDayMode'])} className={`${field} lg:max-w-40`}>
                {opts(['MONTH_END', 'FIXED_DAY'], (k) => t(`s02.payDayModeOf.${k}`))}
              </Select>
              {mode === 'FIXED_DAY' && <input name="payDay" type="number" min={1} max={31} required defaultValue={l?.payDay ?? ''} aria-label={t('s02.payDay')} className={`num ${field} max-w-24`} />}
            </span>
          </Row>
          <Row label={t('s02.holidayShift')} hint={t('s02.holidayShiftHint')}>
            <Select name="holidayShift" defaultValue={l?.holidayShift ?? ''} className={`${field} lg:max-w-72`}>
              <option value="">{t('notChosen')}</option>
              {opts(['KEEP', 'PREV_BUSINESS_DAY', 'NEXT_BUSINESS_DAY'], (k) => t(`s02.holidayShiftOf.${k}`))}
            </Select>
          </Row>
          <Row label={t('s02.insuranceBasis')} explain={<Explain link={{ href: '/admin/help?a=admin-insurance-basis', label: t('s02.insuranceBasisHelp') }}>{t.rich('s02.insuranceBasisExplain', { em })}</Explain>}>
            <Select name="insuranceBasis" defaultValue={l?.insuranceBasis ?? 'PAYROLL_BASE'} className={`${field} lg:max-w-md`}>
              {opts(['NOTICE', 'PAYROLL_BASE', 'REPORTED_BASE'], (k) => t(`s02.insuranceBasisOf.${k}`))}
            </Select>
          </Row>
          {/* 보험마다 따로 (2026-10-20) — 비우면 위 기준. 예: 연금 · 건강은 신고 보수, 고용은 그 달 급여 */}
          {INSURER_KEYS.map((k) => (
            <Row key={k} label={t(`s02.insurerOf.${k}`)} hint={k === 'pension' ? t('s02.insuranceEachHint') : undefined}>
              <Select name={`basis.${k}`} defaultValue={l?.insuranceBasisOf?.[k] ?? ''} className={`${field} lg:max-w-md`}>
                <option value="">{t('s02.insuranceSame')}</option>
                {opts(['NOTICE', 'PAYROLL_BASE', 'REPORTED_BASE'], (v) => t(`s02.insuranceBasisOf.${v}`))}
              </Select>
            </Row>
          ))}
          <Row label={t('s02.deductUnpaidLeave')} hint={t('s02.deductionHint')}>
            <span className="flex min-h-9 items-center gap-2"><input type="checkbox" name="deductUnpaidLeave" defaultChecked={l?.deductUnpaidLeave ?? false} className="size-5 accent-primary" />{t('use')}</span>
          </Row>
          <Row label={t('s02.deductLateness')} hint={t('s02.latenessHint')}>
            <span className="flex min-h-9 items-center gap-2"><input type="checkbox" name="deductLateness" defaultChecked={l?.deductLateness ?? false} className="size-5 accent-primary" />{t('use')}</span>
          </Row>
          <Row label={t('s02.premiumTimeBasis')} hint={t('s02.premiumTimeHint')}>
            <Select name="premiumTimeBasis" defaultValue={l?.premiumTimeBasis ?? 'ACTUAL'} className={field}>{opts(['ACTUAL', 'ROUNDED'], (k) => t(`s02.premiumTimeOf.${k}`))}</Select>
          </Row>
          <Row label={t('s02.withholding')} explain={<Explain>{t.rich('s02.withholdingExplain', { em })}</Explain>}>
            <Select name="withholdingRatio" defaultValue={l?.withholdingRatio ?? 100} className={`num ${field} lg:max-w-32`}>
              {opts([80, 100, 120], (k) => `${k}%`)}
            </Select>
          </Row>
        </>
      )}
      {section === 'masking' && (
        <>
          <Row label={t('s08.enabled')} hint={t('s08.enabledHint')}>
            <span className="flex min-h-9 items-center gap-2"><input type="checkbox" name="enabled" defaultChecked={m?.enabled ?? true} className="size-5 accent-primary" />{t('use')}</span>
          </Row>
          <Row label={t('s08.minutes')} hint={t('s08.minutesHint')}>
            <input name="unmaskMinutes" type="number" min={1} max={60} required defaultValue={m?.unmaskMinutes ?? 5} className={`num ${field} lg:max-w-32`} />
          </Row>
        </>
      )}
      {section === 'working-time' && (
        <>
          <Row label={t('s09.weekly')}>
            <input name="weeklyHours" type="number" min={1} max={52} required defaultValue={w?.weeklyHours ?? 40} className={`num ${field} lg:max-w-32`} />
          </Row>
          <Row label={t('s09.overtime')} explain={<Explain>{t.rich('s09.overtimeExplain', { em })}</Explain>}>
            <input name="weeklyOvertimeLimit" type="number" min={0} max={40} required defaultValue={w?.weeklyOvertimeLimit ?? 12} className={`num ${field} lg:max-w-32`} />
          </Row>
          <Row label={t('s09.monthly')} explain={<Explain>{t.rich('s09.monthlyExplain', { em })}</Explain>}>
            <input name="monthlyHours" type="number" min={1} max={400} defaultValue={w?.monthlyHours ?? ''} className={`num ${field} lg:max-w-32`} />
          </Row>
        </>
      )}
      <When first={version === 0} today={today} />
      <Foot busy={busy} err={err} done={done} label={t('save')} still={version > 0 && !rule.dirty} />
    </form>
  );
}

/** S03 · S04 — 항목 등록 · 고침 (고치면 새 판) */
export function ItemForm({ kind, item, today }: { kind: 'PAYMENT' | 'DEDUCTION'; item?: ItemRow; today: string }) {
  const t = useTranslations('admin.paySettings');
  const [name, setName] = useState(item?.koName ?? '');
  const guess = kind === 'PAYMENT' ? guessTax(name) : null; // 이름으로 짐작한 과세 구분 — 알려 주기만 한다 (2026-10-26)
  const avgGuess = kind === 'PAYMENT' ? guessAverageKind(name) : null; // 퇴직금 평균임금 구분도 이름으로 추천만 한다 (묶음 36)
  const { busy, err, done, post } = usePost();
  const rule = useSaveRule();
  return (
    <form
      ref={rule.ref}
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
        <input name="koName" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} className={field} autoComplete="off" />
      </Row>
      <Row label={t('item.enName')}>
        <input name="enName" required maxLength={60} defaultValue={item?.enName ?? ''} className={field} autoComplete="off" />
      </Row>
      <Row label={t('item.calcKind')} hint={t('item.calcKindHint')}>
        <Select name="calcKind" defaultValue={item?.calcKind ?? 'FIXED'} className={`${field} lg:max-w-72`}>
          {opts(CALC_KINDS, (k) => t(`calcKind.${k}`))}
        </Select>
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
          <Row label={t('item.tax')} hint={guess ? t('item.taxRec', { tax: t(`tax.${guess.tax}`) }) : t('item.taxHint')}>
            <Select name="taxTreatment" defaultValue={item?.taxTreatment ?? 'TAXABLE'} className={`${field} lg:max-w-72`}>
              {opts(['TAXABLE', 'EXEMPT', 'PARTIAL'], (k) => t(`tax.${k}`))}
            </Select>
          </Row>
          <Row label={t('item.limit')} hint={t('item.limitHint')}>
            <input name="taxExemptLimit" inputMode="numeric" pattern="[0-9,]*" defaultValue={item?.taxExemptLimit ?? ''} className={`num ${field} lg:max-w-56`} autoComplete="off" />
          </Row>
          <Row label={t('item.annualLimit')} hint={t('item.annualLimitHint')}>
            <input name="taxExemptAnnualLimit" inputMode="numeric" pattern="[0-9,]*" defaultValue={item?.taxExemptAnnualLimit ?? ''} className={`num ${field} lg:max-w-56`} autoComplete="off" />
          </Row>
          <Row label={t('item.ordinary')} hint={t('item.ordinaryHint')}>
            <Select name="ordinaryWage" defaultValue={item?.ordinaryWage ?? 'UNKNOWN'} className={`${field} lg:max-w-72`}>
              {opts(ORDINARY, (k) => t(`ordinary.${k}`))}
            </Select>
          </Row>
          <Row label={t('item.average')} hint={avgGuess ? t('item.averageRec', { kind: t(`averageShort.${avgGuess}`) }) : t('item.averageHint')}>
            <Select name="averageWageKind" defaultValue={item?.averageWageKind ?? ''} className={`${field} lg:max-w-72`}>
              <option value="">{t('average.NONE')}</option>
              {opts(AVERAGE_KINDS, (k) => t(`average.${k}`))}
            </Select>
          </Row>
        </>
      )}
      <Row label={t('item.sort')}>
        <input name="sort" type="number" min={0} max={9999} defaultValue={item?.sort ?? 0} className={`num ${field} lg:max-w-32`} />
      </Row>
      <When first={!item} today={today} />
      <Foot busy={busy} err={err} done={done} label={t(item ? 'saveNew' : 'add')} still={!!item && !rule.dirty} />
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
  // 급여대장 기본값도 같은 버튼을 쓴다(path만 다르다)
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
  const rule = useSaveRule();
  return (
    <form
      ref={rule.ref}
      className="flex flex-col gap-4"
      onSubmit={async (ev) => {
        ev.preventDefault();
        if (await post('/api/admin/payroll/policies', { ...Object.fromEntries(new FormData(ev.currentTarget)), kind, expectedVersion: version })) rule.settle();
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
      <Foot busy={busy} err={err} done={done} label={t('saveNew')} still={version > 0 && !rule.dirty} />
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
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-bold text-primary hover:underline">
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

type Run = { status: string; results: { source: string; ok: boolean; error?: string; found: number; staged?: number; unchanged?: number }[] };

/** 「지금 업데이트」 — 공식기관 원문을 지금 다시 받아 읽는다. 결과는 검토 대기로만 들어간다 */
export function RefreshButton() {
  const t = useTranslations('admin.paySettings');
  const { busy, err, post } = usePost();
  const [run, setRun] = useState<Run | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={busy}
          onClick={async () => {
            setRun(null);
            setRun(await post<Run>('/api/admin/payroll/reference/refresh', {}));
          }}
        >
          {busy ? t('refresh.running') : t('refresh.now')}
        </Button>
        <span className="text-xs text-faint">{t('refresh.note')}</span>
      </div>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.paySettings" />}
      {run && (
        <ul role="status" className="flex flex-col gap-1 rounded-button bg-surface p-3 text-sm">
          {run.results.map((r) => (
            <li key={r.source} className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold">{t(`refresh.source.${r.source}`)}</span>
              <span className={r.ok ? 'num text-muted' : 'text-warn'}>{r.ok ? t('refresh.okLine', { staged: r.staged ?? 0, unchanged: r.unchanged ?? 0 }) : t('refresh.failLine', { why: r.error ?? '' })}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
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
        <Select value={kind} onChange={(ev) => setKind(ev.target.value as ReferenceKind)} className={`${field} lg:max-w-72`}>
          {opts(list, (k) => t(`ref.${k.replace('.', '_')}`))}
        </Select>
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
          <Select name="family" defaultValue={1} className={`num font-normal ${field}`}>
            {opts([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], (k) => k)}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-bold">
          {t('calc.children')}
          <Select name="children" defaultValue={0} className={`num font-normal ${field}`}>
            {opts([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], (k) => k)}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-bold">
          {t('calc.ratio')}
          <Select name="ratio" defaultValue={100} className={`num font-normal ${field}`}>
            {opts([80, 100, 120], (k) => `${k}%`)}
          </Select>
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
