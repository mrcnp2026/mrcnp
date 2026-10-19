// 연차 촉진 법정 기간 (근로기준법 61조) — 임시 계산
import { describe, expect, it } from 'vitest';
import { planDueFrom, promotionSchedule, scheduleWarnings } from '@/lib/leave-promotion-schedule';

describe('promotionSchedule', () => {
  it('1년 이상 · 회계연도(12/31 끝): 1차 7/1 ~ 7/10, 2차 10/31까지', () => {
    expect(promotionSchedule('2026-12-31', 'ANNUAL')).toEqual({ firstFrom: '2026-07-01', firstTo: '2026-07-10', planDays: 10, secondBy: '2026-10-31' });
  });
  it('1년 미만(월차): 1차 끝나기 3개월 전 기준 10일, 2차 1개월 전까지', () => {
    expect(promotionSchedule('2027-03-31', 'UNDER_ONE_YEAR')).toEqual({ firstFrom: '2027-01-01', firstTo: '2027-01-10', planDays: 10, secondBy: '2027-02-28' });
  });
  it('달 끝이 짧아도 날짜가 넘치지 않는다', () => {
    expect(promotionSchedule('2026-08-30', 'ANNUAL').firstFrom).toBe('2026-02-28');
  });
  it('계획 제출 기한 = 1차를 받은 날 + 10일', () => {
    expect(planDueFrom('2026-07-03', promotionSchedule('2026-12-31', 'ANNUAL'))).toBe('2026-07-13');
  });
  it('기간 밖에 보내면 경고', () => {
    const s = promotionSchedule('2026-12-31', 'ANNUAL');
    expect(scheduleWarnings(s, { firstSentOn: '2026-06-30' })).toEqual(['first_early']);
    expect(scheduleWarnings(s, { firstSentOn: '2026-07-11', secondSentOn: '2026-11-01' })).toEqual(['first_late', 'second_late']);
    expect(scheduleWarnings(s, { firstSentOn: '2026-07-05', secondSentOn: '2026-10-31' })).toEqual([]);
  });
});
