// 계획 근무 시간 = 일정 길이 − 겹치는 휴게 (홈 「이번주 근무」의 계획 눈금)
import { describe, expect, it } from 'vitest';
import { planMinutes } from '@/lib/shifts';

const r = (startTime: string, endTime: string, breakStart: string | null = '12:00:00', breakEnd: string | null = '13:00:00') => ({ startTime, endTime, breakStart, breakEnd });

describe('planMinutes', () => {
  it('08–17, 점심 1시간 → 8시간', () => expect(planMinutes(r('08:00', '17:00'))).toBe(480));
  it('휴게가 없으면 일정 길이 그대로', () => expect(planMinutes(r('08:00', '17:00', null, null))).toBe(540));
  it('휴게와 일부만 겹치면 겹친 만큼만', () => {
    expect(planMinutes(r('12:30', '17:00'))).toBe(240);
    expect(planMinutes(r('08:00', '12:00'))).toBe(240);
    expect(planMinutes(r('17:30', '20:30'))).toBe(180);
  });
  it('끝이 시작보다 이르면 0', () => expect(planMinutes(r('17:00', '08:00'))).toBe(0));
});
