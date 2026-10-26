'use client';
// 사원별 급여의 입력 양식 — 계약 · 세무/보험 · 개인 항목. 저장하면 화면을 새로 읽는다.
// 계약 · 세무는 적용 시작일부터 바뀐다(이력이 남는다). 마지막 변경과 같은 날 다시 고치면 그 변경을 정정하고, 다른 날이면 사유를 적는다. 예약된(아직 시작 안 한) 변경은 취소할 수 있다.
import { Select } from '@/components/Select';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';
import { ItemAdd } from '@/app/admin/settings/pay/ItemWizard';
import { INSURERS, PAY_TYPES, SME_RATES, TIME_BASES, UNKNOWN_RELIEFS, type ContractInput, type PayType, type TaxInput } from '@/lib/payroll/contract';

const field = 'min-h-9 rounded-button border border-border bg-bg px-3 text-sm';
type Err = { code: string; requestId?: string } | null;

function useSave(employeeId: string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Err>(null);
  const [done, setDone] = useState(false);
  const save = async (body: Record<string, unknown>) => {
    setBusy(true);
    setErr(null);
    setDone(false);
    const r = await callApi(`/api/admin/payroll/staff/${employeeId}`, body);
    setBusy(false);
    if (!r.ok) {
      setErr(r);
      return false;
    }
    setDone(true);
    router.refresh();
    return true;
  };
  return { busy, err, done, save };
}
const Label = ({ text, children, wide = false }: { text: string; children: ReactNode; wide?: boolean }) => (
  <label className={`flex flex-col gap-1 ${wide ? 'md:col-span-2' : ''}`}>
    <span className="font-bold">{text}</span>
    {children}
  </label>
);

/** 찾는 고정 수당 · 공제 항목이 없을 때 여기서 바로 새로 만든다 (2026-10-25 의뢰인: 직접도 만들어 추가할 수 있어야). 통합설정의 항목 등록 안내를 그대로 쓴다 — 만들면 아래 고르는 칸에 바로 나타난다 */
export function NewItemCreate({ today }: { today: string }) {
  const t = useTranslations('admin.staffPay');
  const [kind, setKind] = useState<'PAYMENT' | 'DEDUCTION'>('PAYMENT');
  return (
    <div className="flex flex-col gap-2 rounded-card border border-border p-3">
      <p className="text-sm text-muted">{t('itemsCreateHint')}</p>
      <div className="flex gap-2" role="radiogroup" aria-label={t('itemsCreateTitle')}>
        {(['PAYMENT', 'DEDUCTION'] as const).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={`min-h-11 flex-1 rounded-button border px-3 text-sm font-bold ${kind === k ? 'border-primary bg-primary-tint text-primary' : 'border-border text-muted'}`}>
            {t(k === 'PAYMENT' ? 'kindPay' : 'kindDeduct')}
          </button>
        ))}
      </div>
      <ItemAdd key={kind} kind={kind} today={today} />
    </div>
  );
}

/** 아직 시작하지 않은(예약된) 변경 취소 — 이력 줄 끝의 단추 (2026-10-25 의뢰인) */
export function CancelVersionButton({ employeeId, kind, id }: { employeeId: string; kind: 'contract' | 'tax'; id: string }) {
  const t = useTranslations('admin.staffPay');
  const { busy, err, save } = useSave(employeeId);
  const [asking, setAsking] = useState(false);
  return (
    <span className="ml-2 inline-flex flex-wrap items-center gap-2 align-middle">
      {asking ? (
        <>
          <span className="text-warn">{t('cancelConfirm')}</span>
          <Button type="button" size="sm" disabled={busy} onClick={async () => { if (await save({ action: `${kind}.cancel`, versionId: id })) setAsking(false); }}>
            {t('cancelDo')}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setAsking(false)}>
            {t('cancelNo')}
          </Button>
        </>
      ) : (
        <Button type="button" size="sm" variant="outline" onClick={() => setAsking(true)}>
          {t('cancelScheduled')}
        </Button>
      )}
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.staffPay" />}
    </span>
  );
}

export function ContractForm({ employeeId, today, version, last }: { employeeId: string; today: string; version: number; last: (ContractInput & { validFrom: string }) | null }) {
  const t = useTranslations('admin.staffPay');
  const { busy, err, done, save } = useSave(employeeId);
  const [open, setOpen] = useState(false);
  const [payType, setPayType] = useState<PayType>(last?.payType ?? 'MONTHLY');
  const [from, setFrom] = useState(today); // 적용 시작일 — 마지막 변경과 같은 날이면 그 변경을 고치는 것(정정)이라 사유가 없어도 된다
  const needReason = !!last && from > last.validFrom;
  return (
    <div className="pt-3 text-sm">
      <Button type="button" size="sm" variant="outline" aria-expanded={open} onClick={() => setOpen(!open)}>
        {t(last ? 'contractEdit' : 'contractNew')}
      </Button>
      {done && <span role="status" className="ml-3 text-ok">{t('saved')}</span>}
      {open && (
        <form
          className="mt-3 grid gap-3 border-t border-border pt-3 md:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const ok = await save({
              action: 'contract', expectedVersion: version, validFrom: f.get('validFrom'), reason: f.get('reason') || null, payType, amount: f.get('amount'), timeBasis: f.get('timeBasis'),
              monthlyHours: payType === 'HOURLY' ? null : f.get('monthlyHours'), annualDivisor: payType === 'ANNUAL' ? f.get('annualDivisor') : null,
              included: { overtimeHours: f.get('ot'), holidayHours: f.get('hol'), note: f.get('incNote') || null },
            });
            if (ok) setOpen(false);
          }}
        >
          <Label text={t('colType')}>
            <Select name="payType" value={payType} onChange={(e) => setPayType(e.target.value as PayType)} className={field}>
              {PAY_TYPES.map((k) => (
                <option key={k} value={k}>
                  {t(`payType.${k}`)}
                </option>
              ))}
            </Select>
          </Label>
          <Label text={t(`amountOf.${payType}`)}>
            <input name="amount" type="number" min="1" step="1" required defaultValue={last?.amount ?? ''} className={field} />
          </Label>
          <Label text={t('fTimeBasis')}>
            <Select name="timeBasis" defaultValue={last?.timeBasis ?? 'ROUNDED'} className={field}>
              {TIME_BASES.map((k) => (
                <option key={k} value={k}>
                  {t(`timeBasis.${k}`)}
                </option>
              ))}
            </Select>
          </Label>
          {payType !== 'HOURLY' && (
            <Label text={t('fMonthlyHours')}>
              <input name="monthlyHours" type="number" min="1" max="744" step="0.01" defaultValue={last?.monthlyHours ?? ''} className={field} />
              <span className="text-xs font-normal text-faint">{t('monthlyHoursHint')}</span>
            </Label>
          )}
          {payType === 'ANNUAL' && (
            <Label text={t('fDivisor')}>
              <input name="annualDivisor" type="number" min="1" max="24" step="0.01" defaultValue={last?.annualDivisor ?? ''} className={field} />
              <span className="text-xs font-normal text-faint">{t('divisorHint')}</span>
            </Label>
          )}
          <Label text={t('fIncOt')}>
            <input name="ot" type="number" min="0" max="744" step="0.01" defaultValue={last?.included.overtimeHours ?? ''} className={field} />
          </Label>
          <Label text={t('fIncHol')}>
            <input name="hol" type="number" min="0" max="744" step="0.01" defaultValue={last?.included.holidayHours ?? ''} className={field} />
          </Label>
          <Label text={t('fIncNote')} wide>
            <input name="incNote" maxLength={300} defaultValue={last?.included.note ?? ''} className={field} autoComplete="off" />
          </Label>
          <Label text={t('fValidFrom')}>
            <input name="validFrom" type="date" required value={from} onChange={(e) => setFrom(e.target.value)} className={field} />
            <span className="text-xs font-normal text-faint">{last && from < last.validFrom ? t('validFromBefore', { date: last.validFrom }) : t(last && from === last.validFrom ? 'validFromSame' : 'validFromHint')}</span>
          </Label>
          <Label text={t(needReason ? 'fReason' : 'fReasonFirst')}>
            <input name="reason" required={needReason} minLength={needReason ? 2 : undefined} maxLength={500} className={field} autoComplete="off" />
          </Label>
          <p className="text-xs text-faint md:col-span-2">{t('contractHint')}</p>
          {err && (
            <div className="md:col-span-2">
              <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.staffPay" />
            </div>
          )}
          <div className="md:col-span-2">
            <Button type="submit" size="sm" disabled={busy}>
              {t('saveVersion')}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

export function TaxForm({ reportedUsed, employeeId, today, version, last, reliefOn, foreign = false }: { reportedUsed: Record<(typeof INSURERS)[number], boolean>; employeeId: string; today: string; version: number; last: (TaxInput & { validFrom: string }) | null; reliefOn: { sme: boolean; durunuri: boolean }; foreign?: boolean }) {
  const showFlat = foreign || last?.reliefs.flat19?.state === 'YES'; // 외국인 직원(묶음 31)이거나 이미 「예」인 사람만
  const t = useTranslations('admin.staffPay');
  const { busy, err, done, save } = useSave(employeeId);
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(today);
  const needReason = !!last && from > last.validFrom;
  const [insNo, setInsNo] = useState<Record<string, boolean>>(() => Object.fromEntries(INSURERS.map((k) => [k, last?.insurance[k].state === 'NO']))); // 「가입 안함」이면 사유가 꼭 필요하다
  return (
    <div className="pt-3 text-sm">
      <Button type="button" size="sm" variant="outline" aria-expanded={open} onClick={() => setOpen(!open)}>
        {t(last ? 'taxEdit' : 'taxNew')}
      </Button>
      {done && <span role="status" className="ml-3 text-ok">{t('saved')}</span>}
      {open && (
        <form
          className="mt-3 grid gap-3 border-t border-border pt-3 md:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const ok = await save({
              action: 'tax', expectedVersion: version, validFrom: f.get('validFrom'), reason: f.get('reason') || null,
              withholdingRatio: Number(f.get('ratio')), familyCount: f.get('family'), childCount: f.get('child'),
              insurance: Object.fromEntries(INSURERS.map((k) => [k, { state: f.get(`${k}.state`), reportedWage: f.get(`${k}.wage`), note: f.get(`${k}.note`) || null }])),
              studentLoan: { state: f.get('loan.state'), monthlyAmount: f.get('loan.amount'), from: f.get('loan.from') || null, to: f.get('loan.to') || null },
              // 회사가 끈 감면 · 지원은 화면에 없으니 앞 판의 값을 그대로 넘긴다(지우지 않는다)
              reliefs: {
                sme: reliefOn.sme ? { state: f.get('sme.state'), rate: f.get('sme.rate') || null, from: f.get('sme.from') || null, to: f.get('sme.to') || null, note: f.get('sme.note') || null } : (last?.reliefs.sme ?? UNKNOWN_RELIEFS.sme),
                durunuri: reliefOn.durunuri ? { state: f.get('duru.state'), pensionRate: f.get('duru.pension') || null, employmentRate: f.get('duru.employment') || null, from: f.get('duru.from') || null, to: f.get('duru.to') || null, note: f.get('duru.note') || null } : (last?.reliefs.durunuri ?? UNKNOWN_RELIEFS.durunuri),
                flat19: showFlat ? { state: f.get('flat.state'), from: f.get('flat.from') || null, to: f.get('flat.to') || null, note: f.get('flat.note') || null } : (last?.reliefs.flat19 ?? UNKNOWN_RELIEFS.flat19),
              },
            });
            if (ok) setOpen(false);
          }}
        >
          <Label text={t('fRatio')}>
            <Select name="ratio" defaultValue={last?.withholdingRatio ?? 100} className={field}>
              {[80, 100, 120].map((k) => (
                <option key={k} value={k}>
                  {t('pct', { n: k })}
                </option>
              ))}
            </Select>
          </Label>
          <span />
          <Label text={t('fFamilyCount')}>
            <input name="family" type="number" min="1" max="11" step="1" required defaultValue={last?.familyCount ?? 1} className={field} />
          </Label>
          <Label text={t('fChildCount')}>
            <input name="child" type="number" min="0" max="10" step="1" required defaultValue={last?.childCount ?? 0} className={field} />
          </Label>
          {INSURERS.map((k) => (
            <fieldset key={k} className="flex flex-col gap-2 rounded-button border border-border p-3 md:col-span-2">
              <legend className="px-1 font-bold">{t(`insurer.${k}`)}</legend>
              <div className="grid gap-2 md:grid-cols-3">
                <Select name={`${k}.state`} defaultValue={last?.insurance[k].state ?? 'UNKNOWN'} onChange={(ev) => setInsNo((m) => ({ ...m, [k]: ev.target.value === 'NO' }))} aria-label={t('fJoin', { name: t(`insurer.${k}`) })} className={field}>
                  {(['UNKNOWN', 'YES', 'NO'] as const).map((s) => (
                    <option key={s} value={s}>
                      {t(`tri.${s}`)}
                    </option>
                  ))}
                </Select>
                <input name={`${k}.wage`} type="number" min="0" step="1" defaultValue={last?.insurance[k].reportedWage ?? ''} placeholder={t('fReported')} aria-label={t('fReported')} className={field} />
                <input name={`${k}.note`} maxLength={200} defaultValue={last?.insurance[k].note ?? ''} placeholder={t(insNo[k] ? 'fExcludeNeed' : 'fExclude')} aria-label={t('fExclude')} required={insNo[k]} className={`${field} ${insNo[k] ? 'border-danger' : ''}`} autoComplete="off" />
              </div>
              {k !== 'accident' && <p className="text-xs text-faint">{t(reportedUsed[k] ? 'reportedUsedHint' : 'reportedUnusedHint')}</p>}
            </fieldset>
          ))}
          <Label text={t('fLoan')}>
            <Select name="loan.state" defaultValue={last?.studentLoan.state ?? 'UNKNOWN'} className={field}>
              {(['UNKNOWN', 'YES', 'NO'] as const).map((s) => (
                <option key={s} value={s}>
                  {t(`tri.${s}`)}
                </option>
              ))}
            </Select>
          </Label>
          <Label text={t('fLoanAmount')}>
            <input name="loan.amount" type="number" min="0" step="1" defaultValue={last?.studentLoan.monthlyAmount ?? ''} className={field} />
          </Label>
          <Label text={t('fLoanFrom')}>
            <input name="loan.from" type="date" defaultValue={last?.studentLoan.from ?? ''} className={field} />
          </Label>
          <Label text={t('fLoanTo')}>
            <input name="loan.to" type="date" defaultValue={last?.studentLoan.to ?? ''} className={field} />
          </Label>
          {reliefOn.sme && (
            <fieldset className="grid gap-2 rounded-button border border-border p-3 md:col-span-2 md:grid-cols-3">
              <legend className="px-1 font-bold">{t('smeTitle')}</legend>
              <Label text={t('fTarget')}>
                <Select name="sme.state" defaultValue={last?.reliefs.sme.state ?? 'UNKNOWN'} className={field}>
                  {(['UNKNOWN', 'YES', 'NO'] as const).map((s) => (
                    <option key={s} value={s}>
                      {t(`tri.${s}`)}
                    </option>
                  ))}
                </Select>
              </Label>
              <Label text={t('fSmeRate')}>
                <Select name="sme.rate" defaultValue={last?.reliefs.sme.rate ?? ''} className={field}>
                  <option value="">{t('notSet')}</option>
                  {SME_RATES.map((n) => (
                    <option key={n} value={n}>
                      {t('pct', { n })}
                    </option>
                  ))}
                </Select>
              </Label>
              <span className="hidden md:block" />
              <Label text={t('fReliefFrom')}>
                <input name="sme.from" type="date" defaultValue={last?.reliefs.sme.from ?? ''} className={field} />
              </Label>
              <Label text={t('fReliefTo')}>
                <input name="sme.to" type="date" defaultValue={last?.reliefs.sme.to ?? ''} className={field} />
              </Label>
              <Label text={t('fReliefNote')}>
                <input name="sme.note" maxLength={200} defaultValue={last?.reliefs.sme.note ?? ''} className={field} autoComplete="off" />
              </Label>
            </fieldset>
          )}
          {reliefOn.durunuri && (
            <fieldset className="grid gap-2 rounded-button border border-border p-3 md:col-span-2 md:grid-cols-3">
              <legend className="px-1 font-bold">{t('durunuriTitle')}</legend>
              <Label text={t('fTarget')}>
                <Select name="duru.state" defaultValue={last?.reliefs.durunuri.state ?? 'UNKNOWN'} className={field}>
                  {(['UNKNOWN', 'YES', 'NO'] as const).map((s) => (
                    <option key={s} value={s}>
                      {t(`tri.${s}`)}
                    </option>
                  ))}
                </Select>
              </Label>
              <Label text={t('fPensionRate')}>
                <input name="duru.pension" type="number" min="0" max="100" step="1" defaultValue={last?.reliefs.durunuri.pensionRate ?? ''} className={field} />
              </Label>
              <Label text={t('fEmploymentRate')}>
                <input name="duru.employment" type="number" min="0" max="100" step="1" defaultValue={last?.reliefs.durunuri.employmentRate ?? ''} className={field} />
              </Label>
              <Label text={t('fReliefFrom')}>
                <input name="duru.from" type="date" defaultValue={last?.reliefs.durunuri.from ?? ''} className={field} />
              </Label>
              <Label text={t('fReliefTo')}>
                <input name="duru.to" type="date" defaultValue={last?.reliefs.durunuri.to ?? ''} className={field} />
              </Label>
              <Label text={t('fReliefNote')}>
                <input name="duru.note" maxLength={200} defaultValue={last?.reliefs.durunuri.note ?? ''} className={field} autoComplete="off" />
              </Label>
            </fieldset>
          )}
          {(reliefOn.sme || reliefOn.durunuri) && <p className="text-xs text-faint md:col-span-2">{t('reliefHint')}</p>}
          {showFlat && (
            <fieldset className="grid gap-2 rounded-button border border-border p-3 md:col-span-2 md:grid-cols-3">
              <legend className="px-1 font-bold">{t('flat19Title')}</legend>
              <Label text={t('fTarget')}>
                <Select name="flat.state" defaultValue={last?.reliefs.flat19?.state ?? 'NO'} className={field}>
                  <option value="NO">{t('flat19No')}</option>
                  <option value="YES">{t('flat19Yes')}</option>
                </Select>
              </Label>
              <Label text={t('fReliefFrom')}>
                <input name="flat.from" type="date" defaultValue={last?.reliefs.flat19?.from ?? ''} className={field} />
              </Label>
              <Label text={t('fReliefTo')}>
                <input name="flat.to" type="date" defaultValue={last?.reliefs.flat19?.to ?? ''} className={field} />
              </Label>
              <Label text={t('fReliefNote')}>
                <input name="flat.note" maxLength={200} defaultValue={last?.reliefs.flat19?.note ?? ''} className={field} autoComplete="off" />
              </Label>
              <p className="text-xs text-faint md:col-span-2">{t('flat19Hint')}</p>
            </fieldset>
          )}
          <Label text={t('fValidFrom')}>
            <input name="validFrom" type="date" required value={from} onChange={(e) => setFrom(e.target.value)} className={field} />
            <span className="text-xs font-normal text-faint">{last && from < last.validFrom ? t('validFromBefore', { date: last.validFrom }) : t(last && from === last.validFrom ? 'validFromSame' : 'validFromHint')}</span>
          </Label>
          <Label text={t(needReason ? 'fReason' : 'fReasonFirst')}>
            <input name="reason" required={needReason} minLength={needReason ? 2 : undefined} maxLength={500} className={field} autoComplete="off" />
          </Label>
          <p className="text-xs text-faint md:col-span-2">{t('taxHint')}</p>
          {err && (
            <div className="md:col-span-2">
              <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.staffPay" />
            </div>
          )}
          <div className="md:col-span-2">
            <Button type="submit" size="sm" disabled={busy}>
              {t('saveVersion')}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

export function ItemForms({ employeeId, today, options, rows }: { employeeId: string; today: string; options: { code: string; label: string; defaultAmount: number | null }[]; rows: { id: string; name: string; amount: string | null; note: string | null; validFrom: string; validTo: string | null }[] }) {
  const t = useTranslations('admin.staffPay');
  const { busy, err, save } = useSave(employeeId);
  const [pick, setPick] = useState(options[0]?.code ?? '');
  const picked = options.find((o) => o.code === pick);
  const needAmount = !picked || picked.defaultAmount === null; // 기본 금액이 있는 항목만 금액을 비울 수 있다 (2026-10-25)
  return (
    <div className="flex flex-col gap-3 pt-3 text-sm">
      {rows.length > 0 && (
        <div className="overflow-x-auto table-ruled">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface text-left">
                {[t('colItem'), t('colAmount'), t('colPeriod'), t('colNote'), t('colEnd')].map((h) => (
                  <th key={h} scope="col" className="px-3 py-2.5 text-xs font-semibold whitespace-nowrap text-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-2 font-bold">{r.name}</td>
                  <td className="num px-3 py-2">{r.amount ?? t('itemDefault')}</td>
                  <td className="num px-3 py-2 whitespace-nowrap">{r.validTo ? t('period', { from: r.validFrom, to: r.validTo }) : t('periodOpen', { from: r.validFrom })}</td>
                  <td className="px-3 py-2 text-muted">{r.note ?? ''}</td>
                  <td className="px-3 py-2">
                    {!r.validTo && (
                      <form
                        className="flex items-center gap-2"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          await save({ action: 'item.end', itemId: r.id, endOn: new FormData(e.currentTarget).get('endOn') });
                        }}
                      >
                        <input name="endOn" type="date" required defaultValue={today} aria-label={t('fEndOn')} className={field} />
                        <Button type="submit" size="sm" variant="outline" disabled={busy}>
                          {t('itemEnd')}
                        </Button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {options.length === 0 ? (
        <p className="text-warn">{t('itemsNone')}</p>
      ) : (
        <form
          className="grid gap-3 md:grid-cols-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const el = e.currentTarget;
            const f = new FormData(el);
            if (await save({ action: 'item.add', itemCode: f.get('itemCode'), amount: f.get('amount'), note: f.get('note') || null, validFrom: f.get('validFrom') })) el.reset();
          }}
        >
          <Label text={t('colItem')}>
            <Select name="itemCode" value={pick} onChange={(e) => setPick(e.target.value)} className={field}>
              {options.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Label>
          <Label text={t('fItemAmount')}>
            <input name="amount" type="number" min="0" step="1" required={needAmount} placeholder={picked?.defaultAmount != null ? t('itemDefaultIs', { n: picked.defaultAmount }) : ''} className={field} />
          </Label>
          <Label text={t('fValidFrom')}>
            <input name="validFrom" type="date" required defaultValue={today} className={field} />
          </Label>
          <Label text={t('colNote')}>
            <input name="note" maxLength={300} className={field} autoComplete="off" />
          </Label>
          <div className="md:col-span-4">
            <Button type="submit" size="sm" disabled={busy}>
              {t('itemAdd')}
            </Button>
          </div>
        </form>
      )}
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.staffPay" />}
    </div>
  );
}
