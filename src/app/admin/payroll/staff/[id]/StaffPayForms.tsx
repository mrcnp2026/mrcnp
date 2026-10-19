'use client';
// 사원별 급여의 입력 양식 — 계약 · 세무/보험 · 개인 항목. 저장하면 화면을 새로 읽는다.
// 계약 · 세무는 「새 판으로 저장」이다: 적용 시작일과(고칠 때는) 사유를 적는다. 앞 판은 남는다.
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';
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

export function ContractForm({ employeeId, today, version, last }: { employeeId: string; today: string; version: number; last: (ContractInput & { validFrom: string }) | null }) {
  const t = useTranslations('admin.staffPay');
  const { busy, err, done, save } = useSave(employeeId);
  const [open, setOpen] = useState(false);
  const [payType, setPayType] = useState<PayType>(last?.payType ?? 'MONTHLY');
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
            <select name="payType" value={payType} onChange={(e) => setPayType(e.target.value as PayType)} className={field}>
              {PAY_TYPES.map((k) => (
                <option key={k} value={k}>
                  {t(`payType.${k}`)}
                </option>
              ))}
            </select>
          </Label>
          <Label text={t(`amountOf.${payType}`)}>
            <input name="amount" type="number" min="1" step="1" required defaultValue={last?.amount ?? ''} className={field} />
          </Label>
          <Label text={t('fTimeBasis')}>
            <select name="timeBasis" defaultValue={last?.timeBasis ?? 'ROUNDED'} className={field}>
              {TIME_BASES.map((k) => (
                <option key={k} value={k}>
                  {t(`timeBasis.${k}`)}
                </option>
              ))}
            </select>
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
            <input name="validFrom" type="date" required defaultValue={today} className={field} />
          </Label>
          <Label text={t(last ? 'fReason' : 'fReasonFirst')}>
            <input name="reason" required={!!last} minLength={last ? 2 : undefined} maxLength={500} className={field} autoComplete="off" />
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

export function TaxForm({ employeeId, today, version, last, reliefOn }: { employeeId: string; today: string; version: number; last: TaxInput | null; reliefOn: { sme: boolean; durunuri: boolean } }) {
  const t = useTranslations('admin.staffPay');
  const { busy, err, done, save } = useSave(employeeId);
  const [open, setOpen] = useState(false);
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
              },
            });
            if (ok) setOpen(false);
          }}
        >
          <Label text={t('fRatio')}>
            <select name="ratio" defaultValue={last?.withholdingRatio ?? 100} className={field}>
              {[80, 100, 120].map((k) => (
                <option key={k} value={k}>
                  {t('pct', { n: k })}
                </option>
              ))}
            </select>
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
                <select name={`${k}.state`} defaultValue={last?.insurance[k].state ?? 'UNKNOWN'} aria-label={t('fJoin', { name: t(`insurer.${k}`) })} className={field}>
                  {(['UNKNOWN', 'YES', 'NO'] as const).map((s) => (
                    <option key={s} value={s}>
                      {t(`tri.${s}`)}
                    </option>
                  ))}
                </select>
                <input name={`${k}.wage`} type="number" min="0" step="1" defaultValue={last?.insurance[k].reportedWage ?? ''} placeholder={t('fReported')} aria-label={t('fReported')} className={field} />
                <input name={`${k}.note`} maxLength={200} defaultValue={last?.insurance[k].note ?? ''} placeholder={t('fExclude')} aria-label={t('fExclude')} className={field} autoComplete="off" />
              </div>
            </fieldset>
          ))}
          <Label text={t('fLoan')}>
            <select name="loan.state" defaultValue={last?.studentLoan.state ?? 'UNKNOWN'} className={field}>
              {(['UNKNOWN', 'YES', 'NO'] as const).map((s) => (
                <option key={s} value={s}>
                  {t(`tri.${s}`)}
                </option>
              ))}
            </select>
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
                <select name="sme.state" defaultValue={last?.reliefs.sme.state ?? 'UNKNOWN'} className={field}>
                  {(['UNKNOWN', 'YES', 'NO'] as const).map((s) => (
                    <option key={s} value={s}>
                      {t(`tri.${s}`)}
                    </option>
                  ))}
                </select>
              </Label>
              <Label text={t('fSmeRate')}>
                <select name="sme.rate" defaultValue={last?.reliefs.sme.rate ?? ''} className={field}>
                  <option value="">{t('notSet')}</option>
                  {SME_RATES.map((n) => (
                    <option key={n} value={n}>
                      {t('pct', { n })}
                    </option>
                  ))}
                </select>
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
                <select name="duru.state" defaultValue={last?.reliefs.durunuri.state ?? 'UNKNOWN'} className={field}>
                  {(['UNKNOWN', 'YES', 'NO'] as const).map((s) => (
                    <option key={s} value={s}>
                      {t(`tri.${s}`)}
                    </option>
                  ))}
                </select>
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
          <Label text={t('fValidFrom')}>
            <input name="validFrom" type="date" required defaultValue={today} className={field} />
          </Label>
          <Label text={t(last ? 'fReason' : 'fReasonFirst')}>
            <input name="reason" required={!!last} minLength={last ? 2 : undefined} maxLength={500} className={field} autoComplete="off" />
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
            <select name="itemCode" className={field}>
              {options.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.label}
                </option>
              ))}
            </select>
          </Label>
          <Label text={t('fItemAmount')}>
            <input name="amount" type="number" min="0" step="1" className={field} />
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
