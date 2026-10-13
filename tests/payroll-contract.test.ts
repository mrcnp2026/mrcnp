// 직원별 계약 · 세무 · 개인 항목의 입력 검사
import { describe, expect, it } from 'vitest';
import { referenceHourly, setupGaps, UNKNOWN_TAX, validateContract, validateItemAssign, validateTax } from '@/lib/payroll/contract';

const base = { payType: 'MONTHLY', amount: 3000000, timeBasis: 'ROUNDED', monthlyHours: 209, annualDivisor: null, included: { overtimeHours: null, holidayHours: null, note: null } };
const value = (r: ReturnType<typeof validateContract>) => (r.ok ? r.value : r.code);

describe('계약', () => {
  it('월급 · 시급 · 연봉', () => {
    expect(value(validateContract(base))).toEqual(base);
    expect(validateContract({ ...base, payType: 'HOURLY', amount: 12000, monthlyHours: null }).ok).toBe(true);
    expect(validateContract({ ...base, payType: 'ANNUAL', amount: 48000000, annualDivisor: 12 }).ok).toBe(true);
  });
  it('양식에서 온 글자 숫자도 받는다', () => {
    expect(value(validateContract({ ...base, amount: '3000000', monthlyHours: '209', included: { overtimeHours: '40', holidayHours: '', note: ' 고정 연장 ' } }))).toMatchObject({ amount: 3000000, monthlyHours: 209, included: { overtimeHours: 40, holidayHours: null, note: '고정 연장' } });
  });
  it('틀린 값은 거부', () => {
    expect(value(validateContract({ ...base, payType: 'WEEKLY' }))).toBe('contract_pay_type');
    expect(value(validateContract({ ...base, timeBasis: 'x' }))).toBe('contract_time_basis');
    for (const amount of [0, -1, 1.5, '', null, 'abc', 100_000_000_001]) expect(value(validateContract({ ...base, amount })), String(amount)).toBe('contract_amount');
    expect(value(validateContract({ ...base, monthlyHours: 0 }))).toBe('contract_monthly_hours');
    expect(value(validateContract({ ...base, payType: 'HOURLY', amount: 12000 }))).toBe('contract_monthly_hours'); // 시급제에 월 환산 시간
    expect(value(validateContract({ ...base, annualDivisor: 12 }))).toBe('contract_annual_divisor'); // 월급제에 연봉 나누는 수
    expect(value(validateContract({ ...base, included: { overtimeHours: -1 } }))).toBe('contract_included');
  });
  it('연봉을 나누는 수 · 월 환산 시간은 비워서 저장할 수 있다(추정하지 않고 미완료로 둔다)', () => {
    const r = validateContract({ ...base, payType: 'ANNUAL', amount: 48000000, monthlyHours: null, annualDivisor: null });
    expect(r.ok).toBe(true);
  });
});

describe('세무 · 보험', () => {
  const tax = { ...UNKNOWN_TAX, insurance: { ...UNKNOWN_TAX.insurance, pension: { state: 'YES', reportedWage: 3000000, note: null } } };
  it('기본 값', () => {
    expect(validateTax(tax).ok).toBe(true);
  });
  it('비율 · 가족 · 자녀', () => {
    expect(validateTax({ ...tax, withholdingRatio: 90 })).toEqual({ ok: false, code: 'tax_ratio' });
    expect(validateTax({ ...tax, familyCount: 0 })).toEqual({ ok: false, code: 'tax_family' });
    expect(validateTax({ ...tax, familyCount: 12 })).toEqual({ ok: false, code: 'tax_family' });
    expect(validateTax({ ...tax, familyCount: 3, childCount: 3 })).toEqual({ ok: false, code: 'tax_child' });
    expect(validateTax({ ...tax, familyCount: 3, childCount: 2 }).ok).toBe(true);
  });
  it('가입하지 않는다면 근거가 있어야 한다. 모름은 근거 없이 저장된다', () => {
    const no = (note: string | null) => ({ ...tax, insurance: { ...tax.insurance, employment: { state: 'NO', reportedWage: null, note } } });
    expect(validateTax(no(null))).toEqual({ ok: false, code: 'tax_insurance_reason' });
    expect(validateTax(no('대표자')).ok).toBe(true);
    expect(validateTax({ ...tax, insurance: { ...tax.insurance, health: { state: 'MAYBE' } } })).toEqual({ ok: false, code: 'tax_insurance' });
  });
  it('학자금 상환 대상이면 금액이 있어야 한다', () => {
    expect(validateTax({ ...tax, studentLoan: { state: 'YES', monthlyAmount: null } })).toEqual({ ok: false, code: 'tax_loan' });
    expect(validateTax({ ...tax, studentLoan: { state: 'YES', monthlyAmount: '50000' } })).toMatchObject({ ok: true, value: { studentLoan: { state: 'YES', monthlyAmount: 50000 } } });
    expect(validateTax({ ...tax, studentLoan: { state: 'NO', monthlyAmount: 50000 } })).toMatchObject({ ok: true, value: { studentLoan: { state: 'NO', monthlyAmount: null } } });
  });
});

describe('개인 항목', () => {
  it('코드 · 금액', () => {
    expect(validateItemAssign({ itemCode: 'MEAL', amount: '200000', note: null })).toEqual({ ok: true, value: { itemCode: 'MEAL', amount: 200000, note: null } });
    expect(validateItemAssign({ itemCode: 'MEAL', amount: '', note: '' })).toEqual({ ok: true, value: { itemCode: 'MEAL', amount: null, note: null } });
    expect(validateItemAssign({ itemCode: 'meal', amount: 1 }).ok).toBe(false);
    expect(validateItemAssign({ itemCode: 'MEAL', amount: -1 }).ok).toBe(false);
  });
});

describe('설정 상태 · 참고 시급', () => {
  const known = { insurance: { pension: { state: 'YES', reportedWage: null, note: null }, health: { state: 'YES', reportedWage: null, note: null }, employment: { state: 'YES', reportedWage: null, note: null }, accident: { state: 'YES', reportedWage: null, note: null } } } as const;
  it('빠진 것을 전부 알려 준다', () => {
    expect(setupGaps({ contract: null, tax: null, joinedOn: null })).toEqual(['no_contract', 'no_tax', 'no_joined_on']);
    expect(setupGaps({ contract: { payType: 'ANNUAL', monthlyHours: null, annualDivisor: null }, tax: UNKNOWN_TAX, joinedOn: '2025-01-01' })).toEqual(['no_monthly_hours', 'no_annual_divisor', 'insurance_unknown']);
    expect(setupGaps({ contract: { payType: 'HOURLY', monthlyHours: null, annualDivisor: null }, tax: known, joinedOn: '2025-01-01' })).toEqual([]);
  });
  it('참고 시급 — 값이 빠지면 내지 않는다', () => {
    expect(referenceHourly({ payType: 'MONTHLY', amount: 3000000, monthlyHours: 209, annualDivisor: null })).toBe(14354);
    expect(referenceHourly({ payType: 'HOURLY', amount: 12000, monthlyHours: null, annualDivisor: null })).toBe(12000);
    expect(referenceHourly({ payType: 'ANNUAL', amount: 48000000, monthlyHours: 209, annualDivisor: 12 })).toBe(19139);
    expect(referenceHourly({ payType: 'ANNUAL', amount: 48000000, monthlyHours: 209, annualDivisor: null })).toBeNull();
    expect(referenceHourly({ payType: 'MONTHLY', amount: 3000000, monthlyHours: null, annualDivisor: null })).toBeNull();
  });
});
