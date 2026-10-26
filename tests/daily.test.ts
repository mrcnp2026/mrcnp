// 일용직 지급 계산 — 하루 단위 세금(임시 규칙), 모르는 상태는 계산하지 않는다
import { describe, expect, it } from 'vitest';
import { calcDaily, dailyIncomeTax, toDailyItems, type DailyTerms, type DailyWork } from '@/lib/payroll/daily';

const terms: DailyTerms = { taxState: 'DAILY', ei: 'NO', np: 'NO', hi: 'NO' };
const work = (o: Partial<DailyWork>): DailyWork => ({ id: 'w1', workDate: '2026-10-01', project: 'A', quantity: 1, dayRate: 200_000, items: [], status: 'CONFIRMED', ...o });

describe('dailyIncomeTax', () => {
  it('15만원 이하는 세금이 없다', () => {
    expect(dailyIncomeTax(150_000)).toBe(0);
    expect(dailyIncomeTax(100_000)).toBe(0);
  });
  it('(일급 − 15만) × 2.7%, 10원 미만 버림', () => {
    expect(dailyIncomeTax(200_000)).toBe(1_350); // 50,000 × 0.027
    expect(dailyIncomeTax(250_000)).toBe(2_700);
    expect(dailyIncomeTax(233_333)).toBe(2_240); // 83,333 × 0.027 = 2,249.99 → 2,240
  });
  it('1,000원 미만이면 떼지 않는다 (소액부징수)', () => {
    expect(dailyIncomeTax(187_000)).toBe(0); // 37,000 × 0.027 = 999
    expect(dailyIncomeTax(187_100)).toBe(1_000); // 37,100 × 0.027 = 1,001.7 → 1,000
  });
});

describe('calcDaily', () => {
  it('하루마다 따로 계산해 더한다 (합쳐서 계산하지 않는다)', () => {
    const r = calcDaily([work({ id: 'a' }), work({ id: 'b', workDate: '2026-10-02', dayRate: 150_000 }), work({ id: 'c', workDate: '2026-10-03', quantity: 1.5 })], terms);
    if (r.state !== 'OK') throw new Error('blocked');
    // 20만 → 1,350 / 15만 → 0 / 30만(1.5공수) → 4,050
    expect(r.days.map((d) => d.incomeTax)).toEqual([1_350, 0, 4_050]);
    expect(r.days.map((d) => d.localTax)).toEqual([130, 0, 400]);
    expect(r).toMatchObject({ workDays: 3.5, gross: 650_000, taxable: 650_000, incomeTax: 5_400, localTax: 530, net: 650_000 - 5_400 - 530, rule: 'daily-tax-temp-1' });
  });
  it('같은 날 여러 줄은 그 날 합계로 한 번만 세금을 계산한다', () => {
    const r = calcDaily([work({ id: 'a' }), work({ id: 'b', quantity: 0.5 })], terms);
    if (r.state !== 'OK') throw new Error('blocked');
    // 20만 + 10만 = 30만 → (30만 − 15만) × 2.7% = 4,050 (줄마다 따로면 1,350 + 0)
    expect(r.days).toHaveLength(1);
    expect(r).toMatchObject({ workDays: 1.5, gross: 300_000, incomeTax: 4_050, localTax: 400 });
  });
  it('비과세 항목은 세금 계산에서 빠지고, 공제 항목은 실지급에서 빠진다', () => {
    const r = calcDaily([work({ items: [{ label: '식대', kind: 'NONTAX', amount: 10_000 }, { label: '고용보험', kind: 'DEDUCTION', amount: 1_800 }, { label: '수당', kind: 'TAXABLE', amount: 50_000 }] })], terms);
    if (r.state !== 'OK') throw new Error('blocked');
    expect(r).toMatchObject({ gross: 260_000, taxable: 250_000, nontax: 10_000, incomeTax: 2_700, localTax: 270, otherDeduction: 1_800, net: 260_000 - 2_700 - 270 - 1_800 });
  });
  it('세금 대상이 아니면 세금 없이', () => {
    const r = calcDaily([work({})], { ...terms, taxState: 'NONE' });
    expect(r.state === 'OK' && r.incomeTax === 0 && r.net === 200_000).toBe(true);
  });
  it('무효 줄은 빼고 계산한다', () => {
    const r = calcDaily([work({ id: 'a' }), work({ id: 'b', status: 'VOID', dayRate: 999_999 })], terms);
    expect(r.state === 'OK' && r.gross === 200_000 && r.workDays === 1).toBe(true);
  });
  it('모르는 상태 · 확정 안 한 근무 · 근무 없음은 계산하지 않는다', () => {
    expect(calcDaily([work({})], { ...terms, taxState: 'UNKNOWN' })).toMatchObject({ state: 'BLOCKED', blockers: ['tax_unknown'] });
    expect(calcDaily([work({})], { ...terms, ei: 'UNKNOWN' })).toMatchObject({ state: 'BLOCKED', blockers: ['insurance_unknown'] });
    expect(calcDaily([work({ status: 'DRAFT' })], terms)).toMatchObject({ state: 'BLOCKED', blockers: ['unconfirmed_work'] });
    expect(calcDaily([work({ status: 'VOID' })], terms)).toMatchObject({ state: 'BLOCKED', blockers: ['no_work'] });
  });
  it('보험이 「예」면 계산은 하되 보험료를 계산하지 않았다고 알린다', () => {
    const r = calcDaily([work({})], { ...terms, ei: 'YES' });
    expect(r.state).toBe('OK');
    expect(r.warnings).toEqual(['insurance_not_calculated']);
  });
});

describe('toDailyItems', () => {
  it('글자 금액을 받아 주고 틀린 값은 통째로 거부한다', () => {
    expect(toDailyItems([{ label: ' 식대 ', kind: 'NONTAX', amount: '10,000' }])).toEqual([{ label: '식대', kind: 'NONTAX', amount: 10_000 }]);
    expect(toDailyItems([{ label: '', kind: 'NONTAX', amount: 1 }])).toBeNull();
    expect(toDailyItems([{ label: 'x', kind: 'BONUS', amount: 1 }])).toBeNull();
    expect(toDailyItems([{ label: 'x', kind: 'TAXABLE', amount: -5 }])).toBeNull();
    expect(toDailyItems('x')).toBeNull();
    expect(toDailyItems([])).toEqual([]);
  });
});

describe('같은 날 다른 현장 (2026-10-20)', () => {
  it('같은 날 현장이 둘이면 알리고, 계산은 그대로 한다', () => {
    const r = calcDaily([work({ id: 'a', project: 'A', quantity: 0.5 }), work({ id: 'b', project: 'B', quantity: 0.5 })], terms);
    if (r.state !== 'OK') throw new Error('blocked');
    expect(r.warnings).toContain('same_day_projects');
    expect(r.gross).toBe(200_000);
  });
  it('같은 현장을 구간으로 나눈 것은 알리지 않는다', () => {
    const r = calcDaily([work({ id: 'a', quantity: 0.5 }), work({ id: 'b', quantity: 0.5 })], terms);
    expect(r.warnings).not.toContain('same_day_projects');
  });
});

// 프리랜서(사업소득 3.3%) — 2026-10-22 의뢰인
describe('사업소득 3.3%', () => {
  const biz: DailyTerms = { taxState: 'BUSINESS', ei: 'UNKNOWN', np: 'UNKNOWN', hi: 'UNKNOWN' };
  const row = (id: string, workDate: string, quantity: number, dayRate: number, items: DailyWork['items'] = []): DailyWork => ({ id, workDate, project: '', quantity, dayRate, items, status: 'CONFIRMED' });
  it('월 합계 × 3%, 10원 미만 버림, 지방소득세 10% — 보험 「모름」이어도 막지 않는다', () => {
    const r = calcDaily([row('a', '2026-11-30', 1, 2_000_000)], biz);
    expect(r.state).toBe('OK');
    if (r.state !== 'OK') return;
    expect(r).toMatchObject({ gross: 2_000_000, incomeTax: 60_000, localTax: 6_000, net: 1_934_000, rule: 'business-tax-temp-1' });
  });
  it('시간당: 수량(시간) × 단가, 한 달 합계로 한 번 계산', () => {
    const r = calcDaily([row('a', '2026-11-03', 8, 12_345), row('b', '2026-11-04', 7.5, 12_345)], biz);
    if (r.state !== 'OK') throw new Error('blocked');
    const gross = Math.round(8 * 12_345) + Math.round(7.5 * 12_345);
    expect(r.gross).toBe(gross);
    expect(r.incomeTax).toBe(Math.floor(Math.floor((gross * 3) / 100) / 10) * 10);
  });
  it('소득세 1,000원 미만이면 떼지 않는다', () => {
    const r = calcDaily([row('a', '2026-11-03', 1, 30_000)], biz);
    if (r.state !== 'OK') throw new Error('blocked');
    expect(r.incomeTax).toBe(0);
    expect(r.localTax).toBe(0);
  });
  it('비과세로 넣은 금액도 기준에 넣고 경고', () => {
    const r = calcDaily([row('a', '2026-11-03', 1, 100_000, [{ label: '교통비', kind: 'NONTAX', amount: 50_000 }])], biz);
    if (r.state !== 'OK') throw new Error('blocked');
    expect(r.taxable).toBe(150_000);
    expect(r.nontax).toBe(0);
    expect(r.incomeTax).toBe(4_500);
    expect(r.warnings).toContain('business_no_exempt');
  });
});
