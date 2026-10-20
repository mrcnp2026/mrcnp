// 퇴직연금 DC 부담금 (묶음 32, 2026-10-20)
import { describe, expect, it } from 'vitest';
import { balanceOf, cleanMember, contributionOf, inDcPlan } from '@/lib/payroll/pension';

describe('퇴직연금 DC', () => {
  it('부담금 = 임금총액 ÷ 12, 원 단위 반올림', () => {
    expect([contributionOf(2_367_000), contributionOf(2_927_631), contributionOf(-5)]).toEqual([197_250, 243_969, 0]);
  });
  it('그 달 가입 중인가 — 가입일 · 끝난 날 · DB는 제외', () => {
    const m = { planKind: 'DC' as const, joinedOn: '2026-03-15', endedOn: null, active: true };
    expect([inDcPlan(m, '2026-02-01'), inDcPlan(m, '2026-03-01'), inDcPlan({ ...m, endedOn: '2026-05-31' }, '2026-06-01'), inDcPlan({ ...m, planKind: 'DB' }, '2026-04-01')]).toEqual([false, true, false, false]);
  });
  it('누계 = 처음 적립금 + 기준일 뒤 달의 부담금', () => {
    expect(balanceOf({ openingBalance: 1_000_000, openingAsOf: '2026-08-31' }, [{ month: '2026-08-01', amount: 200_000 }, { month: '2026-09-01', amount: 210_000 }])).toBe(1_210_000);
    expect(balanceOf({ openingBalance: null, openingAsOf: null }, [{ month: '2026-09-01', amount: 210_000 }])).toBe(210_000);
  });
  it('입력 검사', () => {
    expect(cleanMember({ planKind: 'DC', joinedOn: '2026-01-01', openingBalance: '1,500,000', openingAsOf: '2026-09-30', institution: ' 기업은행 ' })).toEqual({ planKind: 'DC', joinedOn: '2026-01-01', endedOn: null, institution: '기업은행', openingBalance: 1_500_000, openingAsOf: '2026-09-30', note: null });
    expect(cleanMember({ planKind: 'DC', joinedOn: '2026-01-01', openingBalance: '100' })).toEqual({ error: 'pension_opening' });
    expect(cleanMember({ planKind: 'XX', joinedOn: '2026-01-01' })).toEqual({ error: 'pension_plan' });
  });
});
