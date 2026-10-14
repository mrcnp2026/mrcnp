// 감면 · 지원 (DB 묶음 8, 2026-10-14) — 중소기업 취업자 소득세 감면 · 두루누리 · 학자금 기간.
// ★ 감면율 · 지원율은 직원별 입력값이고, 여기 숫자는 계산 구조를 보는 합성 값이다(실제 대상 판단 · 한도는 검증 대기 기록).
import { describe, expect, it } from 'vitest';
import { reliefCovers, reliefsForMonth, validateReliefs, validateTax, UNKNOWN_RELIEFS } from '@/lib/payroll/contract';
import { calculateStatement, type EngineInput, type EngineTax } from '@/lib/payroll/engine/engine';

const ins = (state: 'YES' | 'NO' | 'UNKNOWN') => ({ state, reportedWage: null });
const TAX: EngineTax = { withholdingRatio: 100, familyCount: 1, childCount: 0, insurance: { pension: ins('YES'), health: ins('NO'), employment: ins('YES'), accident: ins('NO') }, studentLoan: { state: 'NO', monthlyAmount: null } };
const input = (tax: EngineTax): EngineInput => ({
  runKind: 'REGULAR',
  contract: { payType: 'MONTHLY', amount: 3_000_000, monthlyHours: 209, annualDivisor: null, included: { overtimeHours: null, holidayHours: null } },
  tax,
  time: { workedMinutes: 0, overtimeMinutes: 0, nightMinutes: 0, holidayMinutes: 0, holidayOver8Minutes: 0, paidLeaveMinutes: 0 },
  partialMonth: false,
  items: [],
  policy: { overtimePremium: '0.5', nightPremium: '0.5', holidayPremium: '0.5', holidayOver8Premium: '1', rounding: { pay: { mode: 'HALF_UP', unit: 1 }, insurance: { mode: 'FLOOR', unit: 10 } } },
  reference: { pension: { employeeRate: '0.045', employerRate: '0.045', floor: null, ceiling: null, baseUnit: null }, health: null, ltcOfHealth: null, employment: { employeeRate: '0.009', employerRate: '0.009', floor: null, ceiling: null, baseUnit: null }, accidentEmployerRate: null },
  insuranceBasis: 'PAYROLL_BASE',
  withholding: () => ({ ok: true, incomeTax: 84_850, localTax: 8_480 }),
  overrides: [],
});
const amt = (r: ReturnType<typeof calculateStatement>, code: string) => (r.state === 'OK' ? r.lines.find((l) => l.code === code)?.amount : undefined);

describe('중소기업 취업자 소득세 감면', () => {
  it('세액표 84,850 × (1 − 90%) = 8,485 → 10원 미만 버림 8,480 · 지방소득세 848 → 840', () => {
    const r = calculateStatement(input({ ...TAX, reliefs: { smeRate: 90, durunuri: null } }));
    expect([amt(r, 'INCOME_TAX'), amt(r, 'LOCAL_TAX')]).toEqual([8_480, 840]);
    expect(r.warnings).toContainEqual({ code: 'sme_applied', detail: '90%, -76,370' });
  });
  it('70% 감면 → 84,850 × 30% = 25,455 → 25,450 · 지방 2,540', () => {
    const r = calculateStatement(input({ ...TAX, reliefs: { smeRate: 70, durunuri: null } }));
    expect([amt(r, 'INCOME_TAX'), amt(r, 'LOCAL_TAX')]).toEqual([25_450, 2_540]);
  });
  it('감면이 없으면 세액표 그대로', () => {
    const r = calculateStatement(input(TAX));
    expect([amt(r, 'INCOME_TAX'), amt(r, 'LOCAL_TAX')]).toEqual([84_850, 8_480]);
  });
});

describe('두루누리 사회보험료 지원', () => {
  it('국민연금 3,000,000 × 4.5% = 135,000 × (1 − 80%) = 27,000 · 고용보험 27,000 × 20% = 5,400 (사업주 몫도 같이 줄어든다)', () => {
    const r = calculateStatement(input({ ...TAX, reliefs: { smeRate: null, durunuri: { pension: 80, employment: 80 } } }));
    expect([amt(r, 'PENSION'), amt(r, 'PENSION_EMPLOYER'), amt(r, 'EMPLOYMENT'), amt(r, 'EMPLOYMENT_EMPLOYER')]).toEqual([27_000, 27_000, 5_400, 5_400]);
  });
  it('지원 없음 → 135,000 · 27,000', () => {
    const r = calculateStatement(input(TAX));
    expect([amt(r, 'PENSION'), amt(r, 'EMPLOYMENT')]).toEqual([135_000, 27_000]);
  });
});

describe('입력 검사 · 그 달에 쓸 값', () => {
  it('보내지 않으면 모름', () => expect(validateReliefs(undefined)).toEqual({ ok: true, value: UNKNOWN_RELIEFS }));
  it('「예」는 감면율(50 · 70 · 90 · 100) · 시작일 · 근거가 있어야 한다', () => {
    expect(validateReliefs({ sme: { state: 'YES', rate: 90, from: '2026-01-01', note: '' } })).toEqual({ ok: false, code: 'tax_relief_sme' });
    expect(validateReliefs({ sme: { state: 'YES', rate: 85, from: '2026-01-01', note: '감면신청서' } })).toEqual({ ok: false, code: 'tax_relief_sme' });
    expect(validateReliefs({ sme: { state: 'YES', rate: 90, from: '2026-01-01', to: '2025-12-31', note: '감면신청서' } })).toEqual({ ok: false, code: 'tax_relief_sme' });
    expect(validateReliefs({ sme: { state: 'YES', rate: 90, from: '2026-01-01', note: '감면신청서' } }).ok).toBe(true);
    expect(validateReliefs({ durunuri: { state: 'YES', pensionRate: 0, employmentRate: 0, from: '2026-01-01', note: '공단 결정' } })).toEqual({ ok: false, code: 'tax_relief_durunuri' });
  });
  it('「아니오」면 비율 · 기간은 버린다', () => {
    const v = validateReliefs({ sme: { state: 'NO', rate: 90, from: '2026-01-01', note: '대상 아님' } });
    expect(v.ok && v.value.sme).toEqual({ state: 'NO', rate: null, from: null, to: null, note: '대상 아님' });
  });
  it('학자금 기간은 끝이 시작보다 앞일 수 없다', () => {
    const base = { withholdingRatio: 100, familyCount: 1, childCount: 0, insurance: Object.fromEntries(['pension', 'health', 'employment', 'accident'].map((k) => [k, { state: 'YES', reportedWage: null, note: null }])) };
    expect(validateTax({ ...base, studentLoan: { state: 'YES', monthlyAmount: 100000, from: '2026-05-01', to: '2026-04-01' } })).toEqual({ ok: false, code: 'tax_loan_period' });
    const ok = validateTax({ ...base, studentLoan: { state: 'YES', monthlyAmount: 100000, from: '2026-05-01', to: null } });
    expect(ok.ok && ok.value.studentLoan).toEqual({ state: 'YES', monthlyAmount: 100000, from: '2026-05-01', to: null });
  });
  it('기간이 그 달에 걸치는가 (끝은 그 날까지)', () => {
    expect(reliefCovers({ from: '2026-10-15', to: null }, '2026-10-01', '2026-10-31')).toBe(true);
    expect(reliefCovers({ from: '2026-01-01', to: '2026-09-30' }, '2026-10-01', '2026-10-31')).toBe(false);
    expect(reliefCovers({ from: '2026-11-01', to: null }, '2026-10-01', '2026-10-31')).toBe(false);
  });
  it('회사가 켠 것만 본다 · 켜져 있는데 「모름」이면 막는다', () => {
    expect(reliefsForMonth({}, { sme: false, durunuri: false }, '2026-10-01', '2026-10-31')).toEqual({ reliefs: { smeRate: null, durunuri: null }, blockers: [] });
    expect(reliefsForMonth({}, { sme: true, durunuri: true }, '2026-10-01', '2026-10-31').blockers).toEqual([{ code: 'relief_unknown', detail: 'sme' }, { code: 'relief_unknown', detail: 'durunuri' }]);
    const raw = { sme: { state: 'YES', rate: 90, from: '2026-01-01', to: null }, durunuri: { state: 'YES', pensionRate: 80, employmentRate: 80, from: '2027-01-01', to: null } };
    expect(reliefsForMonth(raw, { sme: true, durunuri: true }, '2026-10-01', '2026-10-31')).toEqual({ reliefs: { smeRate: 90, durunuri: null }, blockers: [] });
  });
});
