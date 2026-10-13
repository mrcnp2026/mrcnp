// 직원별 계약 · 세무 · 개인 항목의 입력 검사 (PRD v1.3 5 · 18.1장). 순수함수.
// ★ 추정하지 않는다: 연봉을 자동으로 12로 나누지 않고, 계약 이름에서 금액을 짐작하지 않고, 「모름」을 「아니오」로 치지 않는다.
//   빠진 값이 있으면 저장은 되지만 「설정 미완료」로 보이고, 그 직원의 급여 계산은 차단된다.
export const PAY_TYPES = ['MONTHLY', 'HOURLY', 'ANNUAL'] as const;
export type PayType = (typeof PAY_TYPES)[number];
export const TIME_BASES = ['ACTUAL', 'ROUNDED', 'SCHEDULE'] as const; // 실제 시간 / 끊은 급여용 시간 / 일정 시간
export type TimeBasis = (typeof TIME_BASES)[number];

export type ContractInput = {
  payType: PayType;
  amount: number; // 원. 월급 · 시급 · 연봉
  timeBasis: TimeBasis;
  monthlyHours: number | null; // 월 환산 시간 (월급 · 연봉에서 시급을 낼 때)
  annualDivisor: number | null; // 연봉을 월로 나누는 수
  included: { overtimeHours: number | null; holidayHours: number | null; note: string | null }; // 계약 금액에 이미 들어 있는 연장 · 휴일 시간
};
export type Result<T> = { ok: true; value: T } | { ok: false; code: string };

const num = (v: unknown): number | null | undefined => (v === null || v === undefined || v === '' ? null : typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);
const text = (v: unknown, max: number): string | null | undefined => {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string') return undefined;
  const s = v.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim();
  return s.length > max ? undefined : s || null;
};
const MAX_AMOUNT = 100_000_000_000; // 1천억 원 — 자릿수 실수를 막는 상한

export function validateContract(b: Record<string, unknown>): Result<ContractInput> {
  if (!(PAY_TYPES as readonly unknown[]).includes(b.payType)) return { ok: false, code: 'contract_pay_type' };
  if (!(TIME_BASES as readonly unknown[]).includes(b.timeBasis)) return { ok: false, code: 'contract_time_basis' };
  const amount = num(b.amount);
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0 || amount > MAX_AMOUNT) return { ok: false, code: 'contract_amount' };
  const payType = b.payType as PayType;
  const monthlyHours = num(b.monthlyHours);
  if (monthlyHours === undefined || (monthlyHours !== null && (monthlyHours <= 0 || monthlyHours > 744 || !Number.isInteger(monthlyHours * 100)))) return { ok: false, code: 'contract_monthly_hours' };
  if (payType === 'HOURLY' && monthlyHours !== null) return { ok: false, code: 'contract_monthly_hours' }; // 시급제에는 월 환산 시간이 없다
  const annualDivisor = num(b.annualDivisor);
  if (annualDivisor === undefined || (annualDivisor !== null && (annualDivisor <= 0 || annualDivisor > 24 || !Number.isInteger(annualDivisor * 100)))) return { ok: false, code: 'contract_annual_divisor' };
  if (payType !== 'ANNUAL' && annualDivisor !== null) return { ok: false, code: 'contract_annual_divisor' };
  const inc = (b.included && typeof b.included === 'object' ? b.included : {}) as Record<string, unknown>;
  const ot = num(inc.overtimeHours), hol = num(inc.holidayHours), note = text(inc.note, 300);
  const hours = (v: number | null | undefined) => v === null || (typeof v === 'number' && v >= 0 && v <= 744 && Number.isInteger(v * 100));
  if (!hours(ot) || !hours(hol) || note === undefined) return { ok: false, code: 'contract_included' };
  return { ok: true, value: { payType, amount, timeBasis: b.timeBasis as TimeBasis, monthlyHours, annualDivisor, included: { overtimeHours: ot as number | null, holidayHours: hol as number | null, note } } };
}

export const INSURERS = ['pension', 'health', 'employment', 'accident'] as const; // 국민연금 · 건강보험(장기요양은 건강보험을 따른다) · 고용보험 · 산재보험
export type Insurer = (typeof INSURERS)[number];
export type Tri = 'YES' | 'NO' | 'UNKNOWN';
export type InsuranceState = { state: Tri; reportedWage: number | null; note: string | null }; // 신고 보수(기준소득월액 · 보수월액), 제외 근거
export type TaxInput = {
  withholdingRatio: 80 | 100 | 120;
  familyCount: number; // 본인 포함
  childCount: number; // 8세 이상 20세 이하 자녀 (가족 수에 포함된 사람)
  insurance: Record<Insurer, InsuranceState>;
  studentLoan: { state: Tri; monthlyAmount: number | null };
};
export const UNKNOWN_TAX: TaxInput = {
  withholdingRatio: 100, familyCount: 1, childCount: 0,
  insurance: { pension: { state: 'UNKNOWN', reportedWage: null, note: null }, health: { state: 'UNKNOWN', reportedWage: null, note: null }, employment: { state: 'UNKNOWN', reportedWage: null, note: null }, accident: { state: 'UNKNOWN', reportedWage: null, note: null } },
  studentLoan: { state: 'UNKNOWN', monthlyAmount: null },
};
const tri = (v: unknown): v is Tri => v === 'YES' || v === 'NO' || v === 'UNKNOWN';

export function validateTax(b: Record<string, unknown>): Result<TaxInput> {
  if (b.withholdingRatio !== 80 && b.withholdingRatio !== 100 && b.withholdingRatio !== 120) return { ok: false, code: 'tax_ratio' };
  const family = num(b.familyCount), child = num(b.childCount);
  if (typeof family !== 'number' || !Number.isInteger(family) || family < 1 || family > 11) return { ok: false, code: 'tax_family' };
  if (typeof child !== 'number' || !Number.isInteger(child) || child < 0 || child > family - 1) return { ok: false, code: 'tax_child' }; // 자녀는 가족 수 안의 사람이다
  const src = (b.insurance && typeof b.insurance === 'object' ? b.insurance : {}) as Record<string, unknown>;
  const insurance = {} as Record<Insurer, InsuranceState>;
  for (const k of INSURERS) {
    const o = (src[k] && typeof src[k] === 'object' ? src[k] : {}) as Record<string, unknown>;
    const wage = num(o.reportedWage), note = text(o.note, 200);
    if (!tri(o.state) || wage === undefined || note === undefined || (wage !== null && (!Number.isInteger(wage) || wage < 0 || wage > MAX_AMOUNT))) return { ok: false, code: 'tax_insurance' };
    if (o.state === 'NO' && !note) return { ok: false, code: 'tax_insurance_reason' }; // 가입하지 않는다면 근거를 적는다
    insurance[k] = { state: o.state, reportedWage: wage, note };
  }
  const loan = (b.studentLoan && typeof b.studentLoan === 'object' ? b.studentLoan : {}) as Record<string, unknown>;
  const amt = num(loan.monthlyAmount);
  if (!tri(loan.state) || amt === undefined || (amt !== null && (!Number.isInteger(amt) || amt < 0 || amt > MAX_AMOUNT))) return { ok: false, code: 'tax_loan' };
  if (loan.state === 'YES' && amt === null) return { ok: false, code: 'tax_loan' };
  return { ok: true, value: { withholdingRatio: b.withholdingRatio, familyCount: family, childCount: child, insurance, studentLoan: { state: loan.state, monthlyAmount: loan.state === 'YES' ? amt : null } } };
}

export type ItemAssign = { itemCode: string; amount: number | null; note: string | null };
export function validateItemAssign(b: Record<string, unknown>): Result<ItemAssign> {
  const amount = num(b.amount), note = text(b.note, 300);
  if (typeof b.itemCode !== 'string' || !/^[A-Z0-9_]{2,40}$/.test(b.itemCode)) return { ok: false, code: 'item_code' };
  if (amount === undefined || (amount !== null && (!Number.isInteger(amount) || amount < 0 || amount > MAX_AMOUNT)) || note === undefined) return { ok: false, code: 'item_amount' };
  return { ok: true, value: { itemCode: b.itemCode, amount, note } };
}

/** 급여 계산을 하려면 더 필요한 것. 비어 있으면 준비됨 */
export type SetupGap = 'no_contract' | 'no_monthly_hours' | 'no_annual_divisor' | 'no_tax' | 'insurance_unknown' | 'no_joined_on';
export function setupGaps(args: { contract: Pick<ContractInput, 'payType' | 'monthlyHours' | 'annualDivisor'> | null; tax: Pick<TaxInput, 'insurance'> | null; joinedOn: string | null }): SetupGap[] {
  const out: SetupGap[] = [];
  if (!args.contract) out.push('no_contract');
  else {
    if (args.contract.payType !== 'HOURLY' && args.contract.monthlyHours === null) out.push('no_monthly_hours'); // 시급을 낼 수 없어 연장 · 야간 · 휴일 수당을 계산하지 못한다
    if (args.contract.payType === 'ANNUAL' && args.contract.annualDivisor === null) out.push('no_annual_divisor');
  }
  if (!args.tax) out.push('no_tax');
  else if (INSURERS.some((k) => args.tax!.insurance[k].state === 'UNKNOWN')) out.push('insurance_unknown');
  if (!args.joinedOn) out.push('no_joined_on');
  return out;
}

/** 참고용 통상시급(원, 반올림) — 화면에 보여 주기만 한다. 급여 계산은 정밀 계산 모듈이 따로 한다 */
export function referenceHourly(c: Pick<ContractInput, 'payType' | 'amount' | 'monthlyHours' | 'annualDivisor'>): number | null {
  if (c.payType === 'HOURLY') return c.amount;
  if (c.monthlyHours === null) return null;
  if (c.payType === 'MONTHLY') return Math.round(c.amount / c.monthlyHours);
  return c.annualDivisor === null ? null : Math.round(c.amount / c.annualDivisor / c.monthlyHours);
}

/** 그 날 적용되는 판 (시작일 ≤ 그 날 < 끝나는 날) */
export function versionAt<T extends { validFrom: string; validTo: string | null }>(rows: readonly T[], date: string): T | null {
  return rows.find((r) => r.validFrom <= date && (r.validTo === null || date < r.validTo)) ?? null;
}
