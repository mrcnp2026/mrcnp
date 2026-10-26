// 퇴직급여 › 직원별 예상 퇴직금 (2026-10-25 의뢰인)
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));

import { contractWage3m } from '@/lib/payroll/retirement-roster';
import { calcRetirement } from '@/lib/payroll/retirement';

describe('계약으로 참고로 계산한 3개월 임금', () => {
  it('월급은 ×3, 연봉은 나누는 수로 나눠 ×3', () => {
    expect(contractWage3m({ payType: 'MONTHLY', amount: 3_000_000, annualDivisor: null })).toBe(9_000_000);
    expect(contractWage3m({ payType: 'ANNUAL', amount: 36_000_000, annualDivisor: 12 })).toBe(9_000_000);
  });
  it('시급제 · 계약 없음 · 나누는 수 없는 연봉은 참고하지 않는다(지어내지 않는다)', () => {
    expect(contractWage3m({ payType: 'HOURLY', amount: 10_320, annualDivisor: null })).toBeNull();
    expect(contractWage3m(null)).toBeNull();
    expect(contractWage3m({ payType: 'ANNUAL', amount: 36_000_000, annualDivisor: null })).toBeNull();
  });
  it('1년 미만이면 금액을 내지 않는다', () => {
    const r = calcRetirement({ periodFrom: '2026-03-01', periodTo: '2026-10-25', excludedDays: 0, wage3m: 9_000_000, days3m: 92, bonus1y: 0, leavePay1y: 0, ordinaryDaily: null });
    expect(r.amount).toBeNull();
    expect(r.missing).toContain('under_one_year');
  });
  it('1년 이상이면 평균임금 × 30일 × 근속일수 ÷ 365', () => {
    const r = calcRetirement({ periodFrom: '2024-10-01', periodTo: '2026-10-25', excludedDays: 0, wage3m: 9_000_000, days3m: 92, bonus1y: 0, leavePay1y: 0, ordinaryDaily: null });
    expect(r.amount).not.toBeNull();
    expect(r.amount!).toBeGreaterThan(5_000_000);
  });
});
