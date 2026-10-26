// 퇴직금 평균임금 항목 구분 (묶음 36, 2026-10-26) — 저장 검사 · 이름 추천 · 엑셀에서 값이 지워지지 않는지
import { describe, expect, it } from 'vitest';
import { guessAverageKind } from '@/lib/payroll/item-picks';
import { itemToRow, readItemSheet } from '@/lib/payroll/item-sheet';
import { STANDARD_ITEMS, validateItem } from '@/lib/payroll/settings';

const base = { code: 'JOB_ALLOWANCE', kind: 'PAYMENT', koName: '직무수당', enName: 'Job', calcKind: 'FIXED', defaultAmount: '', taxTreatment: 'TAXABLE', taxExemptLimit: '', ordinaryWage: 'INCLUDED', sort: 0 };
const meal = STANDARD_ITEMS.find((i) => i.code === 'MEAL_ALLOWANCE')!;

describe('항목 저장 검사', () => {
  it('구분을 안 고르면(빈 칸) 「정하지 않음」', () => {
    const v = validateItem({ ...base, averageWageKind: '' });
    expect(v.ok && v.value.averageWageKind).toBe(null);
  });
  it('월 임금 · 연 상여 · 뺌만 받는다', () => {
    for (const k of ['MONTHLY', 'BONUS', 'EXCLUDED'] as const) {
      const v = validateItem({ ...base, averageWageKind: k });
      expect(v.ok && v.value.averageWageKind).toBe(k);
    }
    expect(validateItem({ ...base, averageWageKind: '아무거나' }).ok).toBe(false);
  });
  it('공제 항목에는 구분이 없다', () => {
    const v = validateItem({ ...base, kind: 'DEDUCTION', taxTreatment: 'NOT_APPLICABLE', averageWageKind: 'MONTHLY' });
    expect(v.ok && v.value.averageWageKind).toBe(null);
  });
});

describe('이름으로 추천 (고르는 건 사람)', () => {
  it('성과급 · 상여는 연 상여, 식대 · 직책 · 직무수당은 월 임금, 모르면 추천 없음', () => {
    expect(guessAverageKind('성과급')).toBe('BONUS');
    expect(guessAverageKind('명절상여')).toBe('BONUS');
    expect(guessAverageKind('식대')).toBe('MONTHLY');
    expect(guessAverageKind('직책수당')).toBe('MONTHLY');
    expect(guessAverageKind('직무(급)수당')).toBe('MONTHLY');
    expect(guessAverageKind('특별한 것')).toBe(null);
    expect(guessAverageKind('')).toBe(null);
  });
});

describe('엑셀', () => {
  const current = [{ ...meal, averageWageKind: 'MONTHLY' as const, version: 2, validFrom: '2026-01-01' }];
  it('내려받은 그대로 올리면 「그대로」', () => {
    const cells = itemToRow(current[0]);
    expect(cells.averageWageKind).toBe('월 임금');
    expect(readItemSheet([{ rowNo: 2, cells }], current, '2026-10-26')[0].state).toBe('same');
  });
  it('「평균임금 구분」 칸이 아예 없는 예전 엑셀은 값을 지우지 않는다', () => {
    const { averageWageKind: _omit, ...old } = itemToRow(current[0]);
    expect(readItemSheet([{ rowNo: 2, cells: old }], current, '2026-10-26')[0].state).toBe('same');
  });
  it('칸이 있는데 비워 올리면 「정하지 않음」으로 바뀐 줄', () => {
    const [l] = readItemSheet([{ rowNo: 2, cells: { ...itemToRow(current[0]), averageWageKind: '' } }], current, '2026-10-26');
    expect(l).toMatchObject({ state: 'changed', changes: ['averageWageKind'] });
    expect(l.input?.averageWageKind).toBe(null);
  });
  it('모르는 낱말은 문제 줄', () => {
    expect(readItemSheet([{ rowNo: 2, cells: { ...itemToRow(current[0]), averageWageKind: '아무거나' } }], current, '2026-10-26')[0].problem).toBe('bad_value');
  });
});

import { applyAverageKinds, calcRetirement, type AverageKind } from '@/lib/payroll/retirement';
import { AUTO_PAYMENT_CODES } from '@/lib/payroll/engine/reserved-items';

describe('퇴직금 3개월 임금 · 직전 1년 상여 바로잡기', () => {
  // 의뢰인 본인 명세서(2026.05 · 06): 월 지급 3,967,557 = 기본급 2,775,668 + 식대 200,000 + 직무 198,378 + 직책 198,378 + 시간외 357,080 + 성과급 238,053
  const month = [
    { code: 'BASE_PAY', label: '기본급', amount: 2_775_668 }, { code: 'MEAL_ALLOWANCE', label: '식대', amount: 200_000 }, { code: 'JOB', label: '직무수당', amount: 198_378 },
    { code: 'POS', label: '직책수당', amount: 198_378 }, { code: 'FIXED_OT', label: '시간외수당', amount: 357_080 }, { code: 'PERF', label: '성과급', amount: 238_053 },
  ];
  const lines = (n: number) => Array.from({ length: n }, () => month).flat();
  const base = { wage3m: 3 * 3_967_557, bonus1y: 0, lines3m: lines(3), lines1y: lines(12) };
  const skip = (c: string) => AUTO_PAYMENT_CODES.has(c);

  it('구분을 하나도 안 정했으면 지금까지와 똑같다 — 기본급 · 연장은 알리지 않고 나머지 이름만 알려 준다', () => {
    const r = applyAverageKinds({ ...base, kindOf: () => null, skip });
    expect(r).toMatchObject({ wage3m: 11_902_671, bonus1y: 0, moved: 0, left: 0 });
    expect(r.undecided).toEqual(['식대', '직무수당', '직책수당', '시간외수당', '성과급']);
  });
  it('성과급이 매달 같은 금액이면 「연 상여」로 정해도 평균임금이 같다(3/12 × 12개월 = 3개월)', () => {
    const kindOf = (c: string): AverageKind => (c === 'PERF' ? 'BONUS' : 'MONTHLY');
    const r = applyAverageKinds({ ...base, kindOf, skip });
    expect(r).toMatchObject({ wage3m: 3 * (3_967_557 - 238_053), bonus1y: 12 * 238_053, moved: 3 * 238_053 });
    const input = (w: number, b: number) => ({ periodFrom: '2021-01-04', periodTo: '2026-10-31', excludedDays: 0, wage3m: w, days3m: 92, bonus1y: b, leavePay1y: 0, ordinaryDaily: null });
    const before = calcRetirement(input(11_902_671, 0));
    const after = calcRetirement(input(r.wage3m!, r.bonus1y));
    expect(after.amount).toBe(before.amount);
    expect(before.amount).toBe(22_617_910);
  });
  it('연 1회만 받는 성과급이면 월 임금으로 볼 때보다 퇴직금이 작아진다(상여는 3/12만 반영)', () => {
    const kindOf = (c: string): AverageKind => (c === 'PERF' ? 'BONUS' : 'MONTHLY');
    const once = [...lines(3).filter((l) => l.code !== 'PERF')]; // 최근 석 달에는 성과급 없음
    const r = applyAverageKinds({ wage3m: 3 * (3_967_557 - 238_053), bonus1y: 0, lines3m: once, lines1y: [...once, { code: 'PERF', label: '성과급', amount: 2_856_636 }], kindOf, skip });
    expect(r.bonus1y).toBe(2_856_636);
    expect(r.wage3m).toBe(3 * (3_967_557 - 238_053));
  });
  it('「뺌」은 3개월 임금에서만 빼고 상여로 옮기지 않는다 · 석 달 임금이 없으면 비워 둔다', () => {
    const r = applyAverageKinds({ ...base, kindOf: (c) => (c === 'MEAL_ALLOWANCE' ? 'EXCLUDED' : 'MONTHLY'), skip });
    expect(r).toMatchObject({ wage3m: 3 * (3_967_557 - 200_000), bonus1y: 0, left: 600_000 });
    expect(applyAverageKinds({ ...base, wage3m: null, lines3m: [], kindOf: () => 'MONTHLY', skip }).wage3m).toBe(null);
  });
});

import { cleanMember, returnOf } from '@/lib/payroll/pension';

describe('퇴직연금 계좌 평가금액(묶음 36) — 의뢰인 본인 계좌 숫자', () => {
  const member = { openingBalance: 15_055_642, openingAsOf: '2025-07-01', marketValue: null as number | null, marketValueAsOf: null as string | null };
  const rows = ['2025-07-01', '2025-08-01', '2025-09-01'].map((month) => ({ month, amount: 314_759 }));
  it('평가금액이 없으면 운용수익도 없다(0이 아니라 비움)', () => {
    expect(returnOf(member, rows)).toBe(null);
  });
  it('평가금액 − 그날까지 쌓은 원금 = 운용수익 (그날 이후 부담금은 빼지 않는다)', () => {
    // 2025-09-30 평가금액 16,500,000 → 원금 15,055,642 + 3개월(7 · 8 · 9월) 314,759 × 3 = 15,999,919 → 운용수익 500,081
    expect(returnOf({ ...member, marketValue: 16_500_000, marketValueAsOf: '2025-09-30' }, [...rows, { month: '2025-10-01', amount: 314_759 }])).toBe(500_081);
  });
  it('기준일이 처음 적립금 기준일보다 앞이면 계산하지 않는다', () => {
    expect(returnOf({ ...member, marketValue: 1, marketValueAsOf: '2025-06-30' }, rows)).toBe(null);
  });
  it('입력 검사: 평가금액과 기준일은 같이 · 모르는 값은 막는다', () => {
    const ok = { planKind: 'DC', joinedOn: '2021-01-04', openingBalance: 15_055_642, openingAsOf: '2025-07-01' };
    expect(cleanMember({ ...ok, marketValue: '16,500,000', marketValueAsOf: '2025-09-30' })).toMatchObject({ marketValue: 16_500_000, marketValueAsOf: '2025-09-30' });
    expect(cleanMember({ ...ok, marketValue: '', marketValueAsOf: '' })).toMatchObject({ marketValue: null, marketValueAsOf: null });
    expect(cleanMember({ ...ok, marketValue: 100, marketValueAsOf: '' })).toEqual({ error: 'pension_market' });
    expect(cleanMember({ ...ok, marketValue: '', marketValueAsOf: '2025-09-30' })).toEqual({ error: 'pension_market' });
  });
});
