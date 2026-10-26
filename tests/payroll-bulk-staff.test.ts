// 사원별 급여 — 여러 명에게 한 번에 적용 (2026-10-25 의뢰인)
import { describe, expect, it } from 'vitest';
import { applyContractEdit, applyInsuranceEdit, cleanContractEdit, cleanInsuranceEdit } from '@/lib/payroll/bulk-staff';
import type { ContractInput } from '@/lib/payroll/contract';
import { UNKNOWN_TAX } from '@/lib/payroll/contract';

const monthly: ContractInput = { payType: 'MONTHLY', amount: 3_000_000, timeBasis: 'ROUNDED', monthlyHours: 209, annualDivisor: null, included: { overtimeHours: null, holidayHours: null, note: null } };
const hourly: ContractInput = { payType: 'HOURLY', amount: 10_320, timeBasis: 'ACTUAL', monthlyHours: null, annualDivisor: null, included: { overtimeHours: null, holidayHours: null, note: null } };

describe('계약 일괄 입력 검사', () => {
  it('하나도 안 바꾸면 거절한다', () => {
    expect(cleanContractEdit({ amountMode: 'keep', amountValue: '', timeBasis: '', monthlyHours: '' })).toBeNull();
    expect(cleanContractEdit({})).toBeNull();
  });
  it('금액을 바꾸려면 값이 있어야 한다', () => {
    expect(cleanContractEdit({ amountMode: 'percent', amountValue: '' })).toBeNull();
    expect(cleanContractEdit({ amountMode: 'percent', amountValue: '3.5' })).toMatchObject({ amountMode: 'percent', amountValue: 3.5 });
    expect(cleanContractEdit({ amountMode: 'percent', amountValue: '-95' })).toBeNull(); // −90%보다 더 내리는 것은 실수로 본다
    expect(cleanContractEdit({ amountMode: 'add', amountValue: '1.5' })).toBeNull();
    expect(cleanContractEdit({ amountMode: 'set', amountValue: '0' })).toBeNull();
  });
  it('시간 기준만 바꿀 수도 있다 · 모르는 값은 거절', () => {
    expect(cleanContractEdit({ amountMode: 'keep', timeBasis: 'ACTUAL' })).toMatchObject({ timeBasis: 'ACTUAL' });
    expect(cleanContractEdit({ amountMode: 'keep', timeBasis: 'X' })).toBeNull();
    expect(cleanContractEdit({ amountMode: 'bogus', amountValue: '1' })).toBeNull();
  });
});

describe('계약 일괄 적용', () => {
  const edit = (b: Record<string, unknown>) => cleanContractEdit(b)!;
  it('비율: 3% 올리면 원 단위 반올림', () => {
    expect(applyContractEdit(monthly, edit({ amountMode: 'percent', amountValue: '3' }))!.amount).toBe(3_090_000);
    expect(applyContractEdit(hourly, edit({ amountMode: 'percent', amountValue: '3' }))!.amount).toBe(10_630); // 10,629.6
  });
  it('더하기 · 지정', () => {
    expect(applyContractEdit(monthly, edit({ amountMode: 'add', amountValue: '-100000' }))!.amount).toBe(2_900_000);
    expect(applyContractEdit(monthly, edit({ amountMode: 'set', amountValue: '3500000' }))!.amount).toBe(3_500_000);
  });
  it('금액이 0 이하가 되면 그 직원은 건너뛴다(null)', () => {
    expect(applyContractEdit(monthly, edit({ amountMode: 'add', amountValue: '-3000000' }))).toBeNull();
  });
  it('바꾸지 않은 칸은 그 직원의 지금 값을 이어 쓴다', () => {
    const r = applyContractEdit(monthly, edit({ amountMode: 'percent', amountValue: '1' }))!;
    expect(r).toMatchObject({ payType: 'MONTHLY', timeBasis: 'ROUNDED', monthlyHours: 209 });
  });
  it('시간 기준 · 월 환산 시간 변경, 시급제는 월 환산 시간을 받지 않는다', () => {
    expect(applyContractEdit(monthly, edit({ amountMode: 'keep', timeBasis: 'SCHEDULE', monthlyHours: '200' }))).toMatchObject({ amount: 3_000_000, timeBasis: 'SCHEDULE', monthlyHours: 200 });
    expect(applyContractEdit(hourly, edit({ amountMode: 'keep', monthlyHours: '200' }))).toMatchObject({ monthlyHours: null });
  });
});

describe('보험 일괄 적용', () => {
  it('하나도 안 고르면 거절 · 가입/미가입만 허용', () => {
    expect(cleanInsuranceEdit({ pension: '', health: null })).toBeNull();
    expect(cleanInsuranceEdit({ pension: 'MAYBE' })).toBeNull();
    expect(cleanInsuranceEdit({ pension: 'YES', accident: 'NO' })).toEqual({ pension: 'YES', accident: 'NO' });
  });
  it('고른 보험만 바꾸고 나머지(가족 · 자녀 · 학자금 · 다른 보험)는 이어 쓴다', () => {
    const cur = { ...UNKNOWN_TAX, familyCount: 3, childCount: 1, insurance: { ...UNKNOWN_TAX.insurance, health: { state: 'YES' as const, reportedWage: 3_000_000, note: null } } };
    const r = applyInsuranceEdit(cur, { pension: 'YES' });
    expect(r.insurance.pension.state).toBe('YES');
    expect(r.insurance.health).toEqual({ state: 'YES', reportedWage: 3_000_000, note: null });
    expect(r.familyCount).toBe(3);
    expect(r.childCount).toBe(1);
  });
  it('미가입으로 바꾸면 신고 보수는 지운다', () => {
    const cur = { ...UNKNOWN_TAX, insurance: { ...UNKNOWN_TAX.insurance, employment: { state: 'YES' as const, reportedWage: 3_000_000, note: null } } };
    expect(applyInsuranceEdit(cur, { employment: 'NO' }).insurance.employment).toEqual({ state: 'NO', reportedWage: null, note: null });
  });
  it('세무 판이 없는 직원은 「모름」 바탕에 고른 보험만', () => {
    const r = applyInsuranceEdit(null, { pension: 'YES' });
    expect(r.insurance.pension.state).toBe('YES');
    expect(r.insurance.health.state).toBe('UNKNOWN');
  });
});
