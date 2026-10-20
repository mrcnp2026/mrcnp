// 퇴사자 남은 연차 수당 (2026-10-20) — 1일 통상임금 × 남은 일수 (근로기준법 제60조).
import { describe, expect, it } from 'vitest';
import { leavePayout } from '@/lib/leave-payout';

const DAY = 480;
describe('남은 연차 수당', () => {
  it('시급제 13,000원 + 만근 20만(통상임금 포함) → 통상시급 13,956원 · 1일 111,654원, 남은 3.5일', () => {
    const r = leavePayout({ contract: { payType: 'HOURLY', amount: 13_000, monthlyHours: null, annualDivisor: null }, items: [{ code: 'FULL', label: '만근', amount: 200_000, ordinaryWage: 'INCLUDED' }], unusedMinutes: 3.5 * DAY, dayMinutes: DAY });
    // 13,000 + 200,000 ÷ 209 = 13,956.937… → 1일 111,655.5… → 3.5일 390,794.2…
    expect(r).toMatchObject({ state: 'OK', ordinaryHourly: 13_956, daily: 111_655, unusedDays: 3.5, amount: 390_794, unknownItems: [] });
  });
  it('통상임금 「제외」는 빼고, 「모름」은 빼고 알린다', () => {
    const r = leavePayout({ contract: { payType: 'HOURLY', amount: 12_000, monthlyHours: null, annualDivisor: null }, items: [{ code: 'CAR', label: '자가운전', amount: 200_000, ordinaryWage: 'EXCLUDED' }, { code: 'DORM', label: '기숙사', amount: 450_000, ordinaryWage: 'UNKNOWN' }], unusedMinutes: DAY, dayMinutes: DAY });
    expect([r.amount, r.unknownItems]).toEqual([96_000, ['기숙사']]);
  });
  it('월급제는 월급 ÷ 월 환산시간 (반올림하지 않은 값으로)', () => {
    const r = leavePayout({ contract: { payType: 'MONTHLY', amount: 3_000_000, monthlyHours: 209, annualDivisor: null }, items: [], unusedMinutes: 2 * DAY, dayMinutes: DAY });
    expect([r.ordinaryHourly, r.daily, r.amount]).toEqual([14_354, 114_832, 229_665]); // 3,000,000 ÷ 209 × 8 × 2 = 229,665.07
  });
  it('계약 · 월 환산시간이 없으면 금액을 내지 않는다', () => {
    expect(leavePayout({ contract: null, items: [], unusedMinutes: DAY, dayMinutes: DAY }).state).toBe('NO_CONTRACT');
    expect(leavePayout({ contract: { payType: 'MONTHLY', amount: 3_000_000, monthlyHours: null, annualDivisor: null }, items: [], unusedMinutes: DAY, dayMinutes: DAY })).toMatchObject({ state: 'NO_HOURS', amount: null });
  });
});
