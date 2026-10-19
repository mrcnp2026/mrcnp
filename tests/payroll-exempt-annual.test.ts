// 비과세 연간 한도 · 누적 (2026-10-19, 엔진 1.3). 숫자는 합성 값이다.
import { describe, expect, it } from 'vitest';
import { calculateStatement, type EngineInput, type EngineItem } from '@/lib/payroll/engine/engine';

const ins = { state: 'NO' as const, reportedWage: null };
const item = (code: string, amount: number, taxable: EngineItem['taxable'], exemptLimit: number | null, exemptAnnualLimit: number | null = null): EngineItem => ({ code, kind: 'PAYMENT', label: code, amount, taxable, exemptLimit, exemptAnnualLimit, insurable: true });
const input = (over: Partial<EngineInput> = {}): EngineInput => ({
  runKind: 'REGULAR',
  contract: { payType: 'MONTHLY', amount: 2_000_000, monthlyHours: 209, annualDivisor: null, included: { overtimeHours: null, holidayHours: null } },
  tax: { withholdingRatio: 100, familyCount: 1, childCount: 0, insurance: { pension: ins, health: ins, employment: ins, accident: ins }, studentLoan: { state: 'NO', monthlyAmount: null } },
  time: { workedMinutes: 0, overtimeMinutes: 0, nightMinutes: 0, holidayMinutes: 0, holidayOver8Minutes: 0, paidLeaveMinutes: 0 },
  partialMonth: false,
  items: [],
  policy: { overtimePremium: '0.5', nightPremium: '0.5', holidayPremium: '0.5', holidayOver8Premium: '1', rounding: { pay: { mode: 'HALF_UP', unit: 1 }, insurance: { mode: 'HALF_UP', unit: 1 } } },
  reference: { pension: null, health: null, ltcOfHealth: null, employment: null, accidentEmployerRate: null },
  insuranceBasis: 'PAYROLL_BASE',
  withholding: () => ({ ok: true, incomeTax: 0, localTax: 0 }),
  overrides: [],
  ...over,
});
const run = (over: Partial<EngineInput>) => {
  const r = calculateStatement(input(over));
  if (r.state !== 'OK') throw new Error(JSON.stringify(r.blockers));
  return r;
};

describe('비과세 연간 한도', () => {
  it('연간 한도가 없으면 예전과 같다 (월 한도만)', () => {
    const r = run({ items: [item('MEAL', 250_000, 'PARTIAL', 200_000)] });
    expect(r.totals.taxable).toBe(2_000_000 + 50_000);
    expect(r.lines.find((l) => l.code === 'MEAL')?.trace.exempt).toBe(200_000);
    expect(r.warnings.some((w) => w.code === 'exempt_annual_reached')).toBe(false);
  });
  it('올해 남은 연간 한도만큼만 비과세, 넘는 금액은 과세 + 경고', () => {
    const r = run({ items: [item('OT_EXEMPT', 300_000, 'EXEMPT', null, 2_400_000)], exemptYtd: { OT_EXEMPT: 2_200_000 } });
    expect(r.totals.taxable).toBe(2_000_000 + 100_000);
    const line = r.lines.find((l) => l.code === 'OT_EXEMPT')!;
    expect(line.trace).toMatchObject({ exempt: 200_000, exemptAnnualLimit: 2_400_000, exemptYtdBefore: 2_200_000 });
    expect(r.warnings).toContainEqual({ code: 'exempt_annual_reached', detail: 'OT_EXEMPT' });
  });
  it('월 한도와 연간 한도가 둘 다 있으면 작은 쪽', () => {
    const r = run({ items: [item('CAR', 250_000, 'PARTIAL', 200_000, 1_000_000)], exemptYtd: { CAR: 900_000 } });
    expect(r.lines.find((l) => l.code === 'CAR')?.trace.exempt).toBe(100_000);
    expect(r.totals.taxable).toBe(2_000_000 + 150_000);
  });
  it('연간 한도를 다 쓰면 전액 과세', () => {
    const r = run({ items: [item('OT_EXEMPT', 300_000, 'EXEMPT', null, 2_400_000)], exemptYtd: { OT_EXEMPT: 2_400_000 } });
    expect(r.lines.find((l) => l.code === 'OT_EXEMPT')?.trace.exempt).toBe(0);
    expect(r.totals.taxable).toBe(2_300_000);
  });
  it('한도 안이면 경고 없이 전액 비과세', () => {
    const r = run({ items: [item('OT_EXEMPT', 300_000, 'EXEMPT', null, 2_400_000)], exemptYtd: {} });
    expect(r.totals.taxable).toBe(2_000_000);
    expect(r.warnings.some((w) => w.code === 'exempt_annual_reached')).toBe(false);
  });
});
