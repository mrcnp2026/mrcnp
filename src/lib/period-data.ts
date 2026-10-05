// 기간 데이터 읽기 + 연장 확인 대상 만들기. 서버 전용.
// 예약 작업(cron)을 만들지 않는다 (3장) — 처리함·현황판·월간 집계를 **열 때** 계산하고 필요한 요청 행을 만든다.
import 'server-only';
import { resolveDayType } from '@/config/labor-rules';
import { OFFICE } from '@/config/office';
import { loadHolidays, loadRuleVersions } from '@/lib/attendance-data';
import { leaveByDate, type LeaveOnDay, type LeaveRequest, type LeaveType } from '@/lib/leave';
import { loadLeaveRequests, loadLeaveTypes } from '@/lib/leave-data';
import { loadWorkRequests } from '@/lib/work-data';
import { workByDate, type WorkKind, type WorkRequest } from '@/lib/work-requests';
import { addDays, weekStartOf } from '@/lib/calendar';
import { buildOvertimeRequest } from '@/lib/overtime';
import { computeEmployeeDays, type DayRow } from '@/lib/period';
import { ruleAt } from '@/lib/rule-at';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';
import type { HolidayRow, PunchCorrection, PunchEvent, WorkRule } from '@/lib/types';

// startsOn: 입사일(joined_on), 비어 있으면 계정을 만든 날 — 그 전 날짜는 미기록·결근으로 세지 않는다 (7-8 요점 3)
export type Person = { id: string; name: string; employeeNo: string | null; role: 'admin' | 'employee'; active: boolean; joinedOn: string | null; startsOn: string; groupId: string | null };

export type EventRow = PunchEvent & { ipVerified: boolean; verifiedBy: 'ip' | 'gps' | null; source: 'web' | 'qr' | 'admin'; note: string | null; clientIp: string | null };

export type CorrectionRow = PunchCorrection & {
  reason: string;
  requestedBy: string;
  approvedBy: string | null;
  createdAt: string;
  decidedAt: string | null;
};

export type OvertimeRow = {
  id: string;
  employeeId: string;
  workDate: string;
  status: 'pending' | 'approved' | 'rejected';
  overtimeMinutes: number;
  nightMinutes: number;
  holidayMinutes: number;
  approvedMinutes: number | null;
  approvedNightMinutes: number | null;
  approvedHolidayMinutes: number | null;
  approvedBy: string | null;
  decidedAt: string | null;
  reason: string | null;
  needsReview: boolean;
  recomputedOvertimeMinutes: number | null;
  recomputedNightMinutes: number | null;
  recomputedHolidayMinutes: number | null;
  calcVersion: string | null;
};

export type PeriodData = {
  from: string;
  to: string;
  practice: boolean;
  rule: WorkRule | null; // 기간 끝 날짜의 규칙 — 화면 안내용. 판정은 ruleAt(날짜)로 한다 (② 4-1)
  ruleAt: (date: string) => WorkRule | null;
  holidays: HolidayRow[];
  people: Person[];
  events: EventRow[];
  corrections: CorrectionRow[];
  overtime: OvertimeRow[];
  leaveRequests: LeaveRequest[]; // 기간과 겹치는 휴가 신청 (모든 상태) — 결근 판정은 승인된 것만 (leaveDaysFor)
  leaveTypes: LeaveType[];
  workRequests: WorkRequest[]; // 기간과 겹치는 외근·출장·재택 신청 (모든 상태) — 판정은 승인된 것만 (workDaysFor)
};

/** 한 직원의 날짜별 승인 외근 (기간 안) */
export function workDaysFor(data: PeriodData, employeeId: string): Map<string, WorkKind> {
  return workByDate(data.workRequests, employeeId, data.from, data.to);
}

/** 한 직원의 날짜별 승인 휴가 (근무일만). ★ 유급휴가일은 결근이 아니다 (②-2 B-2) */
export function leaveDaysFor(data: PeriodData, employeeId: string): Map<string, LeaveOnDay[]> {
  const fallback = data.rule;
  if (!fallback) return new Map();
  return leaveByDate({
    requests: data.leaveRequests.filter((r) => r.employeeId === employeeId),
    types: data.leaveTypes,
    dayTypeOf: (d) => resolveDayType(d, data.ruleAt(d) ?? fallback, data.holidays),
    from: data.from,
    to: data.to,
  });
}

/** from~to 데이터. 주 40시간 계산을 위해 기록은 from이 속한 주 월요일부터 읽는다 (period.ts) */
export async function loadPeriod(from: string, to: string, practice = OFFICE.practiceMode): Promise<PeriodData> {
  const db = createAdminClient();
  const readFrom = addDays(weekStartOf(from), -1); // 자정 넘긴 퇴근의 근무일 상속 여유
  const [versions, holidays, { data: ppl }, { data: ev }, { data: co }, { data: ot }, leaveRequests, leaveTypes, workRequests] = await Promise.all([
    loadRuleVersions(),
    loadHolidays(readFrom, to),
    db.from('profiles').select('id, name, employee_no, role, active, joined_on, created_at, group_id').order('name'),
    db.from('punch_events')
      .select('id, employee_id, kind, punched_at, work_date, ip_verified, verified_by, source, note, client_ip')
      .eq('is_test', practice).gte('work_date', readFrom).lte('work_date', to).order('punched_at'),
    db.from('punch_corrections')
      .select('id, correction_type, target_id, employee_id, work_date, kind, new_punched_at, status, reason, requested_by, approved_by, created_at, decided_at')
      .eq('is_test', practice).gte('work_date', readFrom).lte('work_date', to).order('created_at'),
    db.from('overtime_requests').select('*').eq('is_test', practice).gte('work_date', from).lte('work_date', to),
    loadLeaveRequests({ from: readFrom, to, practice }),
    loadLeaveTypes(),
    loadWorkRequests({ from: readFrom, to, practice }),
  ]);
  return {
    from,
    to,
    practice,
    rule: ruleAt(versions, to),
    ruleAt: (date: string) => ruleAt(versions, date),
    holidays,
    people: (ppl ?? []).map((p) => ({
      id: p.id, name: p.name, employeeNo: p.employee_no, role: p.role, active: p.active, joinedOn: p.joined_on,
      startsOn: p.joined_on ?? toKstDate(new Date(p.created_at)),
      groupId: p.group_id,
    })),
    events: (ev ?? []).map((e) => ({
      id: e.id, employeeId: e.employee_id, kind: e.kind, punchedAt: new Date(e.punched_at), workDate: e.work_date,
      ipVerified: e.ip_verified, verifiedBy: e.verified_by, source: e.source, note: e.note, clientIp: e.client_ip,
    })),
    corrections: (co ?? []).map((c) => ({
      id: c.id, correctionType: c.correction_type, targetId: c.target_id, employeeId: c.employee_id, workDate: c.work_date, kind: c.kind,
      newPunchedAt: c.new_punched_at ? new Date(c.new_punched_at) : null, status: c.status, reason: c.reason,
      requestedBy: c.requested_by, approvedBy: c.approved_by, createdAt: c.created_at, decidedAt: c.decided_at,
    })),
    overtime: (ot ?? []).map(toOvertimeRow),
    leaveRequests,
    leaveTypes,
    workRequests,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase 행 모양 그대로
function toOvertimeRow(o: any): OvertimeRow {
  return {
    id: o.id, employeeId: o.employee_id, workDate: o.work_date, status: o.status,
    overtimeMinutes: o.overtime_minutes, nightMinutes: o.night_minutes, holidayMinutes: o.holiday_minutes,
    approvedMinutes: o.approved_minutes, approvedNightMinutes: o.approved_night_minutes, approvedHolidayMinutes: o.approved_holiday_minutes,
    approvedBy: o.approved_by, decidedAt: o.decided_at, reason: o.reason, needsReview: o.needs_review,
    recomputedOvertimeMinutes: o.recomputed_overtime_minutes, recomputedNightMinutes: o.recomputed_night_minutes,
    recomputedHolidayMinutes: o.recomputed_holiday_minutes, calcVersion: o.calc_version,
  };
}

/** 한 직원의 기간 날짜별 계산. 근무규칙이 없으면 빈 배열 (계산 근거가 없다 — 추측하지 않음) */
export function daysFor(data: PeriodData, employeeId: string, from = data.from, to = data.to): DayRow[] {
  if (!data.rule) return [];
  return computeEmployeeDays({
    events: data.events.filter((e) => e.employeeId === employeeId),
    approvedCorrections: data.corrections.filter((c) => c.employeeId === employeeId && c.status === 'approved'),
    rule: data.rule,
    ruleAt: data.ruleAt,
    holidays: data.holidays,
    from,
    to,
  });
}

/**
 * 연장 확인 대상 만들기 (7-7, "집계는 자동, 승인은 사람").
 * - 끝난 근무(열린 출근 없음)만 대상. 근무 중인 날은 아직 사실이 확정되지 않았다
 * - 없으면 새로 만든다 (사실 칸 = 지금 집계, calc_version 기록 — R-12-2)
 * - 있는데 지금 집계와 다르면 사실 칸은 그대로 두고 recomputed_*에 새 값 + needs_review (R-4) — 인정분을 코드가 줄이지 않는다
 * 반환: 새로 만들거나 바뀐 건수
 */
export async function syncOvertimeRequests(data: PeriodData, upTo: string): Promise<number> {
  if (!data.rule) return 0;
  const db = createAdminClient();
  const existing = new Map(data.overtime.map((o) => [`${o.employeeId}|${o.workDate}`, o]));
  const inserts: Record<string, unknown>[] = [];
  const reviews: { id: string; o: number; n: number; h: number }[] = [];

  for (const p of data.people) {
    for (const d of daysFor(data, p.id, data.from, upTo < data.to ? upTo : data.to)) {
      if (d.pairs.some((x) => x.in && !x.out)) continue; // 근무 중
      const draft = buildOvertimeRequest({ employeeId: p.id, workDate: d.workDate, work: d, thresholdMinutes: OFFICE.overtimeReviewThresholdMin });
      const cur = existing.get(`${p.id}|${d.workDate}`);
      if (!cur) {
        if (draft) {
          inserts.push({
            employee_id: p.id, work_date: d.workDate, overtime_minutes: draft.overtimeMinutes, night_minutes: draft.nightMinutes,
            holiday_minutes: draft.holidayMinutes, is_test: data.practice, calc_version: OFFICE.calcVersion,
          });
        }
        continue;
      }
      const [o, n, h] = draft ? [draft.overtimeMinutes, draft.nightMinutes, draft.holidayMinutes] : [d.overtimeMinutes, d.nightMinutes, d.holidayMinutes];
      const baseline = [cur.recomputedOvertimeMinutes ?? cur.overtimeMinutes, cur.recomputedNightMinutes ?? cur.nightMinutes, cur.recomputedHolidayMinutes ?? cur.holidayMinutes];
      if (o !== baseline[0] || n !== baseline[1] || h !== baseline[2]) reviews.push({ id: cur.id, o, n, h });
    }
  }
  if (inserts.length) {
    const { error } = await db.from('overtime_requests').upsert(inserts, { onConflict: 'employee_id,work_date,is_test', ignoreDuplicates: true });
    if (error) throw new Error(`syncOvertime.insert: ${error.message}`);
  }
  for (const r of reviews) {
    const same = (() => {
      const cur = data.overtime.find((x) => x.id === r.id)!;
      return r.o === cur.overtimeMinutes && r.n === cur.nightMinutes && r.h === cur.holidayMinutes;
    })();
    const { error } = await db
      .from('overtime_requests')
      .update({
        recomputed_overtime_minutes: same ? null : r.o,
        recomputed_night_minutes: same ? null : r.n,
        recomputed_holiday_minutes: same ? null : r.h,
        needs_review: !same,
      })
      .eq('id', r.id);
    if (error) throw new Error(`syncOvertime.review: ${error.message}`);
  }
  return inserts.length + reviews.length;
}

export async function pendingCounts(practice = OFFICE.practiceMode): Promise<{ overtime: number; corrections: number; leave: number; work: number; total: number }> {
  const db = createAdminClient();
  const [{ count: a }, { count: b }, { count: c }, { count: l }, { count: w }] = await Promise.all([
    db.from('overtime_requests').select('id', { count: 'exact', head: true }).eq('is_test', practice).eq('status', 'pending'),
    db.from('overtime_requests').select('id', { count: 'exact', head: true }).eq('is_test', practice).eq('needs_review', true).neq('status', 'pending'),
    db.from('punch_corrections').select('id', { count: 'exact', head: true }).eq('is_test', practice).eq('status', 'pending'),
    db.from('leave_requests').select('id', { count: 'exact', head: true }).eq('is_test', practice).eq('status', 'pending'),
    db.from('work_requests').select('id', { count: 'exact', head: true }).eq('is_test', practice).eq('status', 'pending'),
  ]);
  const r = { overtime: (a ?? 0) + (b ?? 0), corrections: c ?? 0, leave: l ?? 0, work: w ?? 0 };
  return { ...r, total: r.overtime + r.corrections + r.leave + r.work };
}
