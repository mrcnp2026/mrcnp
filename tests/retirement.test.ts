// 퇴직급여 수동 검산 산식 — 빠진 입력은 금액을 내지 않고, 통상임금이 크면 통상임금을 쓴다
import { describe, expect, it } from 'vitest';
import { calcRetirement, daysBetween, last3Months, toRetirementInput, type RetirementInput } from '@/lib/payroll/retirement';

const base: RetirementInput = { periodFrom: '2023-01-01', periodTo: '2025-12-31', excludedDays: 0, wage3m: 9_000_000, days3m: 92, bonus1y: 0, leavePay1y: 0, ordinaryDaily: null };

describe('daysBetween · last3Months', () => {
  it('양 끝을 포함해 센다', () => {
    expect(daysBetween('2025-01-01', '2025-01-01')).toBe(1);
    expect(daysBetween('2023-01-01', '2025-12-31')).toBe(1096); // 2024년은 윤년
  });
  it('퇴직 전 3개월: 마지막 근무일이 12/31이면 10/1 ~ 12/31 (92일)', () => {
    expect(last3Months('2025-12-31')).toEqual({ from: '2025-10-01', to: '2025-12-31', days: 92 });
  });
  it('달 중간: 마지막 근무일 3/14 → 12/15 ~ 3/14', () => {
    expect(last3Months('2026-03-14')).toEqual({ from: '2025-12-15', to: '2026-03-14', days: 90 });
  });
});

describe('calcRetirement', () => {
  it('1일 평균임금 × 30 × 계속근로일수 ÷ 365, 원 미만 버림', () => {
    const r = calcRetirement(base);
    // 9,000,000 ÷ 92 = 97,826.0869…  × 30 × 1096 ÷ 365 = 8,812,388.3…
    expect(r.missing).toEqual([]);
    expect(r.serviceDays).toBe(1096);
    expect(r.averageDaily?.startsWith('97826.08')).toBe(true);
    expect(r.amount).toBe(8_812_388);
    expect(r.usedOrdinary).toBe(false);
  });
  it('상여 · 연차수당은 3/12만 더한다', () => {
    const r = calcRetirement({ ...base, bonus1y: 4_000_000, leavePay1y: 400_000 });
    // (9,000,000 + 1,000,000 + 100,000) ÷ 92 = 109,782.608…
    expect(r.averageDaily?.startsWith('109782.60')).toBe(true);
    expect(r.amount).toBe(Math.floor((10_100_000 / 92) * 30 * 1096 / 365));
  });
  it('통상임금이 평균임금보다 크면 통상임금을 쓴다', () => {
    const r = calcRetirement({ ...base, ordinaryDaily: 120_000 });
    expect(r.usedOrdinary).toBe(true);
    expect(r.amount).toBe(Math.floor(120_000 * 30 * 1096 / 365));
    expect(calcRetirement({ ...base, ordinaryDaily: 90_000 }).usedOrdinary).toBe(false);
  });
  it('제외 기간은 계속근로일수에서 뺀다', () => {
    expect(calcRetirement({ ...base, excludedDays: 96 }).serviceDays).toBe(1000);
  });
  it('1년 미만이면 금액을 내지 않는다 (0원이 아니다)', () => {
    const r = calcRetirement({ ...base, periodFrom: '2025-02-01' });
    expect(r.missing).toEqual(['under_one_year']);
    expect(r.amount).toBeNull();
    expect(r.averageDaily).not.toBeNull(); // 평균임금은 보여 준다
  });
  it('임금 · 일수 · 기간이 빠지면 무엇이 빠졌는지 알려 주고 금액은 없다', () => {
    const r = calcRetirement({ ...base, periodFrom: null, wage3m: null, days3m: null });
    expect(r.missing).toEqual(['period', 'wage3m', 'days3m']);
    expect(r.amount).toBeNull();
    expect(calcRetirement({ ...base, wage3m: 0 }).missing).toEqual(['wage3m']);
    expect(calcRetirement({ ...base, days3m: 120 }).missing).toEqual(['bad_days3m']);
    expect(calcRetirement({ ...base, periodTo: '2022-01-01' }).missing).toEqual(['bad_period']);
  });
  it('정확히 365일이면 30일분', () => {
    const r = calcRetirement({ ...base, periodFrom: '2025-01-01', periodTo: '2025-12-31', wage3m: 9_200_000, days3m: 92 });
    expect(r.serviceDays).toBe(365);
    expect(r.amount).toBe(3_000_000);
  });
});

describe('toRetirementInput', () => {
  it('글자로 온 숫자 · 쉼표를 받아 주고, 틀린 값은 비운다', () => {
    expect(toRetirementInput({ periodFrom: '2023-01-01', periodTo: 'x', wage3m: '9,000,000', days3m: '92', bonus1y: '', ordinaryDaily: -5, excludedDays: '3' })).toEqual({ periodFrom: '2023-01-01', periodTo: null, excludedDays: 3, wage3m: 9_000_000, days3m: 92, bonus1y: 0, leavePay1y: 0, ordinaryDaily: null, departureInsurance: null });
    expect(toRetirementInput(null).wage3m).toBeNull();
  });
});
