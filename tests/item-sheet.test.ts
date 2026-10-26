// 지급 · 공제 항목 엑셀 (2026-10-20) — 새 항목 / 바뀜 / 그대로 / 문제를 가른다. 빈 칸을 0으로 보지 않는다.
import { describe, expect, it } from 'vitest';
import { itemToRow, readItemSheet } from '@/lib/payroll/item-sheet';
import { STANDARD_ITEMS } from '@/lib/payroll/settings';

const meal = STANDARD_ITEMS.find((i) => i.code === 'MEAL_ALLOWANCE')!;
const current = [{ ...meal, version: 2, validFrom: '2026-01-01' }];
const row = (o: Record<string, unknown>, rowNo = 2) => ({ rowNo, cells: { ...itemToRow(meal), ...o } });

describe('readItemSheet', () => {
  it('내려받은 그대로 올리면 「그대로」', () => {
    expect(readItemSheet([row({})], current, '2026-10-20')[0].state).toBe('same');
  });
  it('기본 금액을 넣으면 바뀐 칸만 알려 주고, 시작일이 비면 오늘부터 · 지금 판 번호로', () => {
    const [l] = readItemSheet([row({ defaultAmount: 200000 })], current, '2026-10-20');
    expect(l).toMatchObject({ state: 'changed', changes: ['defaultAmount'], validFrom: '2026-10-20', expectedVersion: 2 });
    expect(l.input?.defaultAmount).toBe(200000);
  });
  it('없는 코드는 새 항목 · 한국어 낱말로 받는다', () => {
    const [l] = readItemSheet([row({ code: 'car_allowance', koName: '차량유지비', enName: 'Car', taxTreatment: '일부 비과세', ordinaryWage: '제외', fixedAllowance: '예' })], current, '2026-10-20');
    expect(l).toMatchObject({ state: 'new', code: 'CAR_ALLOWANCE', expectedVersion: 0 });
    expect(l.input).toMatchObject({ taxTreatment: 'PARTIAL', ordinaryWage: 'EXCLUDED', fixedAllowance: true, defaultAmount: null });
  });
  it('문제 줄: 종류 바꾸기 · 모르는 낱말 · 같은 코드 두 번 · 잘못된 코드', () => {
    const r = readItemSheet(
      [row({ kind: '공제', taxExemptLimit: '' }, 2), row({ calcKind: '아무거나' , code: 'X1' }, 3), row({ code: 'DUP', koName: 'a' }, 4), row({ code: 'DUP', koName: 'b' }, 5), row({ defaultAmount: 1, validFrom: '2025-12-01' }, 6), row({ code: '한글' }, 7)],
      current, '2026-10-20',
    );
    expect(r.map((l) => l.problem)).toEqual(['kind_locked', 'bad_value', undefined, 'duplicate', 'duplicate', 'bad_code']);
  });
  it('지금 판보다 앞선 시작일로는 고칠 수 없다', () => {
    expect(readItemSheet([row({ defaultAmount: 1, validFrom: '2025-12-01' })], current, '2026-10-20')[0].problem).toBe('past_date');
  });
  it('과세 항목에 비과세 한도를 적으면 문제', () => {
    expect(readItemSheet([row({ taxTreatment: '과세', taxExemptLimit: 100000 })], current, '2026-10-20')[0].problem).toBe('bad_value');
  });
});
