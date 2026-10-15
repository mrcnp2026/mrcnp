// 근태 월 집계 → 급여 계산의 시간 입력
import { describe, expect, it } from 'vitest';
import { timeFromAttendance, type AttendanceFacts } from '@/lib/payroll/engine/attendance';

const facts = (over: Partial<AttendanceFacts> = {}): AttendanceFacts => ({ regularMinutes: 9600, netMinutes: 9900, payableMinutes: 9840, approved: { overtime: 0, night: 0, holidayWithin8: 0, holidayOver8: 0 }, pendingMinutes: 0, paidLeaveDays: 0, flags: [], unconfirmedDays: 0, ...over });

describe('실제 시간 기준', () => {
  it('인정된 연장 · 휴일만 지급 시간에 들어간다 (찍힌 300분 가운데 승인된 120분만)', () => {
    const r = timeFromAttendance(facts({ approved: { overtime: 120, night: 60, holidayWithin8: 480, holidayOver8: 30 }, paidLeaveDays: 1.5 }), 'ACTUAL', 'HOURLY');
    expect(r.blockers).toEqual([]);
    expect(r.time).toEqual({ workedMinutes: 9600 + 120 + 510, overtimeMinutes: 120, nightMinutes: 60, holidayMinutes: 510, holidayOver8Minutes: 30, paidLeaveMinutes: 720, unpaidLeaveMinutes: 0, lateMinutes: 0 });
  });
});

describe('막는 경우', () => {
  it('승인 대기 연장 · 미확정 기록 · 막는 표시가 남아 있으면 계산하지 않는다', () => {
    const r = timeFromAttendance(facts({ pendingMinutes: 30, unconfirmedDays: 2, flags: ['block:퇴근 미기록', 'warn:주 52시간 초과'] }), 'ACTUAL', 'MONTHLY');
    expect(r.time).toBeNull();
    expect(r.blockers).toEqual([{ code: 'overtime_pending' }, { code: 'attendance_unconfirmed' }, { code: 'attendance_flag', detail: '퇴근 미기록' }]);
  });
  it('끊은 시간 · 일정 시간 기준인데 나눌 시간(연장 · 야간 · 휴일)이 있으면 섞어서 계산하지 않고 막는다', () => {
    const withOt = facts({ approved: { overtime: 60, night: 0, holidayWithin8: 0, holidayOver8: 0 } });
    expect(timeFromAttendance(withOt, 'ROUNDED', 'MONTHLY').blockers).toEqual([{ code: 'time_basis_unsupported', detail: 'ROUNDED' }]);
    expect(timeFromAttendance(withOt, 'SCHEDULE', 'MONTHLY').blockers).toEqual([{ code: 'time_basis_unsupported', detail: 'SCHEDULE' }]);
  });
});

describe('끊은 시간 · 일정 시간 기준', () => {
  it('나눌 시간이 없으면 끊은 급여용 시간 합계를 쓴다', () => {
    expect(timeFromAttendance(facts(), 'ROUNDED', 'HOURLY').time?.workedMinutes).toBe(9840);
  });
  it('일정 시간 기준: 월급제는 계산되고(기본급이 시간에 달려 있지 않다) 시급제는 아직 막는다', () => {
    expect(timeFromAttendance(facts(), 'SCHEDULE', 'MONTHLY').time).not.toBeNull();
    expect(timeFromAttendance(facts(), 'SCHEDULE', 'HOURLY').blockers).toEqual([{ code: 'time_basis_unsupported', detail: 'SCHEDULE' }]);
  });
});

it('가산수당의 실제/반올림 시간 선택이 기본급 지급시간과 따로 적용된다', () => {
  const a = facts({ approved: { overtime: 45, night: 15, holidayWithin8: 0, holidayOver8: 0 }, rounded: { regularMinutes: 9000, approved: { overtime: 30, night: 0, holidayWithin8: 0, holidayOver8: 0 } }, unpaidLeaveDays: 0.5, lateMinutes: 10 });
  const actual = timeFromAttendance(a, 'ACTUAL', 'MONTHLY', 480, 'ACTUAL');
  const rounded = timeFromAttendance(a, 'ACTUAL', 'MONTHLY', 480, 'ROUNDED');
  expect(actual.time?.workedMinutes).toBe(rounded.time?.workedMinutes);
  expect(actual.time?.overtimeMinutes).toBe(45);
  expect(rounded.time?.overtimeMinutes).toBe(30);
  expect(rounded.time?.unpaidLeaveMinutes).toBe(240);
});
