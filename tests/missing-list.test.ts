// 출근/퇴근 누락 목록 (2026-10-10)
import { describe, expect, it } from 'vitest';
import { addDays } from '@/lib/calendar';
import { missingOfDay, missingRange } from '@/lib/missing-list';

const at = (s: string) => new Date(`${s}+09:00`);
const base = { workDate: '2026-10-08', plan: { startTime: '08:00', endTime: '17:00' }, deemed: false, excused: false, outGraceHours: 3, inGraceMin: 60 };

describe('missingOfDay', () => {
  it('출근 누락: 일정이 있는데 기록이 없고 시작 + 유예가 지남', () => {
    expect(missingOfDay({ ...base, pairs: [], now: at('2026-10-08T09:01:00') })).toBe('in');
    expect(missingOfDay({ ...base, pairs: [], now: at('2026-10-08T08:59:00') })).toBe(null);
  });
  it('일정 없는 날 · 간주 근무 · 휴가/외근은 출근 누락이 아니다', () => {
    const now = at('2026-10-09T12:00:00');
    expect(missingOfDay({ ...base, plan: null, pairs: [], now })).toBe(null);
    expect(missingOfDay({ ...base, deemed: true, pairs: [], now })).toBe(null);
    expect(missingOfDay({ ...base, excused: true, pairs: [], now })).toBe(null);
  });
  it('퇴근 누락: 출근만 있고 일정 끝 + 유예가 지남', () => {
    const pairs = [{ in: at('2026-10-08T07:55:00'), out: null }];
    expect(missingOfDay({ ...base, pairs, now: at('2026-10-08T19:59:00') })).toBe(null);
    expect(missingOfDay({ ...base, pairs, now: at('2026-10-08T20:01:00') })).toBe('out');
  });
  it('늦게 출근했으면 출근 시각부터 유예를 잰다 · 일정 없는 날도 퇴근 누락은 잡는다', () => {
    const late = [{ in: at('2026-10-08T18:00:00'), out: null }];
    expect(missingOfDay({ ...base, pairs: late, now: at('2026-10-08T20:30:00') })).toBe(null);
    expect(missingOfDay({ ...base, pairs: late, now: at('2026-10-08T21:01:00') })).toBe('out');
    expect(missingOfDay({ ...base, plan: null, pairs: late, now: at('2026-10-09T09:00:00') })).toBe('out');
  });
  it('출근·퇴근이 다 있으면 누락 아님 · 휴가 날이라도 열린 출근은 퇴근 누락', () => {
    expect(missingOfDay({ ...base, pairs: [{ in: at('2026-10-08T08:00:00'), out: at('2026-10-08T17:00:00') }], now: at('2026-10-09T09:00:00') })).toBe(null);
    expect(missingOfDay({ ...base, excused: true, pairs: [{ in: at('2026-10-08T08:00:00'), out: null }], now: at('2026-10-09T09:00:00') })).toBe('out');
  });
});

describe('missingRange', () => {
  const today = '2026-10-10';
  it('기본은 오늘까지 14일', () => {
    expect(missingRange(undefined, undefined, today, addDays)).toEqual({ from: '2026-09-27', to: '2026-10-10' });
  });
  it('앞날은 오늘로 · 뒤집힌 기간은 하루로 · 이상한 값은 기본', () => {
    expect(missingRange('2026-10-01', '2026-12-01', today, addDays)).toEqual({ from: '2026-10-01', to: '2026-10-10' });
    expect(missingRange('2026-10-09', '2026-10-05', today, addDays)).toEqual({ from: '2026-10-05', to: '2026-10-05' });
    expect(missingRange('x', '2026-13-40', today, addDays)).toEqual({ from: '2026-09-27', to: '2026-10-10' });
  });
  it('너무 긴 기간은 끝에서 62일로', () => {
    expect(missingRange('2026-01-01', '2026-10-10', today, addDays)).toEqual({ from: '2026-08-10', to: '2026-10-10' });
  });
});
