// 급여 계산 모듈 — PRD v1.3 20장의 합성 사례 C01~C12.
// ★ 여기의 숫자는 계산 구조를 검증하는 「합성 테스트 값」이다. 실제 세율 · 보험료율 · 법정 가산율이 아니다.
import { describe, expect, it } from 'vitest';
import { add, dec, div, hoursOf, mul, text, toWon } from '@/lib/payroll/engine/decimal';
import { bandTax, calculateStatement, ENGINE_VERSION, settleNotice, type EngineInput, type EngineItem, type EngineTax, type EngineTime } from '@/lib/payroll/engine/engine';
import { makeWithholding, referenceFrom, TEMP_INSURANCE_ROUNDING } from '@/lib/payroll/engine/inputs';
import { pickAt } from '@/lib/payroll/reference';
import { kstDateTime } from '@/lib/time';
import type { WorkRule } from '@/lib/types';
import { calcWorkMinutes } from '@/lib/worktime';

const NO_TIME: EngineTime = { workedMinutes: 0, overtimeMinutes: 0, nightMinutes: 0, holidayMinutes: 0, holidayOver8Minutes: 0, paidLeaveMinutes: 0 };
const ins = (state: 'YES' | 'NO' | 'UNKNOWN', reportedWage: number | null = null) => ({ state, reportedWage });
const NOT_INSURED: EngineTax = { withholdingRatio: 100, familyCount: 1, childCount: 0, insurance: { pension: ins('NO'), health: ins('NO'), employment: ins('NO'), accident: ins('NO') }, studentLoan: { state: 'NO', monthlyAmount: null } };
const item = (code: string, kind: 'PAYMENT' | 'DEDUCTION', amount: number, taxable: EngineItem['taxable'] = 'TAXABLE', exemptLimit: number | null = null): EngineItem => ({ code, kind, label: code, amount, taxable, exemptLimit, insurable: taxable === 'TAXABLE' });
const input = (over: Partial<EngineInput> = {}): EngineInput => ({
  runKind: 'REGULAR',
  contract: { payType: 'MONTHLY', amount: 3_000_000, monthlyHours: 209, annualDivisor: null, included: { overtimeHours: null, holidayHours: null } },
  tax: NOT_INSURED,
  time: NO_TIME,
  partialMonth: false,
  items: [],
  policy: { overtimePremium: '0.5', nightPremium: '0.5', holidayPremium: '0.5', holidayOver8Premium: '1', rounding: { pay: { mode: 'HALF_UP', unit: 1 }, insurance: { mode: 'HALF_UP', unit: 1 } } },
  reference: { pension: null, health: null, ltcOfHealth: null, employment: null, accidentEmployerRate: null },
  insuranceBasis: 'PAYROLL_BASE',
  withholding: () => ({ ok: true, incomeTax: 0, localTax: 0 }),
  overrides: [],
  ...over,
});
const ok = (r: ReturnType<typeof calculateStatement>) => {
  if (r.state !== 'OK') throw new Error(`blocked: ${JSON.stringify(r.blockers)}`);
  return r;
};
const amount = (r: ReturnType<typeof ok>, code: string) => r.lines.find((l) => l.code === code)?.amount;

describe('정밀 소수', () => {
  it('소수 오차가 쌓이지 않는다', () => {
    expect(text(add(dec('0.1'), dec('0.2')))).toBe('0.3');
    expect(text(mul(dec('333.33'), dec(3)))).toBe('999.99');
    expect(text(div(dec(1), dec(3)))).toBe('0.33333333');
    expect(text(hoursOf(525))).toBe('8.75');
  });
  it('끝수: 반올림 · 버림 · 올림, 10원 · 천 원 단위, 음수', () => {
    expect(toWon(dec('999.99'))).toBe(BigInt(1000));
    expect(toWon(dec('999.5'), { mode: 'FLOOR', unit: 1 })).toBe(BigInt(999));
    expect(toWon(dec('1234.5'), { mode: 'FLOOR', unit: 10 })).toBe(BigInt(1230));
    expect(toWon(dec('1231'), { mode: 'CEIL', unit: 10 })).toBe(BigInt(1240));
    expect(toWon(dec('2345678'), { mode: 'FLOOR', unit: 1000 })).toBe(BigInt(2345000));
    expect(toWon(dec('-10.5'))).toBe(BigInt(-11));
    expect(toWon(dec('-10.5'), { mode: 'FLOOR', unit: 1 })).toBe(BigInt(-11));
    expect(toWon(dec('-10.5'), { mode: 'CEIL', unit: 1 })).toBe(BigInt(-10));
  });
  it('소수를 숫자형으로 넘기거나 아홉째 자리를 넘기면 거부한다', () => {
    expect(() => dec(0.1)).toThrow();
    expect(() => dec('0.123456789')).toThrow();
    expect(() => dec('1,000')).toThrow();
  });
});

describe('C01 월급', () => {
  it('기본급 300만 + 과세 수당 10만 + 비과세 20만, 임의 공제 25만 → 지급 330만 · 과세 310만 · 실지급 305만', () => {
    const r = ok(calculateStatement(input({ items: [item('ALLOW', 'PAYMENT', 100_000), item('MEAL', 'PAYMENT', 200_000, 'EXEMPT'), item('ETC', 'DEDUCTION', 250_000)] })));
    expect(r.totals).toMatchObject({ pay: 3_300_000, taxable: 3_100_000, deduction: 250_000, net: 3_050_000 });
    expect(r.engineVersion).toBe(ENGINE_VERSION);
  });
  it('한도가 있는 비과세는 한도를 넘는 만큼만 과세', () => {
    const r = ok(calculateStatement(input({ items: [item('MEAL', 'PAYMENT', 250_000, 'PARTIAL', 200_000)] })));
    expect(r.totals.taxable).toBe(3_050_000);
  });
});

describe('C02 시급 · 연장 · 야간', () => {
  it('9시간(연장 1시간 포함) × 10,000 + 연장 가산 0.5 + 야간 2시간 가산 0.5 = 105,000 — 기본급은 소정 8시간, 연장 줄은 1.5배(회사 대장 모양, 2026-10-16). 연장 1시간의 기본을 두 번 주지 않는다', () => {
    const r = ok(calculateStatement(input({ contract: { payType: 'HOURLY', amount: 10_000, monthlyHours: null, annualDivisor: null, included: { overtimeHours: null, holidayHours: null } }, time: { ...NO_TIME, workedMinutes: 540, overtimeMinutes: 60, nightMinutes: 120 } })));
    expect([amount(r, 'BASE'), amount(r, 'OVERTIME'), amount(r, 'NIGHT'), r.totals.pay]).toEqual([80_000, 15_000, 10_000, 105_000]);
    expect(r.lines.find((l) => l.code === 'OVERTIME')).toMatchObject({ quantity: '1', factor: '1.5' });
  });
  it('시급제 휴일: 기본급에 넣지 않고 휴일 줄에서 1.5배, 8시간 넘는 시간은 2배', () => {
    const r = ok(calculateStatement(input({ contract: { payType: 'HOURLY', amount: 10_000, monthlyHours: null, annualDivisor: null, included: { overtimeHours: null, holidayHours: null } }, time: { ...NO_TIME, workedMinutes: 600, holidayMinutes: 600, holidayOver8Minutes: 120 } })));
    expect([amount(r, 'BASE'), amount(r, 'HOLIDAY'), amount(r, 'HOLIDAY_OVER8'), r.totals.pay]).toEqual([0, 120_000, 40_000, 160_000]);
  });
});

describe('주휴 · 유급휴일 (시급제, 2026-10-16 — 회사 대장의 주차 · 유휴)', () => {
  const hourly = { payType: 'HOURLY' as const, amount: 14_300, monthlyHours: null, annualDivisor: null, included: { overtimeHours: null, holidayHours: null } };
  it('26.08 김규형: 기본 160 + 연장 18 × 1.5 + 주휴 40 + 유휴 8 = 대장 3,360,500 (유급휴가 32시간은 기본 160 안)', () => {
    const r = ok(calculateStatement(input({ contract: hourly, time: { ...NO_TIME, workedMinutes: (128 + 18) * 60, overtimeMinutes: 18 * 60, paidLeaveMinutes: 32 * 60, weeklyRestMinutes: 40 * 60, paidHolidayMinutes: 8 * 60 } })));
    expect([amount(r, 'BASE')! + amount(r, 'PAID_LEAVE')!, amount(r, 'OVERTIME'), amount(r, 'WEEKLY_REST'), amount(r, 'PAID_HOLIDAY')]).toEqual([2_288_000, 386_100, 572_000, 114_400]);
    expect(r.totals.pay).toBe(3_360_500);
  });
  it('월급제에는 주휴 · 유급휴일 줄을 만들지 않는다(기본급에 들어 있다)', () => {
    const r = ok(calculateStatement(input({ time: { ...NO_TIME, weeklyRestMinutes: 2400, paidHolidayMinutes: 480 } })));
    expect(r.lines.some((l) => l.code === 'WEEKLY_REST' || l.code === 'PAID_HOLIDAY')).toBe(false);
  });
  it('주휴를 개인 고정 항목으로 또 넣으면 막는다(중복 지급 방지)', () => {
    const r = calculateStatement(input({ contract: hourly, time: { ...NO_TIME, workedMinutes: 480, weeklyRestMinutes: 480 }, items: [{ code: 'WEEKLY_REST', kind: 'PAYMENT', label: '주휴', amount: 100, taxable: 'TAXABLE', exemptLimit: null, insurable: true }] }));
    expect(r.state).toBe('BLOCKED');
  });
  it('월급제의 연장은 기본 1 + 가산', () => {
    const r = ok(calculateStatement(input({ contract: { payType: 'MONTHLY', amount: 2_090_000, monthlyHours: 209, annualDivisor: null, included: { overtimeHours: null, holidayHours: null } }, time: { ...NO_TIME, overtimeMinutes: 120 } })));
    expect(amount(r, 'OVERTIME')).toBe(30_000); // 10,000 × 2시간 × 1.5
    expect(r.lines.find((l) => l.code === 'OVERTIME')).toMatchObject({ quantity: '2', unitPrice: '10000', factor: '1.5' });
  });
});

describe('C03 휴가 대체', () => {
  const time = { ...NO_TIME, workedMinutes: 240, paidLeaveMinutes: 240 };
  it('시급제: 일한 4시간 + 유급 반차 4시간 = 8시간 80,000', () => {
    const r = ok(calculateStatement(input({ contract: { payType: 'HOURLY', amount: 10_000, monthlyHours: null, annualDivisor: null, included: { overtimeHours: null, holidayHours: null } }, time })));
    expect(r.totals.pay).toBe(80_000);
  });
  it('월급제: 기본급에 이미 들어 있으므로 40,000을 또 더하지 않는다', () => {
    const r = ok(calculateStatement(input({ time })));
    expect(r.totals.pay).toBe(3_000_000);
    expect(r.lines.some((l) => l.code === 'PAID_LEAVE')).toBe(false);
  });
});

describe('C04 끊는 시간', () => {
  it('08:07~18:04, 15분 단위, 휴게 12~13 → 실제 537분 · 급여용 525분 (두 축을 섞지 않는다)', () => {
    const rule: WorkRule = { startTime: '09:00:00', endTime: '18:00:00', lateGraceMin: 10, breakStart: '12:00:00', breakEnd: '13:00:00', workdays: [1, 2, 3, 4, 5], weeklyRestDay: 7, roundStepMin: 15 };
    const d = '2026-10-12';
    const r = calcWorkMinutes([{ in: kstDateTime(d, '08:07'), out: kstDateTime(d, '18:04') }], rule, { workDate: d, dayType: 'workday', weekRegularMinutesSoFar: 0, weekTotalMinutesSoFar: 0 });
    expect([r.netMinutes, r.payableMinutes]).toEqual([537, 525]);
  });
});

describe('C05 합성 보험', () => {
  const tax: EngineTax = { ...NOT_INSURED, insurance: { ...NOT_INSURED.insurance, health: ins('YES') } };
  const reference = { pension: null, health: { employeeRate: '0.04', employerRate: '0.04', floor: null, ceiling: null, baseUnit: null }, ltcOfHealth: '0.1', employment: null, accidentEmployerRate: null };
  it('기준 200만 × 0.04 = 80,000, 요양은 그 80,000의 0.1 = 8,000 (보수 × 0.1 = 200,000이 아니다)', () => {
    const r = ok(calculateStatement(input({ contract: { payType: 'MONTHLY', amount: 2_000_000, monthlyHours: 209, annualDivisor: null, included: { overtimeHours: null, holidayHours: null } }, tax, reference })));
    expect([amount(r, 'HEALTH'), amount(r, 'LTC'), amount(r, 'HEALTH_EMPLOYER'), amount(r, 'LTC_EMPLOYER')]).toEqual([80_000, 8_000, 80_000, 8_000]);
    expect(r.totals).toMatchObject({ deduction: 88_000, employer: 88_000, net: 1_912_000 });
  });
  it('상한 · 하한 · 기준액 끊기 · 신고 보수 기준', () => {
    const capped = { ...reference, health: { ...reference.health, ceiling: 1_500_000 } };
    expect(amount(ok(calculateStatement(input({ contract: { payType: 'MONTHLY', amount: 2_000_000, monthlyHours: 209, annualDivisor: null, included: { overtimeHours: null, holidayHours: null } }, tax, reference: capped }))), 'HEALTH')).toBe(60_000);
    const reported = { ...tax, insurance: { ...tax.insurance, health: ins('YES', 1_234_567) } };
    const r = ok(calculateStatement(input({ tax: reported, reference: { ...reference, health: { ...reference.health, baseUnit: 1000 } }, insuranceBasis: 'REPORTED' })));
    expect(amount(r, 'HEALTH')).toBe(49_360); // 1,234,000 × 0.04
  });
  it('산재는 사업주만 — 직원 실지급에서 빼지 않는다', () => {
    const r = ok(calculateStatement(input({ tax: { ...NOT_INSURED, insurance: { ...NOT_INSURED.insurance, accident: ins('YES') } }, reference: { ...reference, health: null, accidentEmployerRate: '0.01' } })));
    expect([amount(r, 'ACCIDENT_EMPLOYER'), r.totals.deduction, r.totals.employer, r.totals.net]).toEqual([30_000, 0, 30_000, 3_000_000]);
  });
});

describe('보험마다 공제 기준 따로 (2026-10-20, engine-1.4)', () => {
  // 2025.12 명세서(황진성)와 같은 섞인 방식: 국민연금 · 건강은 신고 보수 400만, 고용은 그 달 실제 지급액. 끝수는 10원 미만 버림
  const all = { pension: ins('YES', 4_000_000), health: ins('YES', 4_000_000), employment: ins('YES', 4_000_000), accident: ins('NO') };
  const reference = { pension: { employeeRate: '0.045', employerRate: '0.045', floor: null, ceiling: null, baseUnit: null }, health: { employeeRate: '0.03545', employerRate: '0.03545', floor: null, ceiling: null, baseUnit: null }, ltcOfHealth: '0.1281', employment: { employeeRate: '0.009', employerRate: '0.009', floor: null, ceiling: null, baseUnit: null }, accidentEmployerRate: null };
  const base = (over: Partial<EngineInput>) => input({ contract: { payType: 'MONTHLY', amount: 4_571_450, monthlyHours: 209, annualDivisor: null, included: { overtimeHours: null, holidayHours: null } }, tax: { ...NOT_INSURED, insurance: all }, reference, policy: { ...input().policy, rounding: { pay: { mode: 'HALF_UP', unit: 1 }, insurance: { mode: 'FLOOR', unit: 10 } } }, ...over });
  it('연금 · 건강 = 신고 보수, 고용 = 실제 지급 → 명세서 금액과 같다', () => {
    const r = ok(calculateStatement(base({ insuranceBasis: 'PAYROLL_BASE', insuranceBasisOf: { pension: 'REPORTED', health: 'REPORTED' } })));
    expect([amount(r, 'PENSION'), amount(r, 'HEALTH'), amount(r, 'LTC'), amount(r, 'EMPLOYMENT')]).toEqual([180_000, 141_800, 18_160, 41_140]);
  });
  it('따로 고르지 않으면 예전처럼 모두 기본 기준', () => {
    const r = ok(calculateStatement(base({ insuranceBasis: 'REPORTED' })));
    expect(amount(r, 'EMPLOYMENT')).toBe(36_000); // 400만 × 0.9%
  });
  it('한 보험만 고지 기준이면 그 보험만 고지 자료가 필요하다', () => {
    const r = calculateStatement(base({ insuranceBasis: 'PAYROLL_BASE', insuranceBasisOf: { pension: 'NOTICE' } }));
    expect(r.state).toBe('BLOCKED');
    expect(r.blockers).toEqual([{ code: 'notice_required', detail: 'pension' }]);
    const r2 = ok(calculateStatement(base({ insuranceBasis: 'PAYROLL_BASE', insuranceBasisOf: { pension: 'NOTICE' }, notices: { pension: { employee: 180_000, employer: 180_000, id: 'np' } } })));
    expect([amount(r2, 'PENSION'), amount(r2, 'EMPLOYMENT')]).toEqual([180_000, 41_140]);
  });
});

describe('보험 기준에서 비과세분 빼기 · 건강보험 보험료 상한 하한 (2026-10-20, engine-1.5)', () => {
  const tax: EngineTax = { ...NOT_INSURED, insurance: { ...NOT_INSURED.insurance, health: ins('YES') } };
  const health = { employeeRate: '0.03595', employerRate: '0.03595', floor: null, ceiling: null, baseUnit: null };
  const reference = { pension: null, health, ltcOfHealth: '0.1314', employment: null, accidentEmployerRate: null };
  const monthly = (amount: number) => ({ payType: 'MONTHLY' as const, amount, monthlyHours: 209, annualDivisor: null, included: { overtimeHours: null, holidayHours: null } });
  it('식대 30만(한 달 20만까지 비과세) — 보험 기준에는 과세로 돌린 10만만 들어간다', () => {
    const r = ok(calculateStatement(input({ contract: monthly(2_000_000), tax, reference, items: [{ ...item('MEAL', 'PAYMENT', 300_000, 'PARTIAL', 200_000), insurable: true }] })));
    expect(r.totals).toMatchObject({ taxable: 2_100_000, insuranceBase: 2_100_000 });
    expect(amount(r, 'HEALTH')).toBe(75_495); // 210만 × 3.595%
  });
  it('전액 비과세는 보험 기준에 넣지 않는다 (예전과 같음)', () => {
    const r = ok(calculateStatement(input({ contract: monthly(2_000_000), tax, reference, items: [item('CAR', 'PAYMENT', 200_000, 'EXEMPT')] })));
    expect(r.totals).toMatchObject({ insuranceBase: 2_000_000 });
  });
  it('월 보험료 상한 · 하한 — 근로자 · 사업주 각각', () => {
    const capped = { ...reference, health: { ...health, premiumCeiling: 4_591_740, premiumFloor: 10_080 } };
    const high = ok(calculateStatement(input({ contract: monthly(200_000_000), tax, reference: capped })));
    expect([amount(high, 'HEALTH'), amount(high, 'HEALTH_EMPLOYER')]).toEqual([4_591_740, 4_591_740]);
    const low = ok(calculateStatement(input({ contract: monthly(200_000), tax, reference: capped })));
    expect(amount(low, 'HEALTH')).toBe(10_080); // 20만 × 3.595% = 7,190 → 하한
  });
});

describe('C06 보험 정산', () => {
  it('고지 95,000 − 이미 공제 80,000 = 추가 15,000, 고지 70,000이면 환급 −10,000', () => {
    expect(settleNotice(95_000, 80_000)).toBe(15_000);
    expect(settleNotice(70_000, 80_000)).toBe(-10_000);
  });
});

describe('C07 세액표 경계', () => {
  const bands = [
    { from: 1_000_000, to: 1_100_000, taxes: [1000] },
    { from: 1_100_000, to: 1_200_000, taxes: [2000] },
    { from: 1_300_000, to: null, taxes: [4000] },
  ];
  it('[100만, 110만) → 1,000원, 110만 → 2,000원', () => {
    expect(bandTax(bands, 1_099_999, 1)).toBe(1000);
    expect(bandTax(bands, 1_100_000, 1)).toBe(2000);
    expect(bandTax(bands, 5_000_000, 1)).toBe(4000);
  });
  it('빈 구간은 앞뒤 값으로 메우지 않는다', () => {
    expect(bandTax(bands, 1_250_000, 1)).toBeNull();
    expect(bandTax(bands, 999_999, 1)).toBeNull();
    expect(bandTax(bands, 1_050_000, 2)).toBeNull();
  });
});

describe('C08 합성 세금 비율', () => {
  it('기본 세액 10,000 × 80% = 8,000, 지방세 10% = 800 — 세액 규칙이 준 값을 그대로 쓴다', () => {
    const seen: unknown[] = [];
    const r = ok(calculateStatement(input({
      tax: { ...NOT_INSURED, withholdingRatio: 80, familyCount: 3, childCount: 1 },
      withholding: (a) => { seen.push(a); return { ok: true, incomeTax: (10_000 * a.ratio) / 100, localTax: ((10_000 * a.ratio) / 100) * 0.1 }; },
    })));
    expect([amount(r, 'INCOME_TAX'), amount(r, 'LOCAL_TAX')]).toEqual([8000, 800]);
    expect(seen).toEqual([{ taxable: 3_000_000, family: 3, children: 1, ratio: 80 }]);
  });
});

describe('C09 상여 누적', () => {
  it('같은 묶음 전체 세액 30,000 − 앞선 정규 명세 20,000 = 상여 차액 10,000', () => {
    const r = ok(calculateStatement(input({
      runKind: 'BONUS', items: [item('BONUS', 'PAYMENT', 1_000_000)],
      prior: { taxable: 3_000_000, incomeTax: 20_000, localTax: 2_000 },
      withholding: (a) => (a.taxable === 4_000_000 ? { ok: true, incomeTax: 30_000, localTax: 3_000 } : { ok: false, why: 'unexpected' }),
    })));
    expect([amount(r, 'INCOME_TAX'), amount(r, 'LOCAL_TAX')]).toEqual([10_000, 1_000]);
  });
  it('앞선 명세를 모르면 상여의 세금을 계산하지 않는다', () => {
    expect(calculateStatement(input({ runKind: 'BONUS', items: [item('BONUS', 'PAYMENT', 1_000_000)] }))).toMatchObject({ state: 'BLOCKED', blockers: [{ code: 'bonus_prior_missing' }] });
  });
  it('상여 대장은 기본급 · 시간 수당을 만들지 않고, 금액을 넣지 않은 직원은 차단한다', () => {
    const prior = { taxable: 3_000_000, incomeTax: 0, localTax: 0 };
    const r = ok(calculateStatement(input({ runKind: 'BONUS', prior, time: { ...NO_TIME, overtimeMinutes: 600 }, overrides: [{ itemCode: 'BONUS', kind: 'PAYMENT', amount: 500_000 }] })));
    expect(r.lines.map((l) => l.code)).toEqual(['BONUS', 'INCOME_TAX', 'LOCAL_TAX']);
    expect(r.totals.pay).toBe(500_000);
    expect(calculateStatement(input({ runKind: 'BONUS', prior })).blockers.map((b) => b.code)).toEqual(['no_bonus_amount']);
    expect(calculateStatement(input({ runKind: 'BONUS', prior, contract: null, overrides: [{ itemCode: 'BONUS', kind: 'PAYMENT', amount: 1 }] })).state).toBe('OK'); // 계약이 없어도 상여는 계산된다
  });
  it('상여 대장에서 4대보험을 건너뛰면 경고로 알린다', () => {
    const tax = { ...NOT_INSURED, insurance: { pension: ins('YES'), health: ins('YES'), employment: ins('UNKNOWN'), accident: ins('YES') } };
    const r = ok(calculateStatement(input({ runKind: 'BONUS', tax, skipInsurance: true, prior: { taxable: 0, incomeTax: 0, localTax: 0 }, overrides: [{ itemCode: 'BONUS', kind: 'PAYMENT', amount: 500_000 }] })));
    expect(r.lines.some((l) => ['PENSION', 'HEALTH', 'LTC', 'EMPLOYMENT'].includes(l.code))).toBe(false);
    expect(r.warnings).toEqual([{ code: 'insurance_not_calculated' }]);
  });
});

describe('C10 미래 요율', () => {
  it('12월에 공표된 내년 1월 시행 값은 12월 급여에 쓰이지 않는다', () => {
    const versions = [
      { id: 'now', validFrom: '2026-01-01', validTo: '2027-01-01' },
      { id: 'next', validFrom: '2027-01-01', validTo: null },
    ];
    expect(pickAt(versions, '2026-12-31')?.id).toBe('now');
    expect(pickAt(versions, '2027-01-01')?.id).toBe('next');
  });
});

describe('C11 금액 정밀도', () => {
  it('단가 333.33 × 3 = 999.99 → 1,000 (단가를 먼저 333으로 잘라 999로 만들지 않는다)', () => {
    const r = ok(calculateStatement(input({
      contract: { payType: 'MONTHLY', amount: 33_333, monthlyHours: 100, annualDivisor: null, included: { overtimeHours: null, holidayHours: null } },
      time: { ...NO_TIME, overtimeMinutes: 180 }, policy: { ...input().policy, overtimePremium: '0' },
    })));
    expect(r.lines.find((l) => l.code === 'OVERTIME')).toMatchObject({ unitPrice: '333.33', rawValue: '999.99', amount: 1000 });
  });
});

describe('C12 자료 없음', () => {
  it('계약이 없으면 차단 — 0원 명세가 아니다', () => {
    const r = calculateStatement(input({ contract: null }));
    expect(r).toMatchObject({ state: 'BLOCKED', totals: null, lines: [] });
    expect(r.blockers.map((b) => b.code)).toContain('no_contract');
  });
  it('가입한 보험의 요율 · 세액표가 없으면 차단', () => {
    const r = calculateStatement(input({ tax: { ...NOT_INSURED, insurance: { ...NOT_INSURED.insurance, pension: ins('YES') } }, withholding: null }));
    expect(r.state).toBe('BLOCKED');
    expect(r.blockers).toEqual(expect.arrayContaining([{ code: 'reference_missing', detail: 'pension' }, { code: 'reference_missing', detail: 'income-tax' }]));
  });
});

describe('추정하지 않는다', () => {
  it('보험 가입 여부가 「모름」이면 차단 (가입 안 함으로 치지 않는다)', () => {
    const r = calculateStatement(input({ tax: { ...NOT_INSURED, insurance: { ...NOT_INSURED.insurance, employment: ins('UNKNOWN') } } }));
    expect(r.blockers).toEqual([{ code: 'insurance_unknown', detail: 'employment' }]);
  });
  it('연봉을 나누는 수가 없으면 차단 (12로 나누지 않는다)', () => {
    const r = calculateStatement(input({ contract: { payType: 'ANNUAL', amount: 48_000_000, monthlyHours: 209, annualDivisor: null, included: { overtimeHours: null, holidayHours: null } } }));
    expect(r.blockers.map((b) => b.code)).toEqual(['no_annual_divisor']);
    const ok12 = ok(calculateStatement(input({ contract: { payType: 'ANNUAL', amount: 48_000_000, monthlyHours: 209, annualDivisor: 12, included: { overtimeHours: null, holidayHours: null } } })));
    expect(ok12.totals.pay).toBe(4_000_000);
  });
  it('월 환산 시간이 없는데 연장이 있으면 차단, 연장이 없으면 계산된다', () => {
    const c = { payType: 'MONTHLY' as const, amount: 3_000_000, monthlyHours: null, annualDivisor: null, included: { overtimeHours: null, holidayHours: null } };
    expect(calculateStatement(input({ contract: c, time: { ...NO_TIME, overtimeMinutes: 60 } })).blockers).toEqual([{ code: 'no_monthly_hours', detail: 'OVERTIME' }]);
    expect(calculateStatement(input({ contract: c })).state).toBe('OK');
  });
  it('가산율 정책이 없으면 차단', () => {
    expect(calculateStatement(input({ time: { ...NO_TIME, nightMinutes: 60 }, policy: { ...input().policy, nightPremium: null } })).blockers).toEqual([{ code: 'policy_missing', detail: 'NIGHT' }]);
  });
  it('계약에 포함된 연장 시간 안이면 더 주지 않고, 넘은 시간만 「월급 ÷ 전체 환산시간」 × 1.5 (engine-1.7)', () => {
    const c = { payType: 'MONTHLY' as const, amount: 3_000_000, monthlyHours: 209, annualDivisor: null, included: { overtimeHours: 40, holidayHours: null } };
    const within = ok(calculateStatement(input({ contract: c, time: { ...NO_TIME, overtimeMinutes: 40 * 60 } })));
    expect(within.lines.some((l) => l.code === 'OVERTIME')).toBe(false);
    // 300만 ÷ (209 + 40 × 1.5 = 269) = 11,152.4… × 1시간 × 1.5 = 16,728.6 → 16,729
    const over = ok(calculateStatement(input({ contract: c, time: { ...NO_TIME, overtimeMinutes: 41 * 60 } })));
    expect(over.lines.find((l) => l.code === 'OVERTIME')?.amount).toBe(16_729);
    expect(over.warnings).toContainEqual({ code: 'included_hours_exceeded', detail: 'OVERTIME 1h' });
  });
  it('209H + 연장 40H + 휴일 8H 월 300만 — 연장 45h · 휴일 16h · 휴일 8h 초과 2h', () => {
    const c = { payType: 'MONTHLY' as const, amount: 3_000_000, monthlyHours: 209, annualDivisor: null, included: { overtimeHours: 40, holidayHours: 8 } };
    const r = ok(calculateStatement(input({ contract: c, time: { ...NO_TIME, overtimeMinutes: 45 * 60, holidayMinutes: 18 * 60, holidayOver8Minutes: 2 * 60, nightMinutes: 60 } })));
    const amt = (code: string) => r.lines.find((l) => l.code === code)?.amount;
    // 통상시급 300만 ÷ 281 = 10,676.15…
    expect([amt('OVERTIME'), amt('HOLIDAY'), amt('HOLIDAY_OVER8'), amt('NIGHT')]).toEqual([80_071, 128_114, 42_705, 5_338]); // 5h × 1.5 · 8h × 1.5 · 2h × 2 · 1h × 0.5
  });
  it('중간 입사 · 퇴사는 자동으로 일할 계산하지 않는다 — 조정으로 금액을 정하면 풀린다', () => {
    expect(calculateStatement(input({ partialMonth: true })).blockers).toEqual([{ code: 'proration_policy', detail: undefined }]);
    const r = ok(calculateStatement(input({ partialMonth: true, overrides: [{ itemCode: 'BASE', kind: 'PAYMENT', amount: 1_500_000, id: 'o1' }] })));
    expect(r.lines.find((l) => l.code === 'BASE')).toMatchObject({ amount: 1_500_000, source: 'OVERRIDE', overrideId: 'o1', trace: { autoAmount: 3_000_000 } });
  });
  it('근태 마감 자료가 없으면 차단', () => {
    expect(calculateStatement(input({ time: null })).blockers.map((b) => b.code)).toEqual(['no_attendance']);
  });
  it('고지 보험료 기준인데 고지 자료가 없으면 요율로 대신하지 않는다', () => {
    const r = calculateStatement(input({ insuranceBasis: 'NOTICE', tax: { ...NOT_INSURED, insurance: { ...NOT_INSURED.insurance, health: ins('YES') } }, reference: { pension: null, health: { employeeRate: '0.04', employerRate: '0.04', floor: null, ceiling: null, baseUnit: null }, ltcOfHealth: '0.1', employment: null, accidentEmployerRate: null } }));
    expect(r.blockers).toEqual([{ code: 'notice_required', detail: 'health' }]);
  });
});

describe('조정 · 검산', () => {
  it('직접 넣는 지급 · 공제, 자동 금액의 조정', () => {
    const r = ok(calculateStatement(input({ overrides: [{ itemCode: 'BONUS_X', kind: 'PAYMENT', amount: 100_000, label: '특별' }, { itemCode: 'REFUND', kind: 'DEDUCTION', amount: -10_000 }] })));
    expect(r.lines.find((l) => l.code === 'BONUS_X')).toMatchObject({ source: 'MANUAL', amount: 100_000 });
    expect(r.totals).toMatchObject({ pay: 3_100_000, taxable: 3_100_000, deduction: -10_000, net: 3_110_000 });
  });
  it('지급 − 공제 = 실지급, 항목 합 = 합계', () => {
    const r = ok(calculateStatement(input({ items: [item('ALLOW', 'PAYMENT', 123_457), item('ETC', 'DEDUCTION', 54_321)], time: { ...NO_TIME, overtimeMinutes: 77, nightMinutes: 33 } })));
    const of = (k: string) => r.lines.filter((l) => l.kind === k).reduce((a, l) => a + l.amount, 0);
    expect(of('PAYMENT')).toBe(r.totals.pay);
    expect(of('DEDUCTION')).toBe(r.totals.deduction);
    expect(r.totals.net).toBe(r.totals.pay - r.totals.deduction);
  });
  it('공제가 지급보다 크면 차단', () => {
    expect(calculateStatement(input({ items: [item('ETC', 'DEDUCTION', 3_000_001)] })).blockers.map((b) => b.code)).toEqual(['negative_net']);
  });
  it('같은 입력이면 같은 결과', () => {
    const a = input({ items: [item('ALLOW', 'PAYMENT', 100_000)], time: { ...NO_TIME, overtimeMinutes: 90 } });
    expect(JSON.stringify(calculateStatement(a))).toBe(JSON.stringify(calculateStatement(a)));
  });
});

// ★ 아래 요율 · 상하한은 계산 구조를 보는 예시 값이다 — 실제 요율로 확인한 정답이 아니다. 실제 값은 관리자가 승인한 기준 자료에서만 온다.
describe('기준 자료 → 계산 입력', () => {
  const approved = {
    'pension.rate': { employeeRate: '0.045', employerRate: '0.045' },
    'pension.limit': { lower: 400_000, upper: 6_370_000 },
    'health.rate': { employeeRate: '0.03545', employerRate: '0.03545', totalRate: '0.0709' },
    'ltc.rate': { incomeRate: '0.009182', healthRate: '0.0709' },
    'employment.rate': { employeeRate: '0.009', employerRate: '0.0115' },
  };
  it('승인된 자료의 값을 그대로 옮긴다. 요양은 건강보험료에 대한 비율로 바꾼다', () => {
    const r = referenceFrom(approved);
    expect(r.missing).toEqual([]);
    expect(r.reference.pension).toEqual({ employeeRate: '0.045', employerRate: '0.045', floor: 400_000, ceiling: 6_370_000, baseUnit: TEMP_INSURANCE_ROUNDING.pensionBaseUnit });
    expect(r.reference.ltcOfHealth).toBe('0.12950635'); // 0.009182 ÷ 0.0709
    expect(r.reference.accidentEmployerRate).toBeNull();
  });
  it('빠진 자료는 null로 두고 무엇이 빠졌는지 알려 준다 (0으로 채우지 않는다)', () => {
    const r = referenceFrom({ 'pension.rate': approved['pension.rate'], 'health.rate': { employeeRate: 'abc' } });
    expect(r.reference).toMatchObject({ pension: null, health: null, ltcOfHealth: null, employment: null });
    expect(r.missing).toEqual(['pension.limit', 'health.rate', 'ltc.rate', 'employment.rate']);
  });
  it('승인된 자료로 계산: 연금은 상한 · 천 원 단위 기준, 요양은 건강보험료 기준', () => {
    const { reference } = referenceFrom(approved);
    const tax: EngineTax = { ...NOT_INSURED, insurance: { pension: ins('YES'), health: ins('YES'), employment: ins('YES'), accident: ins('YES') } };
    const r = ok(calculateStatement(input({ contract: { payType: 'MONTHLY', amount: 7_000_000, monthlyHours: 209, annualDivisor: null, included: { overtimeHours: null, holidayHours: null } }, tax, reference, policy: { ...input().policy, rounding: { pay: { mode: 'HALF_UP', unit: 1 }, insurance: TEMP_INSURANCE_ROUNDING.contribution } } })));
    expect(amount(r, 'PENSION')).toBe(286_650); // 상한 6,370,000 × 0.045
    expect(amount(r, 'HEALTH')).toBe(248_150); // 7,000,000 × 0.03545
    expect(amount(r, 'LTC')).toBe(32_130); // 248,150 × 0.12950635 = 32,136.9… → 10원 미만 버림
    expect(amount(r, 'EMPLOYMENT')).toBe(63_000);
    expect(amount(r, 'EMPLOYMENT_EMPLOYER')).toBe(80_500);
    expect(r.warnings).toEqual([{ code: 'employer_rate_missing', detail: 'accident' }]); // 산재 요율이 없어도 직원 명세는 계산된다
    expect(r.totals.net).toBe(7_000_000 - 286_650 - 248_150 - 32_130 - 63_000);
  });
});

describe('세액표 → 원천징수 계산', () => {
  const rules = { wageMin: 770_000, wageMaxExclusive: 10_000_000, topRow: null, highBands: null, family11Rule: false };
  const bands = [{ wageFrom: 3_360_000, wageTo: 3_380_000, taxes: [0, 0, 51_510, 0, 0, 0, 0, 0, 0, 0, 0] }];
  const w = makeWithholding({ bands, rules, childRule: { child1: 20_830, child2: 45_830, perExtraChild: 33_330 } });
  it('교차검수 재현: 3,370,000원 · 가족 3 · 자녀 1 · 80% → 소득세 24,540원 · 지방소득세 2,450원', () => {
    expect(w({ taxable: 3_370_000, family: 3, children: 1, ratio: 80 })).toMatchObject({ ok: true, incomeTax: 24_540, localTax: 2_450 });
  });
  it('표에 없는 구간은 계산하지 않는다', () => {
    expect(w({ taxable: 5_000_000, family: 3, children: 0, ratio: 100 })).toEqual({ ok: false, why: 'no_row' });
  });
  it('표의 첫 구간보다 적으면 0원', () => {
    expect(w({ taxable: 500_000, family: 1, children: 0, ratio: 100 })).toMatchObject({ ok: true, incomeTax: 0, localTax: 0 });
  });
});

describe('검수: 선택항목과 중복 지급 방지', () => {
  it('무급휴가와 지각은 각각 켜야 차감되고 과세 기준에도 반영된다', () => {
    const base = input({ contract: { ...input().contract!, amount: 2_090_000 }, time: { ...NO_TIME, unpaidLeaveMinutes: 480, lateMinutes: 30 } });
    expect(ok(calculateStatement(base)).totals.pay).toBe(2_090_000);
    expect(ok(calculateStatement({ ...base, policy: { ...base.policy, deductUnpaidLeave: true } })).totals.pay).toBe(2_010_000);
    const both = ok(calculateStatement({ ...base, policy: { ...base.policy, deductUnpaidLeave: true, deductLateness: true } }));
    expect(both.totals.pay).toBe(2_005_000);
    expect(both.totals.taxable).toBe(2_005_000);
  });
  it('시급제의 실제 근무분에는 지각과 무급휴가를 다시 차감하지 않는다', () => {
    const base = input({ contract: { ...input().contract!, payType: 'HOURLY', amount: 10000 }, time: { ...NO_TIME, workedMinutes: 60, unpaidLeaveMinutes: 480, lateMinutes: 30 } });
    expect(ok(calculateStatement({ ...base, policy: { ...base.policy, deductUnpaidLeave: true, deductLateness: true } })).totals.pay).toBe(10000);
  });
  it('통상임금에 포함한 고정 수당은 가산수당 단가에 더한다', () => {
    const base = input({ contract: { ...input().contract!, amount: 2_090_000 }, time: { ...NO_TIME, overtimeMinutes: 60 }, items: [{ ...item('ALLOW', 'PAYMENT', 209000), ordinaryWage: 'INCLUDED' }] });
    expect(amount(ok(calculateStatement(base)), 'OVERTIME')).toBe(16500);
  });
  it('자동 기본급과 BASE_PAY 개인항목이 겹치면 금액을 확정하지 않는다', () => {
    expect(calculateStatement(input({ items: [item('BASE_PAY', 'PAYMENT', 2090000)] })).blockers).toContainEqual({ code: 'duplicate_auto_item', detail: 'BASE_PAY' });
  });
  it('고지액 기준은 첫 계산부터 고지액을 쓰고 건강·요양을 중복 계산하지 않는다', () => {
    const base = input({ insuranceBasis: 'NOTICE', tax: { ...NOT_INSURED, insurance: { pension: ins('YES'), health: ins('YES'), employment: ins('YES'), accident: ins('NO') } }, notices: { pension: { employee: 90000, employer: 90000, id: 'np' }, health: { employee: 80000, employer: 80000, id: 'hi' }, employment: { employee: 20000, employer: 30000, id: 'ei' } } });
    const result = ok(calculateStatement(base));
    expect(result.totals.deduction).toBe(190000);
    expect(result.lines.some((l) => l.code === 'LTC')).toBe(false);
    expect(calculateStatement({ ...base, notices: {} }).blockers).toContainEqual({ code: 'notice_required', detail: 'health' });
  });
});

it('기본급 별칭으로 금액을 조정해도 기본급을 두 번 지급하지 않는다', () => {
  const result = ok(calculateStatement(input({ overrides: [{ itemCode: 'BASE_PAY', kind: 'PAYMENT', amount: 1000000 }] })));
  expect(result.totals.pay).toBe(1000000);
  expect(result.lines.filter((l) => l.kind === 'PAYMENT')).toHaveLength(1);
});
