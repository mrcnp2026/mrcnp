// 근태 월 집계 → 급여 계산의 시간 입력 (PRD v1.3 7.1 · 7.2). 순수함수.
// ★ 인정(승인)된 연장 · 야간 · 휴일만 쓴다. 승인 대기 · 미검토 연장을 자동으로 인정하지도 버리지도 않는다 — 남아 있으면 차단한다.
// ★ 시간 축을 섞지 않는다. 지금 근태 계산은 「실제 시간」으로만 연장 · 야간 · 휴일을 나눈다.
//   그래서 계약의 지급 기준이 「끊은 급여용 시간」 · 「일정 시간」인데 나눌 시간(연장 · 야간 · 휴일)이 있으면 계산하지 않고 차단한다.
import type { Blocker, EngineTime } from './engine';

export type AttendanceFacts = {
  regularMinutes: number;
  netMinutes: number; // 실제 근로 합계
  payableMinutes: number; // 끊는 단위를 적용한 급여용 시간 합계
  approved: { overtime: number; night: number; holidayWithin8: number; holidayOver8: number };
  pendingMinutes: number; // 승인 대기 + 미검토 연장 · 야간 · 휴일
  paidLeaveDays: number;
  flags: string[]; // 'block:…' / 'warn:…'
  unconfirmedDays: number;
};

export function timeFromAttendance(a: AttendanceFacts, basis: 'ACTUAL' | 'ROUNDED' | 'SCHEDULE', payType: 'MONTHLY' | 'HOURLY' | 'ANNUAL', dayMinutes = 480): { time: EngineTime | null; blockers: Blocker[] } {
  const blockers: Blocker[] = [];
  if (a.pendingMinutes > 0) blockers.push({ code: 'overtime_pending' });
  if (a.unconfirmedDays > 0) blockers.push({ code: 'attendance_unconfirmed' });
  for (const f of a.flags.filter((x) => x.startsWith('block:'))) blockers.push({ code: 'attendance_flag', detail: f.slice(6) });
  const premium = a.approved.overtime + a.approved.night + a.approved.holidayWithin8 + a.approved.holidayOver8;
  const holiday = a.approved.holidayWithin8 + a.approved.holidayOver8;
  let worked: number;
  if (basis === 'ACTUAL') worked = a.regularMinutes + a.approved.overtime + holiday; // 인정되지 않은 연장은 지급 시간에 넣지 않는다
  else if (premium > 0) {
    blockers.push({ code: 'time_basis_unsupported', detail: basis });
    worked = 0;
  } else if (basis === 'ROUNDED') worked = a.payableMinutes;
  else {
    // 일정 시간 기준: 시급제는 일정 시간 합계가 필요한데 아직 넘겨받지 않는다. 월급 · 연봉제는 기본급이 시간에 달려 있지 않다
    if (payType === 'HOURLY') blockers.push({ code: 'time_basis_unsupported', detail: basis });
    worked = 0;
  }
  if (blockers.length > 0) return { time: null, blockers };
  return {
    time: { workedMinutes: worked, overtimeMinutes: a.approved.overtime, nightMinutes: a.approved.night, holidayMinutes: holiday, holidayOver8Minutes: a.approved.holidayOver8, paidLeaveMinutes: Math.round(a.paidLeaveDays * dayMinutes) },
    blockers: [],
  };
}
