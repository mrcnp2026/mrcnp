// 연장·야간·휴일 — 확인 대상 뽑기와 인정분 계산 (7-7). 순수함수.
//
// ★ 사실과 판단을 나눈다 (14장 5번):
//   overtime/night/holiday_minutes = 집계된 사실. 아무도 손으로 못 고친다 (DB 트리거도 막는다)
//   approved_*_minutes            = 회사의 판단. 사실보다 클 수 없다
// 거부해도 punch_events의 근로시간은 그대로다 (요점 1). 이 모듈은 기록을 건드리지 않는다.

import { LABOR } from '@/config/labor-rules';
import type { WorkCalc } from '@/lib/worktime';

export type OvertimeRequestDraft = {
  employeeId: string;
  workDate: string;
  overtimeMinutes: number;
  nightMinutes: number;
  holidayMinutes: number;
};

export type OvertimeRequest = {
  status: 'pending' | 'approved' | 'rejected';
  overtimeMinutes: number;
  nightMinutes: number;
  holidayMinutes: number;
  approvedMinutes: number | null; // null이면 전액
  approvedNightMinutes: number | null;
  approvedHolidayMinutes: number | null;
};

/**
 * 요점 2 — 승인 대기에 올릴 것인가.
 * 조건: 연장 ≥ 임계값 또는 야간 ≥ 임계값 또는 휴일 근로 > 0.
 * 휴일에는 연장이 0이므로(7-6 요점 2) 연장만 보면 휴일근로가 승인 절차를 통째로 빠져나간다.
 * 임계값 미만은 null을 돌려주지만 **사라지지 않는다** — unreviewedMinutes()로 급여용 CSV에 따로 간다.
 */
export function buildOvertimeRequest(args: {
  employeeId: string;
  workDate: string;
  work: Pick<WorkCalc, 'overtimeMinutes' | 'nightMinutes' | 'holidayMinutes'>;
  thresholdMinutes: number; // office.ts overtimeReviewThresholdMin
}): OvertimeRequestDraft | null {
  const { work, thresholdMinutes: t } = args;
  const qualifies = work.overtimeMinutes >= t || work.nightMinutes >= t || work.holidayMinutes > 0;
  if (!qualifies) return null;
  return {
    employeeId: args.employeeId,
    workDate: args.workDate,
    overtimeMinutes: work.overtimeMinutes,
    nightMinutes: work.nightMinutes,
    holidayMinutes: work.holidayMinutes,
  };
}

/**
 * 요점 2 ★ — 임계값 미만이라 승인 대기에 안 올라간 분. 급여용 CSV `unreviewed_overtime_minutes`로 간다.
 * 인정분에 자동으로 넣지도, 0으로 버리지도 않는다 (B-28). 급여에 넣을지는 사람이 정한다 (미검증 — 노무 확인).
 */
export function unreviewedMinutes(args: {
  work: Pick<WorkCalc, 'overtimeMinutes' | 'nightMinutes' | 'holidayMinutes'>;
  thresholdMinutes: number;
}): { overtime: number; night: number } {
  const draft = buildOvertimeRequest({ employeeId: '', workDate: '', ...args });
  if (draft) return { overtime: 0, night: 0 };
  return { overtime: args.work.overtimeMinutes, night: args.work.nightMinutes };
}

function splitHoliday(holiday: number) {
  // 요점 6: 8시간 이내분부터 채운다. 순서를 정해 두지 않으면 급여 쪽이 임의로 나눈다
  const within8 = Math.min(holiday, LABOR.holidaySplitMin);
  return { holidayWithin8: within8, holidayOver8: holiday - within8 };
}

/** 요점 6 — 인정 분. approved면 null=전액·값=그 값, 그 밖(pending·rejected)은 0 */
export function approvedMinutes(r: OvertimeRequest) {
  if (r.status !== 'approved') {
    return { overtime: 0, night: 0, holiday: 0, holidayWithin8: 0, holidayOver8: 0 };
  }
  const overtime = r.approvedMinutes ?? r.overtimeMinutes;
  const night = r.approvedNightMinutes ?? r.nightMinutes;
  const holiday = r.approvedHolidayMinutes ?? r.holidayMinutes;
  return { overtime, night, holiday, ...splitHoliday(holiday) };
}

/**
 * 요점 3 — 승인 대기 분. **보류는 보류로 보여야 한다.** 0으로도, 전액 인정으로도 처리하지 않고
 * 집계표의 별도 칸·급여용 CSV `pending_*` 열로 간다.
 */
export function pendingMinutes(r: OvertimeRequest) {
  if (r.status !== 'pending') return { overtime: 0, night: 0, holiday: 0 };
  return { overtime: r.overtimeMinutes, night: r.nightMinutes, holiday: r.holidayMinutes };
}
