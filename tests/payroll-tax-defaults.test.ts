// 4대보험 · 세무 회사 기본값 (2026-10-25 의뢰인: 직원마다 가입 여부를 넣지 않게)
import { describe, expect, it } from 'vitest';
import { setupGaps } from '@/lib/payroll/contract';
import { validateSetting } from '@/lib/payroll/settings';
import { cleanTaxDefaults, fillState, synthTax } from '@/lib/payroll/tax-defaults';

const ALL_YES = { pension: 'YES', health: 'YES', employment: 'YES', accident: 'YES' };

describe('회사 기본값 검사', () => {
  it('안 정했으면 쓰지 않는다 (null)', () => {
    expect(cleanTaxDefaults(undefined)).toBeNull();
    expect(cleanTaxDefaults({ insurance: { pension: '', health: null, employment: null, accident: null } })).toBeNull();
  });
  it('넷을 모두 정해야 쓴다 — 일부만이면 거절', () => {
    expect(cleanTaxDefaults({ insurance: ALL_YES })).toEqual({ insurance: ALL_YES });
    expect(cleanTaxDefaults({ insurance: { ...ALL_YES, accident: '' } })).toBeUndefined();
    expect(cleanTaxDefaults({ insurance: { ...ALL_YES, health: 'MAYBE' } })).toBeUndefined();
    expect(cleanTaxDefaults('not json')).toBeUndefined();
  });
  it('미가입도 기본으로 정할 수 있다', () => {
    expect(cleanTaxDefaults(JSON.stringify({ insurance: { ...ALL_YES, employment: 'NO' } }))?.insurance.employment).toBe('NO');
  });
});

describe('직원 값과 합치기', () => {
  const d = { insurance: { pension: 'YES', health: 'YES', employment: 'NO', accident: 'YES' } } as const;
  it('「모름」일 때만 회사 기본으로 채운다', () => {
    expect(fillState('UNKNOWN', 'employment', d)).toBe('NO');
    expect(fillState('YES', 'employment', d)).toBe('YES'); // 직원 값이 우선
    expect(fillState('NO', 'pension', d)).toBe('NO');
  });
  it('기본값이 없으면 그대로 둔다(예전과 같다)', () => {
    expect(fillState('UNKNOWN', 'pension', null)).toBe('UNKNOWN');
  });
  it('세무 판이 없는 직원은 기본값 · 가족 1명 · 자녀 0명 · 학자금 없음으로 계산한다', () => {
    const t = synthTax(d, 100);
    expect(t).toMatchObject({ withholdingRatio: 100, familyCount: 1, childCount: 0, studentLoan: { state: 'NO' } });
    expect(t.insurance.employment.state).toBe('NO');
    expect(t.insurance.pension.reportedWage).toBeNull();
  });
});

describe('준비 상태', () => {
  const contract = { payType: 'MONTHLY', monthlyHours: 209, annualDivisor: null } as const;
  it('회사 기본값이 없으면 세무 판이 없는 직원은 미완료(예전과 같다)', () => {
    expect(setupGaps({ contract, tax: null, joinedOn: '2026-01-01' })).toEqual(['no_tax']);
  });
  it('회사 기본값이 있으면 세무 판이 없어도 준비됨', () => {
    expect(setupGaps({ contract, tax: null, joinedOn: '2026-01-01', taxDefaults: true })).toEqual([]);
  });
  it('계약이 없으면 기본값이 있어도 미완료', () => {
    expect(setupGaps({ contract: null, tax: null, joinedOn: '2026-01-01', taxDefaults: true })).toEqual(['no_contract']);
  });
});

describe('저장 검사', () => {
  it('사원급여 기본값에 함께 저장된다', () => {
    const r = validateSetting('employee-defaults', { payType: '', smeTaxCut: false, taxDefaults: { insurance: ALL_YES } });
    expect(r).toEqual({ ok: true, value: { payType: null, durunuri: false, smeTaxCut: false, taxDefaults: { insurance: ALL_YES } } });
  });
  it('일부만 정하면 거절한다', () => {
    expect(validateSetting('employee-defaults', { payType: '', smeTaxCut: false, taxDefaults: { insurance: { ...ALL_YES, accident: null } } }).ok).toBe(false);
  });
});
