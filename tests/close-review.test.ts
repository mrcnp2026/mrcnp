// 근태 월 마감 검토 (PRD v1.3 35.2 · 39.2 「마감」: 미해결 항목이 있으면 마감 불가)
import { describe, expect, it } from 'vitest';
import { isMonth, monthSpan, reviewMonth } from '@/lib/close-review';

const none = { correction: 0, punch: 0, overtime: 0, leave: 0, work: 0, shift: 0 };
const day = (workDate: string, hasRecord: boolean, deemed = false, payableMinutes = 0) => ({ workDate, hasRecord, deemed, payableMinutes, netMinutes: payableMinutes });

describe('마감 검토', () => {
  it('기록이 있는 날이 전부 확정되고 대기 요청이 없으면 마감할 수 있다', () => {
    const r = reviewMonth({ days: [day('2026-09-01', true, false, 480), day('2026-09-02', true, false, 465), day('2026-09-03', false)], confirmed: new Set(['2026-09-01', '2026-09-02']), pending: none });
    expect(r).toMatchObject({ recordDays: ['2026-09-01', '2026-09-02'], unconfirmed: [], blockers: 0, payableMinutes: 945 });
  });
  it('확정되지 않은 날이 하루라도 있으면 막힌다', () => {
    const r = reviewMonth({ days: [day('2026-09-01', true), day('2026-09-02', true)], confirmed: new Set(['2026-09-01']), pending: none });
    expect(r.unconfirmed).toEqual(['2026-09-02']);
    expect(r.blockers).toBe(1);
  });
  it('대기 중인 요청이 있으면 막힌다 (정정 · 휴가 · 연장근로 등)', () => {
    const r = reviewMonth({ days: [day('2026-09-01', true)], confirmed: new Set(['2026-09-01']), pending: { ...none, leave: 1, overtime: 2 } });
    expect(r).toMatchObject({ pendingTotal: 3, blockers: 3 });
  });
  it('간주 근무일은 확정을 요구하지 않는다 (찍은 기록이 있어도 일정 시간으로 계산한다)', () => {
    const r = reviewMonth({ days: [day('2026-09-01', true, true, 480), day('2026-09-02', false, true, 480)], confirmed: new Set(), pending: none });
    expect(r).toMatchObject({ recordDays: [], deemedDays: 2, blockers: 0, payableMinutes: 960 });
  });
  it('기록이 하나도 없는 달도 마감할 수 있다 (기록 없는 월급자를 빼먹지 않는다)', () => {
    expect(reviewMonth({ days: [day('2026-09-01', false)], confirmed: new Set(), pending: none }).blockers).toBe(0);
  });
});

describe('달 범위', () => {
  it('다음 달 첫날 전까지 · 윤년 · 12월', () => {
    expect(monthSpan('2026-09')).toEqual({ from: '2026-09-01', to: '2026-10-01', last: '2026-09-30' });
    expect(monthSpan('2028-02')).toEqual({ from: '2028-02-01', to: '2028-03-01', last: '2028-02-29' });
    expect(monthSpan('2026-12')).toEqual({ from: '2026-12-01', to: '2027-01-01', last: '2026-12-31' });
    expect(isMonth('2026-13')).toBe(false);
    expect(isMonth('2026-09')).toBe(true);
  });
});
