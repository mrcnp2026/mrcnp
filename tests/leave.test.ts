// 연차 (②-2 7-3) — 잔여·참고 계산기·신청 일수·날짜별 휴가
import { describe, expect, it } from 'vitest';
import { calcLeaveBalance, countLeaveDays, isFullDayLeave, leaveByDate, suggestAnnualDays, type LeaveGrant, type LeaveRequest, type LeaveType } from '@/lib/leave';
import type { DayType } from '@/lib/types';

const TYPES: LeaveType[] = [
  { code: 'annual', name: '연차', isPaid: true, deductsBalance: true, dayUnit: 1 },
  { code: 'half', name: '반차', isPaid: true, deductsBalance: true, dayUnit: 0.5 },
  { code: 'quarter', name: '반반차', isPaid: true, deductsBalance: true, dayUnit: 0.25 },
  { code: 'sick', name: '병가', isPaid: false, deductsBalance: false, dayUnit: 1 },
];
const T = (c: string) => TYPES.find((t) => t.code === c)!;
// 2026-10-05(월) ~ 10-11(일), 10-09 한글날
const dayTypeOf = (d: string): DayType => (d === '2026-10-09' ? 'holiday' : ['2026-10-10', '2026-10-11'].includes(d) ? 'rest_off' : 'workday');
const grant = (p: Partial<LeaveGrant> = {}): LeaveGrant => ({ id: 'g', employeeId: 'e', periodLabel: '2026', grantedDays: 15, carriedDays: 0, basis: 'hire_date', effectiveFrom: '2026-01-01', note: null, ...p });
const req = (p: Partial<LeaveRequest>): LeaveRequest => ({ id: Math.random().toString(), employeeId: 'e', typeCode: 'annual', startDate: '2026-10-05', endDate: '2026-10-05', days: 1, reason: null, status: 'approved', ...p });

describe('잔여 (7-3 요점 5: 대기는 빼지 않고 따로)', () => {
  it('부여 + 이월 − 승인 사용 = 잔여, 대기·거부·취소·병가는 잔여에 안 들어감', () => {
    const b = calcLeaveBalance({
      grants: [grant({ carriedDays: 1.5 })],
      requests: [req({ days: 2 }), req({ typeCode: 'half', days: 0.5 }), req({ status: 'pending', days: 1 }), req({ status: 'rejected', days: 3 }), req({ status: 'cancelled', days: 1 }), req({ typeCode: 'sick', days: 2 })],
      types: TYPES,
      asOf: '2026-10-02',
    });
    expect(b).toMatchObject({ granted: 16.5, used: 2.5, remaining: 14, pending: 1 });
  });
  it('부여가 없으면 0, 새 부여가 시작되면 이전 기간 사용은 빠진다', () => {
    expect(calcLeaveBalance({ grants: [], requests: [], types: TYPES, asOf: '2026-10-02' }).grant).toBeNull();
    const b = calcLeaveBalance({
      grants: [grant(), grant({ id: 'g2', periodLabel: '2027', effectiveFrom: '2027-01-01' })],
      requests: [req({ startDate: '2026-12-30', endDate: '2026-12-30' }), req({ startDate: '2027-01-05', endDate: '2027-01-05' })],
      types: TYPES,
      asOf: '2027-02-01',
    });
    expect([b.grant?.periodLabel, b.used, b.remaining]).toEqual(['2027', 1, 14]);
  });
});

describe('참고 계산기 (4-7) — 결과는 참고용 표시가 붙는다', () => {
  it('1년 미만 월 1일 · 1년 15일 · 3년 16일 · 21년 이상 25일', () => {
    expect(suggestAnnualDays({ hiredOn: '2026-03-15', asOf: '2026-10-14', basis: 'hire_date' }).days).toBe(6);
    expect(suggestAnnualDays({ hiredOn: '2025-03-15', asOf: '2026-10-14', basis: 'hire_date' }).days).toBe(15);
    expect(suggestAnnualDays({ hiredOn: '2023-01-01', asOf: '2026-01-01', basis: 'hire_date' }).days).toBe(16);
    expect(suggestAnnualDays({ hiredOn: '1990-01-01', asOf: '2026-01-01', basis: 'hire_date' }).days).toBe(25);
    expect(suggestAnnualDays({ hiredOn: '2026-01-01', asOf: '2026-10-01', basis: 'fiscal_year' })).toMatchObject({ isReference: true });
  });
});

describe('신청 일수 — 서버가 계산 (근무일만, 소수)', () => {
  it('월~일 연차 = 공휴일·주말 빼고 4일', () => {
    expect(countLeaveDays({ type: T('annual'), startDate: '2026-10-05', endDate: '2026-10-11', dayTypeOf })).toBe(4);
  });
  it('반차·반반차는 하루짜리 근무일만', () => {
    expect(countLeaveDays({ type: T('half'), startDate: '2026-10-05', endDate: '2026-10-05', dayTypeOf })).toBe(0.5);
    expect(countLeaveDays({ type: T('quarter'), startDate: '2026-10-05', endDate: '2026-10-05', dayTypeOf })).toBe(0.25);
    expect(countLeaveDays({ type: T('half'), startDate: '2026-10-05', endDate: '2026-10-06', dayTypeOf })).toBe(0);
    expect(countLeaveDays({ type: T('half'), startDate: '2026-10-09', endDate: '2026-10-09', dayTypeOf })).toBe(0);
  });
});

describe('날짜별 휴가 (B-2: 유급휴가일은 결근이 아니다)', () => {
  it('승인된 것만, 근무일만, 반차 둘이면 하루', () => {
    const m = leaveByDate({
      requests: [req({ startDate: '2026-10-08', endDate: '2026-10-10' }), req({ typeCode: 'half', startDate: '2026-10-05', endDate: '2026-10-05' }), req({ typeCode: 'half', startDate: '2026-10-05', endDate: '2026-10-05' }), req({ status: 'pending', startDate: '2026-10-06', endDate: '2026-10-06' })],
      types: TYPES,
      dayTypeOf,
    });
    expect([...m.keys()].sort()).toEqual(['2026-10-05', '2026-10-08']);
    expect(isFullDayLeave(m.get('2026-10-05'))).toBe(true);
    expect(isFullDayLeave(m.get('2026-10-08'))).toBe(true);
    expect(isFullDayLeave(undefined)).toBe(false);
  });
});
