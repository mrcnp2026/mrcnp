// 직원 등록 중 급여 입력 (2026-10-25 의뢰인)
import { describe, expect, it } from 'vitest';
import { newStaffPay } from '@/lib/payroll/new-staff-pay';

describe('등록 양식의 급여 칸 → 계약', () => {
  it('금액을 비우면 급여는 건너뛴다', () => {
    expect(newStaffPay({ payType: 'MONTHLY', payAmount: '' })).toEqual({ skip: true });
    expect(newStaffPay({})).toEqual({ skip: true });
  });
  it('월급: 금액 · 월 환산 시간이 계약이 된다 (시간 기준 기본은 끊은 급여용 시간)', () => {
    const r = newStaffPay({ payType: 'MONTHLY', payAmount: '3000000', payMonthlyHours: '209' });
    expect(r).toEqual({ skip: false, input: { payType: 'MONTHLY', amount: 3000000, timeBasis: 'ROUNDED', monthlyHours: 209, annualDivisor: null, included: { overtimeHours: null, holidayHours: null, note: null } } });
  });
  it('시급: 월 환산 시간은 받지 않는다', () => {
    const r = newStaffPay({ payType: 'HOURLY', payAmount: '10320', payMonthlyHours: '209', payTimeBasis: 'ACTUAL' });
    expect(r).toMatchObject({ skip: false, input: { payType: 'HOURLY', amount: 10320, timeBasis: 'ACTUAL', monthlyHours: null } });
  });
  it('연봉: 나누는 수를 받는다', () => {
    const r = newStaffPay({ payType: 'ANNUAL', payAmount: '36000000', payMonthlyHours: '209', payAnnualDivisor: '12' });
    expect(r).toMatchObject({ skip: false, input: { payType: 'ANNUAL', amount: 36000000, monthlyHours: 209, annualDivisor: 12 } });
  });
  it('금액이 틀리면 오류 코드를 돌려준다 (직원을 만들기 전에 막는다)', () => {
    expect(newStaffPay({ payType: 'MONTHLY', payAmount: '-5' })).toEqual({ error: 'contract_amount' });
    expect(newStaffPay({ payType: 'MONTHLY', payAmount: '1.5' })).toEqual({ error: 'contract_amount' });
    expect(newStaffPay({ payType: 'WEEKLY', payAmount: '100' })).toEqual({ error: 'contract_pay_type' });
    expect(newStaffPay({ payType: 'MONTHLY', payAmount: '100', payTimeBasis: 'X' })).toEqual({ error: 'contract_time_basis' });
  });
});
