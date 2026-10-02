// 직원 본인 화면용 읽기 (미기록 배너·내 기록·정정 요청). 서버 전용. 본인 것만 읽는다.
import 'server-only';
import { resolveDayType } from '@/config/labor-rules';
import { OFFICE } from '@/config/office';
import { addDays } from '@/lib/calendar';
import { findMissingPunches, type MissingPunch } from '@/lib/missing-punch';
import { daysFor, loadPeriod, type CorrectionRow, type EventRow, type OvertimeRow } from '@/lib/period-data';
import type { DayRow } from '@/lib/period';
import { toKstDate } from '@/lib/time';

export type EmployeeRecent = {
  missing: MissingPunch[];
  days: DayRow[];
  events: EventRow[];
  corrections: CorrectionRow[];
  overtime: OvertimeRow[];
  hasRule: boolean;
};

export async function loadEmployeeRecent(employeeId: string, now: Date, lookback = 14): Promise<EmployeeRecent> {
  const today = toKstDate(now);
  const from = addDays(today, -(lookback - 1));
  const data = await loadPeriod(from, today, OFFICE.practiceMode);
  const events = data.events.filter((e) => e.employeeId === employeeId);
  const corrections = data.corrections.filter((c) => c.employeeId === employeeId);
  const me = data.people.find((p) => p.id === employeeId);
  let missing: MissingPunch[] = [];
  if (data.rule) {
    const dayTypes = Object.fromEntries(
      [...Array(lookback)].map((_, i) => addDays(from, i)).map((d) => [d, resolveDayType(d, data.rule!, data.holidays)]),
    );
    // 7-8: 앱을 열 때 계산한다. 본인 화면에만 (요점 6)
    missing = findMissingPunches({
      employeeId,
      events,
      approvedCorrections: corrections.filter((c) => c.status === 'approved'),
      pendingCorrections: corrections.filter((c) => c.status === 'pending'),
      rule: data.rule,
      dayTypes,
      now,
      outGraceHours: OFFICE.missingOutGraceHours,
      inGraceMin: OFFICE.missingInGraceMin,
      joinedOn: me?.startsOn ?? null,
      lookbackDays: lookback,
    });
  }
  return {
    missing,
    days: daysFor(data, employeeId, from, today),
    events: events.filter((e) => e.workDate >= from),
    corrections: corrections.filter((c) => c.workDate >= from),
    overtime: data.overtime.filter((o) => o.employeeId === employeeId),
    hasRule: !!data.rule,
  };
}
