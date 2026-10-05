// 설정 화면 입력값 (근무시간 · 휴일 · 사무실 인터넷 주소)
import { describe, expect, it } from 'vitest';
import { normalizeCidr, validateHoliday, validateRule } from '@/lib/settings-rules';

const TODAY = '2026-10-05';
const rule = (over: Record<string, unknown> = {}) => ({ startTime: '09:00', endTime: '18:00', lateGraceMin: 10, breakStart: '12:00', breakEnd: '13:00', workdays: [1, 2, 3, 4, 5], weeklyRestDay: 7, effectiveFrom: '2026-11-01', ...over });

describe('근무시간', () => {
  it('바른 값은 그대로, 요일은 정렬·중복 제거', () => {
    const r = validateRule(rule({ workdays: [5, 1, 1, 3, 2, 4], lateGraceMin: '10' }), TODAY);
    expect(r).toEqual({ ok: true, value: { startTime: '09:00', endTime: '18:00', lateGraceMin: 10, breakStart: '12:00', breakEnd: '13:00', workdays: [1, 2, 3, 4, 5], weeklyRestDay: 7, effectiveFrom: '2026-11-01' } });
  });
  it('지난 날짜부터 적용할 수 없다 (이미 본 숫자가 바뀐다) — 오늘부터는 된다', () => {
    expect(validateRule(rule({ effectiveFrom: '2026-10-04' }), TODAY)).toEqual({ ok: false, code: 'past_date' });
    expect(validateRule(rule({ effectiveFrom: TODAY }), TODAY).ok).toBe(true);
  });
  it('시작이 끝보다 늦거나 모양이 틀리면 거절', () => {
    expect(validateRule(rule({ startTime: '18:00', endTime: '09:00' }), TODAY)).toEqual({ ok: false, code: 'invalid_time' });
    expect(validateRule(rule({ startTime: '9:00' }), TODAY)).toEqual({ ok: false, code: 'invalid_time' });
  });
  it('휴게는 둘 다 있거나 둘 다 없어야 하고, 근무시간 안이어야 한다', () => {
    expect(validateRule(rule({ breakEnd: '' }), TODAY)).toEqual({ ok: false, code: 'invalid_break' });
    expect(validateRule(rule({ breakStart: '08:00', breakEnd: '09:30' }), TODAY)).toEqual({ ok: false, code: 'invalid_break' });
    expect(validateRule(rule({ breakStart: '', breakEnd: '' }), TODAY)).toMatchObject({ ok: true, value: { breakStart: null, breakEnd: null } });
  });
  it('근무 요일이 없거나, 주휴일이 근무 요일이면 거절', () => {
    expect(validateRule(rule({ workdays: [] }), TODAY)).toEqual({ ok: false, code: 'invalid_workdays' });
    expect(validateRule(rule({ workdays: [1, 2, 3, 4, 5, 7] }), TODAY)).toEqual({ ok: false, code: 'invalid_workdays' });
    expect(validateRule(rule({ workdays: [1, 8] }), TODAY)).toEqual({ ok: false, code: 'invalid_workdays' });
  });
  it('지각 유예는 0~120분 정수', () => {
    expect(validateRule(rule({ lateGraceMin: -1 }), TODAY)).toEqual({ ok: false, code: 'invalid_input' });
    expect(validateRule(rule({ lateGraceMin: 1.5 }), TODAY)).toEqual({ ok: false, code: 'invalid_input' });
    expect(validateRule(rule({ lateGraceMin: '' }), TODAY)).toEqual({ ok: false, code: 'invalid_input' });
  });
});

describe('휴일', () => {
  it('이번 달과 앞으로의 날짜만 (지난 달은 집계가 달라진다)', () => {
    expect(validateHoliday({ date: '2026-10-01', label: '창립기념일', kind: 'company' }, TODAY).ok).toBe(true);
    expect(validateHoliday({ date: '2026-09-30', label: '창립기념일', kind: 'company' }, TODAY)).toEqual({ ok: false, code: 'past_date' });
  });
  it('이름은 1~40자, 종류는 공휴일·회사 휴일', () => {
    expect(validateHoliday({ date: '2026-12-25', label: ' ', kind: 'public' }, TODAY)).toEqual({ ok: false, code: 'invalid_label' });
    expect(validateHoliday({ date: '2026-12-25', label: '성탄절', kind: 'weekly_rest' }, TODAY)).toEqual({ ok: false, code: 'invalid_input' });
    expect(validateHoliday({ date: '2026-13-01', label: 'x', kind: 'public' }, TODAY)).toEqual({ ok: false, code: 'invalid_input' });
  });
});

describe('사무실 인터넷 주소', () => {
  it('IPv4 주소 하나는 /32, 대역은 네트워크 주소로 맞춘다', () => {
    expect(normalizeCidr(' 203.0.113.7 ')).toBe('203.0.113.7/32');
    expect(normalizeCidr('203.0.113.77/24')).toBe('203.0.113.0/24');
  });
  it('IPv6 주소 하나는 /64 대역으로 ← R-6의 3', () => {
    expect(normalizeCidr('2001:db8:1:2:aaaa:bbbb:cccc:dddd')).toBe('2001:db8:1:2::/64');
  });
  it('너무 넓은 대역·틀린 값은 거절', () => {
    expect(normalizeCidr('0.0.0.0/0')).toBeNull();
    expect(normalizeCidr('10.0.0.0/8')).toBeNull();
    expect(normalizeCidr('2001:db8::/32')).toBeNull();
    expect(normalizeCidr('사무실')).toBeNull();
    expect(normalizeCidr('')).toBeNull();
    expect(normalizeCidr('203.0.113.7/33')).toBeNull();
  });
});
