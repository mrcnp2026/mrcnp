// 기간 데이터 읽기 + 연장 확인 대상 만들기. 서버 전용.
// 예약 작업(cron)을 만들지 않는다 (3장) — 처리함·현황판·월간 집계를 **열 때** 계산하고 필요한 요청 행을 만든다.
import 'server-only';
import { cache } from 'react';
import { after } from 'next/server';
import { readAll } from '@/lib/read-all';
import { resolveDayType } from '@/config/labor-rules';
import { OFFICE } from '@/config/office';
import { getMe } from '@/lib/auth';
import { loadHolidays, loadRuleVersions } from '@/lib/attendance-data';
import { fullLeaveSet, leaveByDate, trimRuleByLeave, type LeaveOnDay, type LeaveRequest, type LeaveType } from '@/lib/leave';
import { loadAllLeaveTypes, loadLeaveRequests } from '@/lib/leave-data';
import { loadWorkRequests } from '@/lib/work-data';
import { workByDate, type WorkKind, type WorkRequest } from '@/lib/work-requests';
import { addDays, weekStartOf } from '@/lib/calendar';
import { buildOvertimeRequest } from '@/lib/overtime';
import { computeEmployeeDays, type DayRow } from '@/lib/period';
import { ruleAt } from '@/lib/rule-at';
import { viewerScope, within } from '@/lib/scope';
import { loadShifts, loadShiftTemplates } from '@/lib/shift-data';
import { applyTemplate, deemedPair, planDay, type DayPlan, type DayShift, type ShiftTemplate } from '@/lib/shifts';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';
import type { HolidayRow, PunchCorrection, PunchEvent, WorkRule } from '@/lib/types';

// startsOn: 입사일(joined_on), 비어 있으면 계정을 만든 날 — 그 전 날짜는 미기록·결근으로 세지 않는다 (7-8 요점 3)
export type Person = { id: string; name: string; employeeNo: string | null; role: 'admin' | 'manager' | 'employee'; active: boolean; joinedOn: string | null; startsOn: string; groupId: string | null; shiftTemplateId: string | null; jobId: string | null };

export type EventRow = PunchEvent & { ipVerified: boolean; verifiedBy: 'ip' | 'gps' | null; source: 'web' | 'qr' | 'admin' | 'import'; note: string | null; clientIp: string | null; locationId: string | null };

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
  // 근무일정 틀 (2026-10-10): 직원마다 시작·끝 시각이 다를 수 있다. 판정은 ruleFor(직원, 날짜)로 한다 — 틀이 없는 직원은 ruleAt과 같다
  templates: ShiftTemplate[];
  templateOf: (employeeId: string) => ShiftTemplate | null;
  ruleFor: (employeeId: string, date: string) => WorkRule | null;
  shifts: DayShift[]; // 날짜별 일정 (특근·잔업 등, 2단계)
  planFor: (employeeId: string, date: string) => DayPlan; // 그 직원의 그날 일정: 날짜별 일정 → 평소 틀 → 회사 규칙
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
    dayTypeOf: (d) => {
      const assigned = data.planFor(employeeId, d).items.filter((s) => s.source === 'shift' && s.kind !== 'extra');
      return assigned.length ? assigned.every((s) => s.kind === 'holiday') ? 'holiday' : 'workday' : resolveDayType(d, data.ruleAt(d) ?? fallback, data.holidays);
    },
    from: data.from,
    to: data.to,
  });
}

/** from~to 데이터. 주 40시간 계산을 위해 기록은 from이 속한 주 월요일부터 읽는다 (period.ts) */
export async function loadPeriod(from: string, to: string, practice = OFFICE.practiceMode): Promise<PeriodData> {
  const db = createAdminClient();
  const readFrom = addDays(weekStartOf(from), -1); // 자정 넘긴 퇴근의 근무일 상속 여유
  const scope = await viewerScope(); // 지점관리자면 맡은 지점 직원만 (scope.ts)
  const [versions, holidays, { data: pplAll }, { data: evAll }, { data: coAll }, { data: otAll }, leaveRequests, leaveTypes, workRequests, templates, shiftsAll] = await Promise.all([
    loadRuleVersions(),
    loadHolidays(readFrom, to),
    readAll((a, b) => db.from('profiles').select('id, name, employee_no, role, active, joined_on, created_at, group_id, shift_template_id, job_id').order('name').order('id').range(a, b)),
    readAll((a, b) => db.from('punch_events')
      .select('id, employee_id, kind, punched_at, work_date, ip_verified, verified_by, source, note, client_ip, location_id')
      .eq('is_test', practice).gte('work_date', readFrom).lte('work_date', to).order('punched_at').order('id').range(a, b)),
    readAll((a, b) => db.from('punch_corrections')
      .select('id, correction_type, target_id, employee_id, work_date, kind, new_punched_at, status, reason, requested_by, approved_by, created_at, decided_at')
      .eq('is_test', practice).gte('work_date', readFrom).lte('work_date', to).order('created_at').order('id').range(a, b)),
    readAll((a, b) => db.from('overtime_requests').select('*').eq('is_test', practice).gte('work_date', from).lte('work_date', to).order('id').range(a, b)),
    loadLeaveRequests({ from: readFrom, to, practice }),
    loadAllLeaveTypes(), // 꺼 둔 종류로 승인된 지난 휴가도 결근이 아니다
    loadWorkRequests({ from: readFrom, to, practice }),
    loadShiftTemplates(true),
    loadShifts(readFrom, to),
  ]);
  // 실제 관리자에게는 검사 전용 계정(e2e-)의 사람 · 기록을 빼고 계산한다 — 현황판 · 이상자 · 마감 · 리포트 숫자에 섞이지 않게 (hiddenTestIds)
  const hidden = new Set(await hiddenTestIds());
  const keep = <T,>(rows: T[], idOf: (r: T) => string) => (hidden.size ? rows.filter((r) => !hidden.has(idOf(r))) : rows);
  const ppl = keep(within(pplAll ?? [], scope, (p) => p.id as string), (p) => p.id as string);
  const ev = keep(within(evAll ?? [], scope, (e) => e.employee_id as string), (e) => e.employee_id as string);
  const co = keep(within(coAll ?? [], scope, (c) => c.employee_id as string), (c) => c.employee_id as string);
  const ot = keep(within(otAll ?? [], scope, (o) => o.employee_id as string), (o) => o.employee_id as string);
  const shifts = keep(within(shiftsAll, scope, (x) => x.employeeId), (x) => x.employeeId);
  const tplById = new Map(templates.map((t) => [t.id, t]));
  // 꺼 둔 틀은 적용되지 않은 것으로 본다 (이름·색은 지난 일정 표시에 계속 쓴다)
  const tplOfPerson = new Map((ppl ?? []).map((p) => [p.id as string, p.shift_template_id ? (tplById.get(p.shift_template_id)?.active ? tplById.get(p.shift_template_id)! : null) : null]));
  const shiftsOf = new Map<string, DayShift[]>();
  for (const s of shifts) shiftsOf.set(`${s.employeeId}|${s.workDate}`, [...(shiftsOf.get(`${s.employeeId}|${s.workDate}`) ?? []), s]);
  const timedLeaveOf = new Map<string, { startTime: string; endTime: string }[]>();
  for (const r of leaveRequests) {
    if (r.status !== 'approved' || !r.startTime || !r.endTime || r.startDate !== r.endDate) continue;
    const k = `${r.employeeId}|${r.startDate}`;
    timedLeaveOf.set(k, [...(timedLeaveOf.get(k) ?? []), { startTime: r.startTime, endTime: r.endTime }]);
  }
  const planFor = (employeeId: string, date: string): DayPlan => {
    const rule = ruleAt(versions, date);
    const plan = planDay({ rule, tpl: tplOfPerson.get(employeeId) ?? null, shifts: shiftsOf.get(`${employeeId}|${date}`) ?? [], isWorkday: rule ? resolveDayType(date, rule, holidays) === 'workday' : false, templates: tplById });
    // 시각이 있는 승인 휴가(오전 반차 등)는 그날 판정의 시작·끝 시각을 옮긴다 — 반차 낸 사람이 지각으로 잡히지 않게
    const timed = timedLeaveOf.get(`${employeeId}|${date}`);
    return timed && plan.rule ? { ...plan, rule: trimRuleByLeave(plan.rule, timed) } : plan;
  };
  const templateOf = (employeeId: string) => tplOfPerson.get(employeeId) ?? null;
  return {
    from,
    to,
    practice,
    rule: ruleAt(versions, to),
    ruleAt: (date: string) => ruleAt(versions, date),
    templates: templates.filter((t) => t.active),
    templateOf,
    ruleFor: (employeeId: string, date: string) => planFor(employeeId, date).rule,
    shifts,
    planFor,
    holidays,
    people: (ppl ?? []).map((p) => ({
      id: p.id, name: p.name, employeeNo: p.employee_no, role: p.role, active: p.active, joinedOn: p.joined_on,
      startsOn: p.joined_on ?? toKstDate(new Date(p.created_at)),
      groupId: p.group_id,
      shiftTemplateId: p.shift_template_id,
      jobId: p.job_id,
    })),
    events: (ev ?? []).map((e) => ({
      id: e.id, employeeId: e.employee_id, kind: e.kind, punchedAt: new Date(e.punched_at), workDate: e.work_date,
      ipVerified: e.ip_verified, verifiedBy: e.verified_by, source: e.source, note: e.note, clientIp: e.client_ip, locationId: e.location_id ?? null,
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
  const tpl = data.templateOf(employeeId);
  // 간주 근무: 입사 전 날짜와 하루 전부 휴가인 날은 빼고, 찍지 않은 근무일을 근무로 본다 (now는 여기서 한 번만 읽는다)
  const now = new Date();
  const startsOn = data.people.find((p) => p.id === employeeId)?.startsOn ?? null;
  // 간주 근무가 있을 수 있는가: 평소 틀이 간주이거나, 이 기간에 그날 일정으로 넣은 간주 근무가 있다
  const mayDeem = tpl?.kind === 'deemed' || data.shifts.some((s) => s.employeeId === employeeId && s.kind === 'deemed');
  const fullLeave = mayDeem ? fullLeaveSet(leaveDaysFor(data, employeeId)) : null;
  return computeEmployeeDays({
    events: data.events.filter((e) => e.employeeId === employeeId),
    approvedCorrections: data.corrections.filter((c) => c.employeeId === employeeId && c.status === 'approved'),
    rule: applyTemplate(data.rule, tpl) ?? data.rule,
    ruleAt: (d) => data.ruleFor(employeeId, d),
    deemed: mayDeem
      ? (d) => {
          if (fullLeave!.has(d) || (startsOn !== null && d < startsOn)) return null;
          const plan = data.planFor(employeeId, d); // 근무일인지·그날 일정이 있는지는 planDay가 이미 봤다
          return (plan.deemedIntervals ?? (plan.deemed ? [plan.deemed] : [])).map((span) => deemedPair(span, d, now)).filter((p): p is NonNullable<typeof p> => p !== null);
        }
      : undefined,
    holidays: data.holidays,
    from,
    to,
  });
}

/** 마감 중인(되열리지 않은) 기간들 — 그 직원의 그 기간 안 날짜는 근태를 바꿀 수 없다 */
export async function closedSpans(db: ReturnType<typeof createAdminClient>, from: string, to: string, practice: boolean): Promise<{ employeeId: string; from: string; to: string }[]> {
  const { data } = await db.from('attendance_closes').select('employee_id, period_from, period_to').eq('state', 'CLOSED').eq('is_test', practice).lte('period_from', to).gte('period_to', from);
  return (data ?? []).map((c) => ({ employeeId: c.employee_id as string, from: c.period_from as string, to: c.period_to as string }));
}

/**
 * 연장 확인 대상 만들기 (7-7, "집계는 자동, 승인은 사람").
 * - 끝난 근무(열린 출근 없음)만 대상. 근무 중인 날은 아직 사실이 확정되지 않았다
 * - 없으면 새로 만든다 (사실 칸 = 지금 집계, calc_version 기록 — R-12-2)
 * - 있는데 지금 집계와 다르면 사실 칸은 그대로 두고 recomputed_*에 새 값 + needs_review (R-4) — 인정분을 코드가 줄이지 않는다
 * 반환: 새로 만들거나 바뀐 건수
 */
export async function syncOvertimeRequests(data: PeriodData, upTo: string, only?: ReadonlySet<string>): Promise<number> {
  if (!data.rule) return 0;
  const db = createAdminClient();
  const existing = new Map(data.overtime.map((o) => [`${o.employeeId}|${o.workDate}`, o]));
  // 이미 마감한 직원의 기간은 건드리지 않는다 — DB가 마감된 달의 변경을 막아서, 건드리면 오류가 나 화면이 열리지 않는다 (2026-10-25)
  const closed = await closedSpans(db, data.from, data.to, data.practice);
  const isClosed = (emp: string, day: string) => closed.some((c) => c.employeeId === emp && c.from <= day && day <= c.to);
  const inserts: Record<string, unknown>[] = [];
  const reviews: { id: string; o: number; n: number; h: number }[] = [];

  for (const p of data.people) {
    if (only && !only.has(p.id)) continue; // 한 사람만 맞출 때 (기록이 바뀐 직후, syncOvertimeFor)
    for (const d of daysFor(data, p.id, data.from, upTo < data.to ? upTo : data.to)) {
      if (d.pairs.some((x) => x.in && !x.out)) continue; // 근무 중
      if (isClosed(p.id, d.workDate)) continue; // 마감된 날
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

/**
 * 연장근로 확인을 기간 전체로 맞춘다 (2026-10-19 의뢰인: 화면을 열 때마다 하던 계산을 옮김).
 * 새벽 정기 작업(/api/cron/overtime-sync) · 월 마감 · 급여 계산 직전 · 엑셀 갱신 마무리가 부른다. 오늘 뒤 날짜는 세지 않는다.
 */
export async function syncOvertimeRange(from: string, to: string, practice = OFFICE.practiceMode, only?: ReadonlySet<string>): Promise<number> {
  const today = toKstDate(new Date());
  const upTo = to < today ? to : today;
  if (from > upTo) return 0;
  return syncOvertimeRequests(await loadPeriod(from, upTo, practice), upTo, only);
}

/**
 * 기록이 바뀐 직후 그 사람의 그 날짜들만 맞춘다 — 「출퇴근을 고치면 연장 요청이 바로 생긴다」(2026-10-19 의뢰인: 그대로 유지).
 * 응답을 돌려준 뒤(after) 돌아서 누른 사람은 기다리지 않는다. 실패해도 저장은 그대로이고, 새벽 정기 작업이 다시 맞춘다.
 */
export function syncOvertimeFor(employeeIds: string | string[], dates: (string | null | undefined)[]): void {
  const ids = new Set(Array.isArray(employeeIds) ? employeeIds : [employeeIds]);
  const ds = dates.filter((d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  if (ds.length === 0 || ids.size === 0) return;
  after(async () => {
    try {
      await syncOvertimeRange(ds[0], ds[ds.length - 1], OFFICE.practiceMode, ids);
    } catch (e) {
      console.error(JSON.stringify({ route: 'syncOvertimeFor', detail: String((e as Error)?.message ?? e).slice(0, 200) }));
    }
  });
}

/** 꺼져 있는 검사 전용 계정(e2e-…) — 이 계정들의 요청은 요청함·요청 숫자에 넣지 않는다 (검사가 남긴 요청이 실제 관리자에게 보이던 문제, 2026-10-11) */
/**
 * 보는 사람에게 숨길 검사 전용 계정(e2e-) — 실제 관리자에게는 검사 계정의 사람 · 기록 · 요청이 어디에도 나오지 않는다 (2026-10-14 의뢰인: 「요청 9건인데 열면 없다」).
 * 검사 계정으로 보는 검사에게는 꺼 둔 검사 계정만 숨긴다(켜진 검사 계정끼리 시험한다). 로그인한 사람이 없으면(서버 작업) 실제 쪽으로 본다
 */
// 한 화면(요청) 안에서는 한 번만 읽는다 — 같은 화면이 여러 번 부르던 것 (2026-10-19 속도). 받는 쪽이 고쳐 써도 되게 복사본을 돌려준다
export async function hiddenTestIds(): Promise<string[]> {
  return [...(await hiddenOnce())];
}
const hiddenOnce = cache(async (): Promise<string[]> => {
  const viewer = await getMe().catch(() => null);
  const testView = !!viewer?.employeeNo?.startsWith('e2e-');
  let q = createAdminClient().from('profiles').select('id').like('employee_no', 'e2e-%');
  if (testView) q = q.eq('active', false);
  // 시스템관리자(admin)도 뺀다 — 직원이 아니라서 출근 · 근무일정 · 요청 · 리포트 어디에도 보이지 않게 (2026-10-18 의뢰인, DB 묶음 23).
  // 본인이 볼 때만 자기 기록이 남는다(내 화면이 비지 않게)
  const [{ data }, { data: sys }] = await Promise.all([q, createAdminClient().from('profiles').select('id').eq('employee_no', OFFICE.ownerEmployeeNo)]);
  return [...(data ?? []), ...(sys ?? []).filter((p) => p.id !== viewer?.id)].map((p) => p.id as string);
});

// 화면 틀(메뉴 숫자)과 본문이 같은 화면에서 두 번 세던 것 — 한 번만 (2026-10-19 속도)
export async function pendingCounts(practice = OFFICE.practiceMode): Promise<{ overtime: number; corrections: number; leave: number; work: number; punch: number; shift: number; leaveDelete: number; total: number }> {
  return { ...(await countsOnce(practice)) };
}
const countsOnce = cache(async (practice: boolean): Promise<{ overtime: number; corrections: number; leave: number; work: number; punch: number; shift: number; leaveDelete: number; total: number }> => {
  const db = createAdminClient();
  const scope = await viewerScope();
  if (scope) return pendingCountsIn(practice, scope);
  const hide = await hiddenTestIds();
  const skip = hide.length ? `(${hide.join(',')})` : '(00000000-0000-0000-0000-000000000000)';
  const [{ count: a }, { count: b }, { count: c }, { count: l }, { count: w }, { count: pr }, { count: sh }, { count: lc }] = await Promise.all([
    db.from('overtime_requests').select('id', { count: 'exact', head: true }).eq('is_test', practice).eq('status', 'pending').not('employee_id', 'in', skip),
    db.from('overtime_requests').select('id', { count: 'exact', head: true }).eq('is_test', practice).eq('needs_review', true).neq('status', 'pending').not('employee_id', 'in', skip),
    db.from('punch_corrections').select('id', { count: 'exact', head: true }).eq('is_test', practice).eq('status', 'pending').not('employee_id', 'in', skip),
    db.from('leave_requests').select('id', { count: 'exact', head: true }).eq('is_test', practice).eq('status', 'pending').not('employee_id', 'in', skip),
    db.from('work_requests').select('id', { count: 'exact', head: true }).eq('is_test', practice).eq('status', 'pending').not('employee_id', 'in', skip),
    db.from('punch_requests').select('id', { count: 'exact', head: true }).eq('is_test', practice).eq('status', 'pending').not('employee_id', 'in', skip),
    db.from('shift_requests').select('id', { count: 'exact', head: true }).eq('is_test', practice).eq('status', 'pending').not('employee_id', 'in', skip),
    db.from('leave_change_requests').select('id', { count: 'exact', head: true }).eq('is_test', practice).eq('status', 'pending').not('employee_id', 'in', skip),
  ]);
  const r = { overtime: (a ?? 0) + (b ?? 0), corrections: c ?? 0, leave: l ?? 0, work: w ?? 0, punch: pr ?? 0, shift: sh ?? 0, leaveDelete: lc ?? 0 };
  return { ...r, total: r.overtime + r.corrections + r.leave + r.work + r.punch + r.shift + r.leaveDelete };
});

/** 지점관리자의 대기 요청 수 — 맡은 지점 직원 것만. 자기 요청은 세지 않는다(관리자가 처리한다) */
async function pendingCountsIn(practice: boolean, scope: Set<string>) {
  const db = createAdminClient();
  const me = (await getMe())?.id;
  const hide = new Set(await hiddenTestIds());
  const ids = [...scope].filter((id) => id !== me && !hide.has(id));
  const zero = { overtime: 0, corrections: 0, leave: 0, work: 0, punch: 0, shift: 0, leaveDelete: 0, total: 0 };
  if (ids.length === 0) return zero;
  const n = async (table: string, review = false) => {
    let q = db.from(table).select('id', { count: 'exact', head: true }).eq('is_test', practice).in('employee_id', ids);
    q = review ? q.eq('needs_review', true).neq('status', 'pending') : q.eq('status', 'pending');
    return (await q).count ?? 0;
  };
  const [a, b, c, l, w, pr, sh, lc] = await Promise.all([n('overtime_requests'), n('overtime_requests', true), n('punch_corrections'), n('leave_requests'), n('work_requests'), n('punch_requests'), n('shift_requests'), n('leave_change_requests')]);
  const r = { overtime: a + b, corrections: c, leave: l, work: w, punch: pr, shift: sh, leaveDelete: lc };
  return { ...r, total: r.overtime + r.corrections + r.leave + r.work + r.punch + r.shift + r.leaveDelete };
}
