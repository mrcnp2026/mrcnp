// 보상휴가로 돌린 연장 — 연장수당만 줄고 기본급은 그대로 (2026-10-19, 묶음 29). 숫자는 합성 값이다.
import { describe, expect, it } from 'vitest';
import { applyCompMinutes } from '@/lib/payroll/comp-time';
import { calculateStatement, type EngineInput, type EngineTime } from '@/lib/payroll/engine/engine';

const ins = { state: 'NO' as const, reportedWage: null };
const T: EngineTime = { workedMinutes: 209 * 60 + 600, overtimeMinutes: 600, nightMinutes: 0, holidayMinutes: 0, holidayOver8Minutes: 0, paidLeaveMinutes: 0 };
const input = (time: EngineTime, payType: 'MONTHLY' | 'HOURLY'): EngineInput => ({
  runKind: 'REGULAR',
  contract: payType === 'MONTHLY' ? { payType, amount: 2_090_000, monthlyHours: 209, annualDivisor: null, included: { overtimeHours: null, holidayHours: null } } : { payType, amount: 10_000, monthlyHours: null, annualDivisor: null, included: { overtimeHours: null, holidayHours: null } },
  tax: { withholdingRatio: 100, familyCount: 1, childCount: 0, insurance: { pension: ins, health: ins, employment: ins, accident: ins }, studentLoan: { state: 'NO', monthlyAmount: null } },
  time, partialMonth: false, items: [],
  policy: { overtimePremium: '0.5', nightPremium: '0.5', holidayPremium: '0.5', holidayOver8Premium: '1', rounding: { pay: { mode: 'HALF_UP', unit: 1 }, insurance: { mode: 'HALF_UP', unit: 1 } } },
  reference: { pension: null, health: null, ltcOfHealth: null, employment: null, accidentEmployerRate: null },
  insuranceBasis: 'PAYROLL_BASE', withholding: () => ({ ok: true, incomeTax: 0, localTax: 0 }), overrides: [],
});
const pay = (time: EngineTime, payType: 'MONTHLY' | 'HOURLY') => {
  const r = calculateStatement(input(time, payType));
  if (r.state !== 'OK') throw new Error(JSON.stringify(r.blockers));
  return { base: r.lines.find((l) => l.code === 'BASE')?.amount ?? 0, ot: r.lines.filter((l) => l.code.startsWith('OVERTIME')).reduce((a, l) => a + l.amount, 0) };
};

describe('applyCompMinutes', () => {
  it('돌린 분만큼 연장 · 일한 시간을 같이 뺀다', () => {
    expect(applyCompMinutes(T, 240).time).toMatchObject({ overtimeMinutes: 360, workedMinutes: T.workedMinutes - 240 });
  });
  it('인정 연장보다 많이 돌렸으면 막는다', () => {
    expect(applyCompMinutes(T, 601).exceeds).toBe(true);
  });
  it('0분이면 그대로', () => {
    expect(applyCompMinutes(T, 0).time).toBe(T);
  });
  for (const payType of ['MONTHLY', 'HOURLY'] as const) {
    it(`${payType}: 기본급은 그대로, 연장수당만 돌린 만큼 준다`, () => {
      const before = pay(T, payType);
      const after = pay(applyCompMinutes(T, 240).time, payType);
      expect(after.base).toBe(before.base);
      expect(after.ot).toBeLessThan(before.ot);
      expect(after.ot / before.ot).toBeCloseTo(360 / 600, 5);
      expect(pay(applyCompMinutes(T, 600).time, payType).ot).toBe(0);
    });
  }
});
