// 시간 단위 휴가 (2026-10-10): 종류 입력 검사 · 신청 시각 · 그날 일정에 반영
import { describe, expect, it } from 'vitest';
import { isFullDayLeave, leaveByDate, leaveTypeName, leaveWindow, roundDays, trimRuleByLeave, unitOfHours, validateLeaveType, type LeaveRequest, type LeaveType } from '@/lib/leave';
import type { WorkRule } from '@/lib/types';

const rule: WorkRule = { startTime: '08:00:00', endTime: '17:00:00', lateGraceMin: 0, breakStart: '12:00:00', breakEnd: '13:00:00', workdays: [1, 2, 3, 4, 5], weeklyRestDay: 7 };
const base = { name: '10시 반차', hours: 4, startTime: '10:00', endTime: '15:00', groupName: ' 1. 연차휴가 ', isPaid: true, deductsBalance: true };

describe('validateLeaveType', () => {
  it('시간 ÷ 8 = 차감 일수', () => {
    const v = validateLeaveType(base);
    expect(v).toEqual({ ok: true, value: { name: '10시 반차', hours: 4, dayUnit: 0.5, startTime: '10:00', endTime: '15:00', groupName: '1. 연차휴가', isPaid: true, deductsBalance: true } });
    expect(unitOfHours(1)).toBe(0.125);
    expect(unitOfHours(0.5)).toBe(0.0625);
    expect(unitOfHours(8)).toBe(1);
  });
  it('시각은 비워도 된다 (둘 다)', () => {
    const v = validateLeaveType({ ...base, startTime: '', endTime: null });
    expect(v.ok && v.value.startTime).toBe(null);
  });
  it('잘못된 값은 거절', () => {
    expect(validateLeaveType({ ...base, name: ' ' })).toEqual({ ok: false, code: 'invalid_name' });
    expect(validateLeaveType({ ...base, hours: 0.25 })).toEqual({ ok: false, code: 'invalid_hours' });
    expect(validateLeaveType({ ...base, hours: 9 })).toEqual({ ok: false, code: 'invalid_hours' });
    expect(validateLeaveType({ ...base, endTime: null })).toEqual({ ok: false, code: 'invalid_time' });
    expect(validateLeaveType({ ...base, startTime: '15:00', endTime: '10:00' })).toEqual({ ok: false, code: 'invalid_time' });
    expect(validateLeaveType({ ...base, isPaid: 'yes' })).toEqual({ ok: false, code: 'invalid_input' });
  });
});

describe('leaveWindow', () => {
  const half: LeaveType = { code: 'half', name: '반차', isPaid: true, deductsBalance: true, dayUnit: 0.5, hours: 4 };
  it('종류에 정해진 시각이 먼저', () => {
    expect(leaveWindow({ ...half, startTime: '10:00', endTime: '15:00' }, '09:00')).toEqual({ ok: true, startTime: '10:00', endTime: '15:00' });
  });
  it('정해진 시각이 없으면 적은 시작 시각 + 길이', () => {
    expect(leaveWindow(half, '13:00')).toEqual({ ok: true, startTime: '13:00', endTime: '17:00' });
    expect(leaveWindow({ ...half, dayUnit: 0.0625, hours: 0.5 }, '16:30')).toEqual({ ok: true, startTime: '16:30', endTime: '17:00' });
  });
  it('안 적으면 시각 없음 · 하루짜리는 시각 없음', () => {
    expect(leaveWindow(half, '')).toEqual({ ok: true, startTime: null, endTime: null });
    expect(leaveWindow({ ...half, dayUnit: 1, hours: 8 }, '09:00')).toEqual({ ok: true, startTime: null, endTime: null });
  });
  it('이상한 시각 · 자정을 넘기면 거절', () => {
    expect(leaveWindow(half, '25:00')).toEqual({ ok: false });
    expect(leaveWindow(half, '21:00')).toEqual({ ok: false });
  });
});

describe('trimRuleByLeave', () => {
  const t = (s: string, e: string) => trimRuleByLeave(rule, [{ startTime: s, endTime: e }]);
  it('오전 휴가: 시작이 휴가 끝으로', () => {
    expect(t('08:00', '10:00').startTime).toBe('10:00');
  });
  it('오전 반차가 점심 시작에 끝나면 시작은 점심 뒤', () => {
    const r = t('08:00', '12:00');
    expect([r.startTime, r.endTime]).toEqual(['13:00', '17:00']);
  });
  it('오후 휴가: 끝이 휴가 시작으로 (점심 안이면 점심 시작)', () => {
    expect(t('15:00', '17:00').endTime).toBe('15:00');
    expect(t('13:00', '17:00').endTime).toBe('12:00');
  });
  it('일정보다 일찍 시작해도 시작을 덮으면 반영', () => {
    expect(t('07:00', '09:00').startTime).toBe('09:00');
  });
  it('한가운데 외출 · 하루 전체 · 시각 없는 휴가는 그대로', () => {
    expect(t('10:00', '11:00')).toBe(rule);
    expect(t('08:00', '17:00')).toBe(rule);
    expect(trimRuleByLeave(rule, [{ startTime: null, endTime: null }])).toBe(rule);
  });
  it('오전·오후 두 건', () => {
    const r = trimRuleByLeave(rule, [{ startTime: '16:00', endTime: '17:00' }, { startTime: '08:00', endTime: '09:00' }]);
    expect([r.startTime, r.endTime]).toEqual(['09:00', '16:00']);
  });
});

describe('작은 단위', () => {
  const types: LeaveType[] = [{ code: 'c_out', name: '외출 1H', isPaid: true, deductsBalance: true, dayUnit: 0.125, hours: 1 }];
  const req = (id: string, s: string, e: string): LeaveRequest => ({ id, employeeId: 'a', typeCode: 'c_out', startDate: '2026-10-12', endDate: '2026-10-12', days: 0.125, reason: null, status: 'approved', startTime: s, endTime: e });
  it('1시간 휴가 8건 = 하루 (부동소수점 찌꺼기 없이)', () => {
    expect(roundDays(0.0625 * 3)).toBe(0.1875);
    const m = leaveByDate({ requests: [...Array(8)].map((_, i) => req(String(i), '08:00', '09:00')), types, dayTypeOf: () => 'workday' });
    expect(isFullDayLeave(m.get('2026-10-12'))).toBe(true);
    expect(m.get('2026-10-12')![0]).toMatchObject({ startTime: '08:00', endTime: '09:00', unit: 0.125 });
  });
  it('이름: 기본 종류는 번역, 만든 종류는 적은 이름', () => {
    const tr = Object.assign((k: string) => `T:${k}`, { has: (k: string) => k === 'type.annual' });
    expect(leaveTypeName(types, 'annual', tr)).toBe('T:type.annual');
    expect(leaveTypeName(types, 'c_out', tr)).toBe('외출 1H');
    expect(leaveTypeName(types, 'gone', tr)).toBe('gone');
  });
});
