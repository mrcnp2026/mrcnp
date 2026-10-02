// 월간 집계 + 급여용 CSV 한 행 (①-4 7-10, ①-1 7-7·7-14). 순수함수. 금액은 한 칸도 없다 (4-4).
// 네 묶음 (부록 R-10-5, 9-6): 실제(집계된 사실) · 인정(승인분) · 보류(승인 대기) · 미검토(임계값 미만).
import { OFFICE } from '@/config/office';
import { FLAG } from '@/lib/flags';
import { judgeLateness } from '@/lib/lateness';
import { isFullDayLeave, roundDays, type LeaveOnDay } from '@/lib/leave';
import { approvedMinutes, buildOvertimeRequest, pendingMinutes, type OvertimeRequest } from '@/lib/overtime';
import type { DayRow } from '@/lib/period';
import { kstDateTime } from '@/lib/time';
import type { WorkRule } from '@/lib/types';

/** 급여 문서 7-2가 읽는 이름·순서 그대로. 개수를 문장에 쓰지 말고 이 목록으로 검사한다 (7-10) */
export const PAYROLL_COLUMNS = [
  'employee_no', 'name', 'year_month',
  'regular_minutes', 'overtime_minutes', 'night_minutes', 'holiday_within8_minutes', 'holiday_over8_minutes',
  'approved_overtime_minutes', 'approved_night_minutes', 'approved_holiday_within8_minutes', 'approved_holiday_over8_minutes',
  'pending_overtime_minutes', 'pending_night_minutes', 'pending_holiday_minutes',
  'unreviewed_overtime_minutes',
  'late_count', 'late_minutes', 'absent_days', 'unpaid_leave_days',
  'flags',
] as const;

export type PayrollRow = Record<(typeof PAYROLL_COLUMNS)[number], string | number | null>;

export type MonthRequest = OvertimeRequest & { workDate: string; needsReview: boolean };

export type MonthSummary = {
  row: PayrollRow;
  netMinutes: number; // 실제 근로 합계 (화면용)
  absentDates: string[];
  missingOutDates: string[];
  leaveDates: string[]; // 승인된 휴가가 있는 근무일
  paidLeaveDays: number; // 유급휴가 일수 (연차·반차·경조사 등) — 화면·엑셀용. 급여용 CSV 칸 목록은 그대로
};

// 급여를 막는 사유(block:)와 사람이 봐야 할 사실(warn:)을 접두어로 나눈다 (7-10). ③은 block:만 차단한다 (부록 R-11 #7)
const WARN_FLAGS = new Set<string>([FLAG.WEEKLY_LIMIT_EXCEEDED, FLAG.LEGAL_BREAK_UNCONFIRMED, FLAG.DUPLICATE_IN, FLAG.DUPLICATE_OUT, FLAG.LEAVE_DAY_PUNCH]);
const MISSING_IN = '출근 미기록';
const PENDING_CORRECTION = '대기 중인 정정';
const NEEDS_REVIEW = '재확인 필요';

export function prefixFlag(f: string): string {
  if (f.startsWith('block:') || f.startsWith('warn:')) return f;
  return WARN_FLAGS.has(f) ? `warn:${f}` : `block:${f}`;
}

export function summarizeMonth(args: {
  employeeNo: string | null;
  name: string;
  yearMonth: string; // 'YYYY-MM'
  days: DayRow[]; // 그 달의 날만 (주 단위 계산은 이미 끝난 것, period.ts)
  requests: MonthRequest[]; // 그 달 연장 요청 (연습/운영 같은 모드)
  pendingCorrections: number;
  rule: WorkRule;
  ruleAt?: (date: string) => WorkRule | null; // ② 4-1: 지각 판정은 그날 규칙으로
  joinedOn: string | null;
  now: Date;
  today: string; // 사무실 날짜
  thresholdMinutes: number;
  // 날짜별 승인 휴가 (②-2). 넘기지 않으면 결근인지 연차인지 모른다 → 무급휴가 빈 칸 + 차단 표시 (7-14)
  leave?: Map<string, LeaveOnDay[]>;
}): MonthSummary {
  const s = { regular: 0, overtime: 0, night: 0, h8: 0, hOver: 0, net: 0 };
  const ap = { overtime: 0, night: 0, h8: 0, hOver: 0 };
  const pe = { overtime: 0, night: 0, holiday: 0 };
  let unreviewed = 0;
  let lateCount = 0;
  let lateMinutes = 0;
  const flags = new Set<string>();
  const absentDates: string[] = [];
  const missingOutDates: string[] = [];
  const leaveDates: string[] = [];
  let paidLeave = 0;
  let unpaidLeave = 0;
  const reqByDate = new Map(args.requests.map((r) => [r.workDate, r]));

  for (const d of args.days) {
    s.regular += d.regularMinutes;
    s.overtime += d.overtimeMinutes;
    s.night += d.nightMinutes;
    s.h8 += d.holidayWithin8Minutes;
    s.hOver += d.holidayOver8Minutes;
    s.net += d.netMinutes;
    // 오늘 아직 근무 중인 교대는 '퇴근 미기록'이 아니다 (진행 중). 내일이 되면 다시 판정된다
    const ongoing = d.workDate === args.today && d.pairs.some((p) => p.in && !p.out);
    d.flags.filter((f) => !(ongoing && f === FLAG.MISSING_OUT)).forEach((f) => flags.add(f));
    if (d.flags.includes(FLAG.MISSING_OUT) && !ongoing) missingOutDates.push(d.workDate);

    const req = reqByDate.get(d.workDate);
    if (req) {
      const a = approvedMinutes(req);
      ap.overtime += a.overtime;
      ap.night += a.night;
      ap.h8 += a.holidayWithin8;
      ap.hOver += a.holidayOver8;
      const p = pendingMinutes(req);
      pe.overtime += p.overtime;
      pe.night += p.night;
      pe.holiday += p.holiday;
      if (req.needsReview) flags.add(NEEDS_REVIEW);
    } else if (!buildOvertimeRequest({ employeeId: '', workDate: d.workDate, work: d, thresholdMinutes: args.thresholdMinutes })) {
      // 임계값 미만: 승인 대기에 안 올렸지만 사라지지 않는다 (7-7 요점 2, B-28)
      unreviewed += d.overtimeMinutes;
    } else {
      // 확인 대상인데 요청이 아직 안 만들어짐 (예: 오늘 근무 중) — 0으로도 인정으로도 처리하지 않고 보류로
      pe.overtime += d.overtimeMinutes;
      pe.night += d.nightMinutes;
      pe.holiday += d.holidayMinutes;
    }

    const firstIn = d.pairs.map((p) => p.in).filter((x): x is Date => !!x).sort((a, b) => a.getTime() - b.getTime())[0];
    if (firstIn && d.dayType === 'workday') {
      const l = judgeLateness({ punchedAt: firstIn, workDate: d.workDate, rule: args.ruleAt?.(d.workDate) ?? args.rule, isHoliday: false });
      if (l.verdict === 'late') {
        lateCount++;
        lateMinutes += l.lateMinutes;
      }
    }
    // 휴가 (②-2): ★ 유급휴가일은 결근이 아니다 (B-2). 무급은 무급휴가 일수로. 휴가일에 출근 기록이 있으면 경고만 (요점 4)
    const lv = args.leave?.get(d.workDate);
    if (lv) {
      leaveDates.push(d.workDate);
      for (const x of lv) {
        if (x.isPaid) paidLeave += x.unit;
        else unpaidLeave += x.unit;
      }
      if (firstIn) flags.add(FLAG.LEAVE_DAY_PUNCH);
    }
    // 결근 후보: 근무일, 입사 후, 지난 날(오늘은 결근 판정 시각 이후), 출근 기록 없음, 하루 전부 휴가가 아님
    const past = d.workDate < args.today || (d.workDate === args.today && args.now >= kstDateTime(d.workDate, OFFICE.absentCheckTime));
    if (d.dayType === 'workday' && past && !firstIn && !isFullDayLeave(lv) && (!args.joinedOn || d.workDate >= args.joinedOn)) {
      absentDates.push(d.workDate);
    }
  }

  if (absentDates.length) flags.add(MISSING_IN);
  if (pe.overtime + pe.night + pe.holiday > 0) flags.add(FLAG.PENDING_OVERTIME);
  if (args.pendingCorrections > 0) flags.add(PENDING_CORRECTION);
  // 7-14: 연차 자료가 없으면 결근인지 연차인지 모른다 → 무급휴가는 빈 칸 + 차단 표시 (0을 쓰지 않는다, B-27)
  if (!args.leave) flags.add(FLAG.LEAVE_MODULE_MISSING);

  const ordered = [...flags].map(prefixFlag).sort((a, b) => (a.startsWith('block:') === b.startsWith('block:') ? a.localeCompare(b) : a.startsWith('block:') ? -1 : 1));

  return {
    netMinutes: s.net,
    absentDates,
    missingOutDates,
    leaveDates,
    paidLeaveDays: roundDays(paidLeave),
    row: {
      employee_no: args.employeeNo,
      name: args.name,
      year_month: args.yearMonth,
      regular_minutes: s.regular,
      overtime_minutes: s.overtime,
      night_minutes: s.night,
      holiday_within8_minutes: s.h8,
      holiday_over8_minutes: s.hOver,
      approved_overtime_minutes: ap.overtime,
      approved_night_minutes: ap.night,
      approved_holiday_within8_minutes: ap.h8,
      approved_holiday_over8_minutes: ap.hOver,
      pending_overtime_minutes: pe.overtime,
      pending_night_minutes: pe.night,
      pending_holiday_minutes: pe.holiday,
      unreviewed_overtime_minutes: unreviewed,
      late_count: lateCount,
      late_minutes: lateMinutes,
      absent_days: absentDates.length,
      unpaid_leave_days: args.leave ? roundDays(unpaidLeave) : null,
      flags: ordered.join(';'),
    },
  };
}

/** CSV 한 칸: 쉼표·따옴표·줄바꿈이 있으면 따옴표로 감싼다. 빈 칸(null)은 정말 빈 칸 — 0과 다르다 */
export function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  // 엑셀이 =·+·-·@로 시작하는 칸을 수식으로 실행하지 않게 (CSV 주입 방지)
  const safe = /^[=+\-@]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(header: readonly string[], rows: (string | number | null)[][]): string {
  // UTF-8 BOM: 엑셀에서 한글·태국어가 깨지지 않게
  return '﻿' + [header.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\r\n') + '\r\n';
}

/** 내려받기 파일 이름 규칙 한곳 (부록 R-10-6): 종류_기간_만든시각 */
export function exportFileName(kind: 'payroll' | 'attendance', period: string, now: Date): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').slice(0, 13);
  return `${kind === 'payroll' ? 'payroll-input' : 'attendance-evidence'}_${period}_${stamp}.csv`;
}
