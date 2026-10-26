// 회사 공통 고정 수당 · 공제 (2026-10-25 의뢰인: 직원마다 입력하지 않고 한 번 정하면 전원에게)
import { describe, expect, it } from 'vitest';
import { cleanCommonItems, mergeAssigned } from '@/lib/payroll/common-items';
import { validateSetting } from '@/lib/payroll/settings';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

describe('공통 항목 검사', () => {
  it('비어 있으면 빈 목록, JSON 글자로 와도 읽는다', () => {
    expect(cleanCommonItems(undefined)).toEqual([]);
    expect(cleanCommonItems('[{"code":"MEAL_ALLOWANCE","amount":200000,"exceptIds":[]}]')).toEqual([{ code: 'MEAL_ALLOWANCE', amount: 200000, exceptIds: [] }]);
  });
  it('자동 계산 항목 · 같은 항목 두 번 · 음수 · 소수 · 잘못된 직원 번호는 거절한다', () => {
    expect(cleanCommonItems([{ code: 'BASE_PAY', amount: 1 }])).toBeNull();
    expect(cleanCommonItems([{ code: 'OVERTIME', amount: 1 }])).toBeNull();
    expect(cleanCommonItems([{ code: 'MEAL_ALLOWANCE', amount: 1 }, { code: 'MEAL_ALLOWANCE', amount: 2 }])).toBeNull();
    expect(cleanCommonItems([{ code: 'MEAL_ALLOWANCE', amount: -1 }])).toBeNull();
    expect(cleanCommonItems([{ code: 'MEAL_ALLOWANCE', amount: 1.5 }])).toBeNull();
    expect(cleanCommonItems([{ code: 'MEAL_ALLOWANCE', amount: 1, exceptIds: ['x'] }])).toBeNull();
    expect(cleanCommonItems('not json')).toBeNull();
  });
  it('0원은 허용한다(「안 적음」과 다르다) · 제외 직원은 중복을 합친다', () => {
    expect(cleanCommonItems([{ code: 'CAR_ALLOWANCE', amount: 0, exceptIds: [A, A] }])).toEqual([{ code: 'CAR_ALLOWANCE', amount: 0, exceptIds: [A] }]);
  });
});

describe('개인 항목과 합치기', () => {
  const common = [{ code: 'MEAL_ALLOWANCE', amount: 200000, exceptIds: [B] }];
  it('공통 항목은 전원에게 붙는다', () => {
    expect(mergeAssigned([], common, A)).toEqual([{ itemCode: 'MEAL_ALLOWANCE', amount: 200000, source: 'common' }]);
  });
  it('제외한 직원에게는 붙지 않는다', () => {
    expect(mergeAssigned([], common, B)).toEqual([]);
  });
  it('같은 항목이 개인 항목으로 있으면 개인 항목이 이긴다(금액이 다른 사람)', () => {
    expect(mergeAssigned([{ itemCode: 'MEAL_ALLOWANCE', amount: 100000 }], common, A)).toEqual([{ itemCode: 'MEAL_ALLOWANCE', amount: 100000, source: 'personal' }]);
  });
  it('다른 개인 항목은 그대로 두고 공통 항목을 더한다', () => {
    const r = mergeAssigned([{ itemCode: 'STUDENT_LOAN', amount: 50000 }], common, A);
    expect(r.map((x) => x.itemCode)).toEqual(['STUDENT_LOAN', 'MEAL_ALLOWANCE']);
  });
  it('공통 항목이 없으면 개인 항목만', () => {
    expect(mergeAssigned([{ itemCode: 'STUDENT_LOAN', amount: null }], undefined, A)).toEqual([{ itemCode: 'STUDENT_LOAN', amount: null, source: 'personal' }]);
  });
});

describe('사원급여 기본값 저장 검사', () => {
  it('공통 항목이 함께 저장되고, 없으면 칸을 만들지 않는다', () => {
    const base = { payType: '', smeTaxCut: false };
    expect(validateSetting('employee-defaults', { ...base })).toEqual({ ok: true, value: { payType: null, durunuri: false, smeTaxCut: false } });
    const r = validateSetting('employee-defaults', { ...base, commonItems: JSON.stringify([{ code: 'MEAL_ALLOWANCE', amount: 200000, exceptIds: [] }]) });
    expect(r).toEqual({ ok: true, value: { payType: null, durunuri: false, smeTaxCut: false, commonItems: [{ code: 'MEAL_ALLOWANCE', amount: 200000, exceptIds: [] }] } });
  });
  it('잘못된 공통 항목이면 저장을 거절한다', () => {
    expect(validateSetting('employee-defaults', { payType: '', smeTaxCut: false, commonItems: JSON.stringify([{ code: 'BASE_PAY', amount: 1 }]) }).ok).toBe(false);
  });
});

describe('공통 항목 급여 유형별 적용 (2026-10-25)', () => {
  const item = { code: 'POSITION_ALLOWANCE', amount: 100000, exceptIds: [] as string[], payTypes: ['MONTHLY' as const, 'ANNUAL' as const] };
  it('고른 유형에만 붙고, 유형을 안 골랐으면 전원에게 붙는다', () => {
    expect(mergeAssigned([], [item], A, 'MONTHLY')).toHaveLength(1);
    expect(mergeAssigned([], [item], A, 'HOURLY')).toHaveLength(0);
    expect(mergeAssigned([], [item], A, null)).toHaveLength(0);
    expect(mergeAssigned([], [{ ...item, payTypes: undefined }], A, 'HOURLY')).toHaveLength(1);
    expect(mergeAssigned([], [{ ...item, payTypes: undefined }], A)).toHaveLength(1);
  });
  it('검사: 셋 다 고르면 저장하지 않고, 모르는 유형은 거절', () => {
    expect(cleanCommonItems([{ code: 'MEAL_ALLOWANCE', amount: 1, payTypes: ['HOURLY', 'MONTHLY', 'ANNUAL'] }])).toEqual([{ code: 'MEAL_ALLOWANCE', amount: 1, exceptIds: [] }]);
    expect(cleanCommonItems([{ code: 'MEAL_ALLOWANCE', amount: 1, payTypes: ['MONTHLY'] }])).toEqual([{ code: 'MEAL_ALLOWANCE', amount: 1, exceptIds: [], payTypes: ['MONTHLY'] }]);
    expect(cleanCommonItems([{ code: 'MEAL_ALLOWANCE', amount: 1, payTypes: ['DAILY'] }])).toBeNull();
  });
});
