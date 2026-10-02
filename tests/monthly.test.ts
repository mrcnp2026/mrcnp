// 게이트 8 — 월간 집계·급여용 CSV (①-4 11-A "급여용 CSV", ①-1 11-A의 CSV 항목)
import { describe, expect, it } from 'vitest';
import { csvCell, PAYROLL_COLUMNS, prefixFlag, summarizeMonth, toCsv, type MonthRequest } from '@/lib/monthly';
import { computeEmployeeDays } from '@/lib/period';
import { kstDateTime } from '@/lib/time';
import type { PunchCorrection, PunchEvent, WorkRule } from '@/lib/types';

const RULE: WorkRule = {
  startTime: '09:00', endTime: '18:00', lateGraceMin: 10, breakStart: '12:00', breakEnd: '13:00', workdays: [1, 2, 3, 4, 5], weeklyRestDay: 7,
};
let seq = 0;
const ev = (kind: 'in' | 'out', d: string, t: string, wd = d): PunchEvent => ({ id: `e${++seq}`, employeeId: 'e1', kind, punchedAt: kstDateTime(d, t), workDate: wd });

function month(events: PunchEvent[], opts: { requests?: MonthRequest[]; corrections?: PunchCorrection[]; pendingCorrections?: number; today?: string } = {}) {
  const days = computeEmployeeDays({ events, approvedCorrections: opts.corrections ?? [], rule: RULE, holidays: [], from: '2026-10-01', to: '2026-10-31' });
  const today = opts.today ?? '2026-11-01';
  return summarizeMonth({
    employeeNo: 'A001', name: 'Nguyen', yearMonth: '2026-10', days, requests: opts.requests ?? [], pendingCorrections: opts.pendingCorrections ?? 0,
    rule: RULE, joinedOn: '2026-10-12', now: kstDateTime(today, '12:00'), today, thresholdMinutes: 30,
  });
}

describe('급여용 CSV 형식', () => {
  it('열 이름과 순서가 7-10 목록과 정확히 같다', () => {
    expect(PAYROLL_COLUMNS).toEqual([
      'employee_no', 'name', 'year_month',
      'regular_minutes', 'overtime_minutes', 'night_minutes', 'holiday_within8_minutes', 'holiday_over8_minutes',
      'approved_overtime_minutes', 'approved_night_minutes', 'approved_holiday_within8_minutes', 'approved_holiday_over8_minutes',
      'pending_overtime_minutes', 'pending_night_minutes', 'pending_holiday_minutes', 'unreviewed_overtime_minutes',
      'late_count', 'late_minutes', 'absent_days', 'unpaid_leave_days', 'flags',
    ]);
    expect(Object.keys(month([]).row)).toEqual([...PAYROLL_COLUMNS]);
  });

  it('금액 열이 하나도 없다 ← 4-4', () => {
    for (const c of PAYROLL_COLUMNS) expect(c).not.toMatch(/amount|wage|salary|pay_|won|rate|krw/i);
  });

  it('무급휴가는 0이 아니라 빈 칸이고 block:연차 모듈 미연결이 붙는다 ← B-27', () => {
    const r = month([]).row;
    expect(r.unpaid_leave_days).toBeNull();
    expect(String(r.flags)).toContain('block:연차 모듈 미연결');
    expect(toCsv(PAYROLL_COLUMNS, [PAYROLL_COLUMNS.map((c) => r[c])])).toContain(',,'); // 빈 칸으로 나간다
  });

  it('주 52시간 초과·법정 휴게 미확인은 warn:, 미기록류는 block:', () => {
    expect(prefixFlag('주 52시간 초과')).toBe('warn:주 52시간 초과');
    expect(prefixFlag('법정 휴게 미확인')).toBe('warn:법정 휴게 미확인');
    expect(prefixFlag('퇴근 미기록')).toBe('block:퇴근 미기록');
    const r = month([ev('in', '2026-10-13', '14:00'), ev('out', '2026-10-13', '22:00'), ev('in', '2026-10-14', '09:00')]).row;
    expect(String(r.flags)).toContain('warn:법정 휴게 미확인');
    expect(String(r.flags)).toContain('block:퇴근 미기록');
  });

  it('pending 연장이 있으면 block:미승인 연장, 승인분·보류분이 각자 칸에', () => {
    const events = [ev('in', '2026-10-13', '09:00'), ev('out', '2026-10-13', '20:00'), ev('in', '2026-10-14', '09:00'), ev('out', '2026-10-14', '20:00')];
    const base = { overtimeMinutes: 120, nightMinutes: 0, holidayMinutes: 0, approvedMinutes: null, approvedNightMinutes: null, approvedHolidayMinutes: null, needsReview: false };
    const r = month(events, {
      requests: [
        { ...base, workDate: '2026-10-13', status: 'approved', approvedMinutes: 60 },
        { ...base, workDate: '2026-10-14', status: 'pending' },
      ],
    }).row;
    expect(r.overtime_minutes).toBe(240); // 사실
    expect(r.approved_overtime_minutes).toBe(60); // 인정 (부분 승인)
    expect(r.pending_overtime_minutes).toBe(120); // 보류
    expect(String(r.flags)).toContain('block:미승인 연장');
  });

  it('30분 미만 연장은 unreviewed로 그대로 나온다 (사라지지도, 인정에 들어가지도 않음) ← B-28', () => {
    const r = month([ev('in', '2026-10-13', '09:00'), ev('out', '2026-10-13', '18:20')]).row;
    expect(r.overtime_minutes).toBe(20);
    expect(r.unreviewed_overtime_minutes).toBe(20);
    expect(r.approved_overtime_minutes).toBe(0);
    expect(r.pending_overtime_minutes).toBe(0);
  });

  it('지각 횟수·분, 결근 일수(입사일 이후 평일 중 기록 없는 날)', () => {
    const r = month([ev('in', '2026-10-13', '09:25'), ev('out', '2026-10-13', '18:00')], { today: '2026-10-16' }).row;
    expect(r.late_count).toBe(1);
    expect(r.late_minutes).toBe(15);
    // 입사 10-12(월). 12·14·15일 기록 없음, 16일은 오늘 12시 → 결근 판정 시각(10:00) 지남 → 4일
    expect(r.absent_days).toBe(4);
    expect(String(r.flags)).toContain('block:출근 미기록');
  });

  it('대기 중인 정정이 있으면 block:대기 중인 정정, 재확인 필요 요청이 있으면 block:재확인 필요', () => {
    const r = month([], { pendingCorrections: 1 }).row;
    expect(String(r.flags)).toContain('block:대기 중인 정정');
    const events = [ev('in', '2026-10-13', '09:00'), ev('out', '2026-10-13', '20:00')];
    const r2 = month(events, { requests: [{ workDate: '2026-10-13', status: 'approved', overtimeMinutes: 120, nightMinutes: 0, holidayMinutes: 0, approvedMinutes: null, approvedNightMinutes: null, approvedHolidayMinutes: null, needsReview: true }] }).row;
    expect(String(r2.flags)).toContain('block:재확인 필요');
  });

  it('월 첫날이 주 중간이어도 그 주 월요일부터 계산한다 (주 40시간, B-25)', () => {
    // 9/28(월)~9/30(수) 매일 9시간 실근로 + 10/1(목)·10/2(금) 9시간 → 10/2 금요일에 주 소정 40 도달
    const evs = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'].flatMap((d) => [ev('in', d, '09:00'), ev('out', d, '19:00')]);
    const days = computeEmployeeDays({ events: evs, approvedCorrections: [], rule: RULE, holidays: [], from: '2026-10-01', to: '2026-10-31' });
    const oct1 = days.find((d) => d.workDate === '2026-10-01')!;
    expect(oct1.weekRegularMinutesSoFar).toBe(3 * 480); // 9월 3일치가 들어감
    expect(days[0].workDate).toBe('2026-10-01'); // 돌려주는 건 10월 날만
  });

  it('add_missing 승인 → 그날 근로시간이 채워진다 (원본 배열은 그대로) ← 4-8', () => {
    const events = [ev('in', '2026-10-13', '09:00')];
    const before = month(events).row;
    const after = month(events, {
      corrections: [{ id: 'c', correctionType: 'add_missing', targetId: null, employeeId: 'e1', workDate: '2026-10-13', kind: 'out', newPunchedAt: kstDateTime('2026-10-13', '18:00'), status: 'approved' }],
    }).row;
    expect(before.regular_minutes).toBe(0);
    expect(after.regular_minutes).toBe(480);
    expect(events).toHaveLength(1);
  });
});

describe('CSV 칸', () => {
  it('쉼표·따옴표·줄바꿈을 감싸고, 수식처럼 보이는 글자는 무력화한다', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell(-30)).toBe('-30');
    expect(csvCell(null)).toBe('');
  });
});

describe('진행 중인 근무', () => {
  it('오늘 아직 근무 중이면 퇴근 미기록으로 막지 않는다 (내일부터 판정)', () => {
    const today = '2026-10-13';
    const r = month([ev('in', today, '09:00')], { today });
    expect(String(r.row.flags)).not.toContain('퇴근 미기록');
    const tomorrow = month([ev('in', today, '09:00')], { today: '2026-10-14' });
    expect(String(tomorrow.row.flags)).toContain('block:퇴근 미기록');
  });
});
