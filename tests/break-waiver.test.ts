// 휴게 안 함 표시 (급여-60, 2026-11-02) — 26.10 3공장 대장 10/7: 18:51 퇴근, 17:00–17:30 휴게 때 일함 → 연장 1.75시간
import { expect, it } from 'vitest';
import { waiveBreaks } from '@/lib/break-waiver';
import { kstDateTime } from '@/lib/time';
import type { WorkRule } from '@/lib/types';
import { calcWorkMinutes } from '@/lib/worktime';

const RULE: WorkRule = { startTime: '08:00', endTime: '17:00', lateGraceMin: 0, breakStart: '12:00', breakEnd: '13:00', extraBreaks: [{ start: '17:00', end: '17:30' }], roundStepMin: 15, clipBeforeStart: true, workdays: [1, 2, 3, 4, 5], weeklyRestDay: 7 };
const at = (hm: string) => kstDateTime('2026-10-07', hm);
const ctx = { workDate: '2026-10-07', dayType: 'workday' as const, weekRegularMinutesSoFar: 0, weekTotalMinutesSoFar: 0 };

it('표시가 없으면 저녁 휴게를 빼서 연장 1.25시간', () => {
  expect(calcWorkMinutes([{ in: at('07:26'), out: at('18:51') }], RULE, ctx).overtimeMinutes).toBe(75);
});
it('17:00 휴게를 「휴게 안 함」으로 표시하면 그 30분이 근무로 들어가 연장 1.75시간 (대장과 같음)', () => {
  const r = calcWorkMinutes([{ in: at('07:26'), out: at('18:51') }], waiveBreaks(RULE, new Set(['17:00'])), ctx);
  expect([r.regularMinutes, r.overtimeMinutes]).toEqual([480, 105]);
});
it('점심 휴게만 표시하면 점심만 빠지고 저녁 휴게는 그대로 뺀다', () => {
  const w = waiveBreaks(RULE, new Set(['12:00']));
  expect([w.breakStart, w.breakEnd, w.extraBreaks]).toEqual([null, null, [{ start: '17:00', end: '17:30' }]]);
});
