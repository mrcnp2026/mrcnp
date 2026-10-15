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
  expect(rounded.overtimeMinutes).toBe(210);
  expect(rounded.nightMinutes).toBe(0);
});
