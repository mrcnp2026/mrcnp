import { expect, it } from 'vitest';
import { roundedAttendance } from '@/lib/payroll/engine/rounded-attendance';
import { computeEmployeeDays } from '@/lib/period';
import { kstDateTime } from '@/lib/time';
import type { WorkRule } from '@/lib/types';
const rule: WorkRule = { startTime: '09:00', endTime: '18:00', lateGraceMin: 0, breakStart: '12:00', breakEnd: '13:00', roundStepMin: 30, workdays: [1,2,3,4,5], weeklyRestDay: 7 };
it('승인시간 총합을 비례 배분하지 않고 끊은 출퇴근의 연장·야간을 재계산한다', () => {
  const date = '2026-10-12';
  const days = computeEmployeeDays({ events: [], approvedCorrections: [], rule, holidays: [], from: date, to: date, deemed: (d) => d === date ? { in: kstDateTime(date, '09:01'), out: kstDateTime(date, '22:14') } : null });
  const rounded = roundedAttendance(days, () => rule).get(date)!;
  expect(rounded.netMinutes).toBe(690);
  expect(rounded.overtimeMinutes).toBe(240); // 일정 끝(18:00) 뒤 4시간은 모두 연장 — 늦게 온 30분으로 채우지 않는다 (급여-61, 2026-11-02)
  expect(rounded.nightMinutes).toBe(0);
});

it('일정 07:40 · 15분 끊기 — 07:35에 오면 07:40부터, 07:41에 오면 07:45부터 센다 (2026-11-03 의뢰인)', async () => {
  const { calcWorkMinutes } = await import('@/lib/worktime');
  const r740: WorkRule = { startTime: '07:40', endTime: '17:00', lateGraceMin: 0, breakStart: '12:00', breakEnd: '13:00', roundStepMin: 15, clipBeforeStart: true, workdays: [1,2,3,4,5], weeklyRestDay: 7 };
  const date = '2026-10-12';
  const day = (inAt: string) => computeEmployeeDays({ events: [], approvedCorrections: [], rule: r740, holidays: [], from: date, to: date, deemed: (d) => d === date ? { in: kstDateTime(date, inAt), out: kstDateTime(date, '17:00') } : null });
  expect(roundedAttendance(day('07:35'), () => r740).get(date)!.netMinutes).toBe(500); // 07:40–17:00 − 점심 60
  expect(roundedAttendance(day('07:41'), () => r740).get(date)!.netMinutes).toBe(495);
  const pay = (inAt: string) => calcWorkMinutes([{ in: kstDateTime(date, inAt), out: kstDateTime(date, '17:00') }], r740, { workDate: date } as never).payableMinutes;
  expect(pay('07:35')).toBe(500);
  expect(pay('07:41')).toBe(495);
});

it('늦은 출근 1분 단위 설정 — 07:31 출근은 07:31부터 (일정 07:30 · 15분 끊기, 퇴근은 내림 그대로)', async () => {
  const { calcWorkMinutes } = await import('@/lib/worktime');
  const r: WorkRule = { startTime: '07:30', endTime: '17:00', lateGraceMin: 0, breakStart: '12:00', breakEnd: '13:00', roundStepMin: 15, clipBeforeStart: true, lateRound: 'minute', workdays: [1,2,3,4,5], weeklyRestDay: 7 };
  const date = '2026-10-12';
  const pay = (inAt: string, rule: WorkRule) => calcWorkMinutes([{ in: kstDateTime(date, inAt), out: kstDateTime(date, '17:10') }], rule, { workDate: date } as never).payableMinutes;
  expect(pay('07:31', r)).toBe(509); // 07:31–17:00(17:10 내림) − 점심 60
  expect(pay('07:46', { ...r, lateRound: 'floor' })).toBe(495);
  expect(pay('07:31', { ...r, lateRound: 'ceil' })).toBe(495);
  const day = computeEmployeeDays({ events: [], approvedCorrections: [], rule: r, holidays: [], from: date, to: date, deemed: (d) => d === date ? { in: kstDateTime(date, '07:31'), out: kstDateTime(date, '17:10') } : null });
  expect(roundedAttendance(day, () => r).get(date)!.netMinutes).toBe(509);
});
