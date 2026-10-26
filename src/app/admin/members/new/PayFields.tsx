'use client';
// 직원 등록 중 급여 입력 (2026-10-25 의뢰인: 신규 직원 등록 때 급여 입력을 이어서). 급여를 볼 수 있는 최고관리자에게만 보인다.
// 금액을 비워 두면 급여는 건너뛰고 나중에 「사원별 급여」에서 넣는다. 보험 · 세금 · 공통 수당은 회사 기본값으로 따라간다.
import { Select } from '@/components/Select';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export type PayDefaults = { payType: 'MONTHLY' | 'HOURLY' | 'ANNUAL' | null; monthlyHours: number | null };
const field = 'min-h-11 w-full rounded-button border border-border bg-bg px-3 text-base text-text lg:min-h-9 lg:text-sm';

export function PayFields({ defaults }: { defaults: PayDefaults }) {
  const t = useTranslations('admin.staffPay');
  const tm = useTranslations('admin.members');
  const [payType, setPayType] = useState<'MONTHLY' | 'HOURLY' | 'ANNUAL'>(defaults.payType ?? 'MONTHLY');
  return (
    <fieldset className="flex flex-col gap-3 rounded-card border border-border p-4">
      <legend className="px-1 text-sm font-bold">{tm('payTitle')}</legend>
      <p className="text-sm text-muted">{tm('payHint')}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm text-muted">
          {t('colType')}
          <Select name="payType" value={payType} onChange={(e) => setPayType(e.target.value as typeof payType)} className={field}>
            {(['MONTHLY', 'HOURLY', 'ANNUAL'] as const).map((k) => (
              <option key={k} value={k}>{t(`payType.${k}`)}</option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          {t(`amountOf.${payType}`)}
          <input name="payAmount" type="number" inputMode="numeric" min="1" step="1" placeholder={tm('payAmountPh')} className={`num ${field}`} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          {t('fTimeBasis')}
          <Select name="payTimeBasis" defaultValue="ROUNDED" className={field}>
            {(['ROUNDED', 'ACTUAL', 'SCHEDULE'] as const).map((k) => (
              <option key={k} value={k}>{t(`timeBasis.${k}`)}</option>
            ))}
          </Select>
        </label>
        {payType !== 'HOURLY' && (
          <label className="flex flex-col gap-1 text-sm text-muted">
            {t('fMonthlyHours')}
            <input name="payMonthlyHours" type="number" inputMode="decimal" min="1" max="744" step="0.01" defaultValue={defaults.monthlyHours ?? ''} className={`num ${field}`} />
          </label>
        )}
        {payType === 'ANNUAL' && (
          <label className="flex flex-col gap-1 text-sm text-muted">
            {t('fDivisor')}
            <input name="payAnnualDivisor" type="number" inputMode="decimal" min="1" max="24" step="0.01" defaultValue={12} className={`num ${field}`} />
          </label>
        )}
      </div>
    </fieldset>
  );
}
