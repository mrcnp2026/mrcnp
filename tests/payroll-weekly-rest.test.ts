// 시급제 주휴 · 유급휴일 시간과 「일정 전 출근은 근무로 치지 않기」 (2026-10-16 의뢰인, 26.08 대장)
import { describe, expect, it } from 'vitest';
import { restAndHolidayMinutes } from '@/lib/payroll/engine/weekly-rest';
import { calcWorkMinutes } from '@/lib/worktime';
import { kstDateTime } from '@/lib/time';
import type { WorkRule } from '@/lib/types';

const RULE: WorkRule = { startTime: '08:00', endTime: '17:00', lateGraceMin: 0, breakStart: '12:00', breakEnd: '13:00', extraBreaks: [{ start: '17:00', end: '17:30' }], roundStepMin: 15, workdays: [1, 2, 3, 4, 5], weeklyRestDay: 7 };
const AUG = { from: '2026-08-01', last: '2026-08-31', ruleAt: () => RULE, holidays: [{ date: '2026-08-15', kind: 'public' as const }, { date: '2026-08-17', kind: 'public' as const }] };

describe('주휴 · 유급휴일 시간', () => {
  it('26년 8월: 일요일 5번 = 주휴 40시간, 평일 공휴일(8/17 대체공휴일) = 유휴 8시간 — 토요일 광복절(8/15)은 넣지 않는다', () => {
    const r = restAndHolidayMinutes(AUG);
    expect(r.weeklyRestMinutes / 60).toBe(40);
    expect(r.paidHolidays).toEqual(['2026-08-17']);
    expect(r.paidHolidayMinutes / 60).toBe(8);
  });
  it('달 중간 입사 · 퇴사는 재직 기간의 날만 센다', () => {
    const r = restAndHolidayMinutes({ ...AUG, startsOn: '2026-08-18', endsOn: '2026-08-28' });
    expect(r.weeklyRestDays).toEqual(['2026-08-23']);
    expect(r.paidHolidayMinutes).toBe(0);
  });
  it('2025년 12월: 일요일 4번 + 성탄절 = 40시간 (황진성 명세서의 주휴유휴 40)', () => {
    const r = restAndHolidayMinutes({ from: '2025-12-01', last: '2025-12-31', ruleAt: () => RULE, holidays: [{ date: '2025-12-25', kind: 'public' }] });
    expect((r.weeklyRestMinutes + r.paidHolidayMinutes) / 60).toBe(40);
  });
});

describe('일정 전 출근은 근무로 치지 않는다 (clipBeforeStart)', () => {
  const at = (hm: string) => kstDateTime('2026-08-06', hm);
  const ctx = { workDate: '2026-08-06', dayType: 'workday' as const, weekRegularMinutesSoFar: 0, weekTotalMinutesSoFar: 0 };
  it('정규 08:00 일정, 07:03 출근 – 17:00 퇴근 → 8시간 (예전에는 57분이 연장으로 들어갔다)', () => {
    const before = calcWorkMinutes([{ in: at('07:03'), out: at('17:00') }], RULE, ctx);
    const after = calcWorkMinutes([{ in: at('07:03'), out: at('17:00') }], { ...RULE, clipBeforeStart: true }, ctx);
    expect(before.overtimeMinutes).toBe(57);
    expect([after.regularMinutes, after.overtimeMinutes]).toEqual([480, 0]);
  });
  it('조기 07:30 템플릿(그날 시작 07:30), 07:26 출근 – 17:00 → 07:30부터 8.5시간, 0.5시간 연장(대장의 조기 0.5)', () => {
    const r = calcWorkMinutes([{ in: at('07:26'), out: at('17:00') }], { ...RULE, startTime: '07:30', clipBeforeStart: true }, ctx);
    expect([r.regularMinutes, r.overtimeMinutes]).toEqual([480, 30]);
  });
  it('늦게 온 날은 그대로 (지각은 따로 15분 올림)', () => {
    const r = calcWorkMinutes([{ in: at('08:01'), out: at('17:00') }], { ...RULE, clipBeforeStart: true }, ctx);
    expect(r.payableMinutes).toBe(465); // 08:15 ~ 17:00 − 점심 60분
  });
});

describe('토요일(쉬는 날) 근무 = 휴일근무 (결정 사항 급여-43, 2026-10-16)', () => {
  const sat = { workDate: '2026-08-22', dayType: 'rest_off' as const, weekRegularMinutesSoFar: 32 * 60, weekTotalMinutesSoFar: 32 * 60 };
  const at = (hm: string) => kstDateTime('2026-08-22', hm);
  it('주 40시간을 못 채운 주라도 토요일 8시간은 휴일근로(1.5배 줄)로 간다 — 김종철96 8/22', () => {
    const before = calcWorkMinutes([{ in: at('08:00'), out: at('17:00') }], RULE, sat);
    const after = calcWorkMinutes([{ in: at('08:00'), out: at('17:00') }], { ...RULE, restOffAsHoliday: true }, sat);
    expect([before.regularMinutes, before.holidayMinutes]).toEqual([480, 0]);
    expect([after.regularMinutes, after.overtimeMinutes, after.holidayMinutes, after.holidayOver8Minutes]).toEqual([0, 0, 480, 0]);
  });
  it('토요일 8시간 넘는 시간은 휴일 8시간 초과(2배 줄)', () => {
    const r = calcWorkMinutes([{ in: at('08:00'), out: at('20:30') }], { ...RULE, restOffAsHoliday: true }, sat);
    expect([r.holidayWithin8Minutes, r.holidayOver8Minutes]).toEqual([480, 180]); // 12.5시간 − 점심 1 − 저녁 휴게 0.5 = 11시간
  });
});
