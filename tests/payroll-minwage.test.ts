// 최저임금 참고 (2026-10-14) — 계약의 시간당 임금이 최저시급보다 낮으면 「참고」로 알리고, 계산은 막지 않는다. 최저시급 숫자는 합성 값.
import { describe, expect, it } from 'vitest';
import { calculateStatement, type EngineInput } from '@/lib/payroll/engine/engine';

const ins = { state: 'NO' as const, reportedWage: null };
const base = (contract: EngineInput['contract'], minimumHourly: number | null): EngineInput => ({
  runKind: 'REGULAR', contract, tax: { withholdingRatio: 100, familyCount: 1, childCount: 0, insurance: { pension: ins, health: ins, employment: ins, accident: ins }, studentLoan: { state: 'NO', monthlyAmount: null } },
  time: { workedMinutes: 600, overtimeMinutes: 0, nightMinutes: 0, holidayMinutes: 0, holidayOver8Minutes: 0, paidLeaveMinutes: 0 }, partialMonth: false, items: [],
  policy: { overtimePremium: '0.5', nightPremium: '0.5', holidayPremium: '0.5', holidayOver8Premium: '1', rounding: { pay: { mode: 'HALF_UP', unit: 1 }, insurance: { mode: 'FLOOR', unit: 10 } } },
  reference: { pension: null, health: null, ltcOfHealth: null, employment: null, accidentEmployerRate: null }, insuranceBasis: 'PAYROLL_BASE', withholding: () => ({ ok: true, incomeTax: 0, localTax: 0 }), overrides: [], minimumHourly,
});
const warn = (r: ReturnType<typeof calculateStatement>) => r.warnings.filter((w) => w.code === 'below_minimum_wage');

describe('최저임금 참고', () => {
  it('시급 9,000 < 최저 10,000 → 참고 (계산은 됨)', () => {
    const r = calculateStatement(base({ payType: 'HOURLY', amount: 9000, monthlyHours: null, annualDivisor: null, included: { overtimeHours: null, holidayHours: null } }, 10000));
    expect(r.state).toBe('OK');
    expect(warn(r)).toEqual([{ code: 'below_minimum_wage', detail: '9,000 < 10,000' }]);
  });
  it('월급 2,000,000 ÷ 209 = 9,569 < 10,000 → 참고', () => {
    const r = calculateStatement(base({ payType: 'MONTHLY', amount: 2_000_000, monthlyHours: 209, annualDivisor: null, included: { overtimeHours: null, holidayHours: null } }, 10000));
    expect(warn(r)[0]?.detail).toBe('9,569 < 10,000');
  });
  it('같거나 높으면 · 최저시급 자료가 없으면 알리지 않는다', () => {
    const c = { payType: 'HOURLY' as const, amount: 10000, monthlyHours: null, annualDivisor: null, included: { overtimeHours: null, holidayHours: null } };
    expect(warn(calculateStatement(base(c, 10000)))).toEqual([]);
    expect(warn(calculateStatement(base({ ...c, amount: 5000 }, null)))).toEqual([]);
  });
});
