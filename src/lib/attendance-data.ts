// DB 행 → 계산 모듈 입력. 서버 전용. 계산은 순수함수(worktime·today·weekly-hours)가 하고 여기서는 읽기만 한다.
import 'server-only';
import { cache } from 'react';
import { resolveDayType } from '@/config/labor-rules';
import { OFFICE } from '@/config/office';
import { addDays, weekStartOf } from '@/lib/calendar';
import { pairsByWorkDate } from '@/lib/pairs';
import { ruleAt, type RuleVersion } from '@/lib/rule-at';
import { loadTemplateOf } from '@/lib/shift-data';
import { applyTemplate, deemedPair } from '@/lib/shifts';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';
import { classifyDay } from '@/lib/today';
import type { HolidayRow, PunchCorrection, PunchEvent, WorkRule } from '@/lib/types';
import { weeklyHours } from '@/lib/weekly-hours';
import { calcWeek } from '@/lib/worktime';

/**
 * 근무규칙 이력 전체 (숨긴 행 제외). 판정은 날짜마다 그날 유효한 규칙으로 한다 (② 4-1 — src/lib/rule-at.ts).
 * 없으면 빈 배열 — ② 설정 화면 전에는 없을 수 있다. 0이나 기본값으로 지어내지 않는다 (7-14)
 */
export const loadRuleVersions = cache(async (): Promise<RuleVersion[]> => {
  const { data } = await createAdminClient()
    .from('work_rules')
    .select('start_time, end_time, late_grace_min, break_start, break_end, workdays, weekly_rest_day, effective_from')
    .eq('active', true)
    .order('effective_from', { ascending: false });
  return (data ?? []).map((d) => ({
    effectiveFrom: d.effective_from,
    rule: {
      startTime: d.start_time,
      endTime: d.end_time,
      lateGraceMin: d.late_grace_min,
      breakStart: d.break_start,
      breakEnd: d.break_end,
      workdays: d.workdays,
      weeklyRestDay: d.weekly_rest_day,
    },
  }));
});

/** 오늘(KST) 유효한 근무규칙 */
export async function loadActiveRule(): Promise<WorkRule | null> {
  return ruleAt(await loadRuleVersions(), toKstDate(new Date()));
}

export async function loadHolidays(from: string, to: string): Promise<HolidayRow[]> {
  const { data } = await createAdminClient().from('holidays').select('the_date, kind').gte('the_date', from).lte('the_date', to);
  return (data ?? []).map((h) => ({ date: h.the_date, kind: h.kind }));
}

/** 사무실 대역 = DB(office_networks, ②에서 화면으로 관리) + 열쇠 파일 OFFICE_CIDRS. 둘 다 쓴다 (교체가 아니라 추가, 9-5) */
export async function officeCidrs(): Promise<{ cidr: string; label: string | null; from: 'db' | 'env' }[]> {
  const { data } = await createAdminClient().from('office_networks').select('cidr, label').eq('active', true);
  return [
    ...(data ?? []).map((r) => ({ cidr: String(r.cidr), label: r.label as string | null, from: 'db' as const })),
    ...OFFICE.allowedCidrs.map((c) => ({ cidr: c, label: null, from: 'env' as const })),
  ];
}

type EventRow = { id: string; employee_id: string; kind: 'in' | 'out'; punched_at: string; work_date: string; ip_verified: boolean; is_test: boolean; note: string | null };

const toEvent = (e: EventRow): PunchEvent => ({
  id: e.id,
  employeeId: e.employee_id,
  kind: e.kind,
  punchedAt: new Date(e.punched_at),
  workDate: e.work_date,
});

export type EmployeeToday = {
  workDate: string;
  rule: WorkRule | null;
  status: ReturnType<typeof classifyDay>['status'];
  firstIn: string | null;
  firstInVerified: boolean | null;
  lastOut: string | null;
  isOpen: boolean; // 지금 출근 상태인가 → 주 버튼이 "퇴근하기"
  lateMinutes: number | null;
  week: ReturnType<typeof weeklyHours> | null; // 근무규칙이 없으면 null (휴게를 모르면 실근로를 못 셈)
  note: { id: string; body: string } | null;
  practice: boolean;
};

/**
 * 직원 홈에 보여 줄 "오늘". 자정을 넘긴 야근 중이면 어제 근무일을 오늘로 본다 (출근이 열려 있고 openShiftMaxHours 이내).
 * 연습/운영 기록은 지금 모드의 것만 본다 (4-6).
 */
export async function loadEmployeeToday(employeeId: string, now: Date): Promise<EmployeeToday> {
  const db = createAdminClient();
  const practice = OFFICE.practiceMode;
  const today = toKstDate(now);
  const weekStart = weekStartOf(today);
  const from = addDays(weekStart, -1);

  const [{ data: ev }, { data: corr }, versions, holidays, tpl] = await Promise.all([
    db.from('punch_events')
      .select('id, employee_id, kind, punched_at, work_date, ip_verified, is_test, note')
      .eq('employee_id', employeeId).eq('is_test', practice).gte('work_date', from).order('punched_at'),
    db.from('punch_corrections')
      .select('id, correction_type, target_id, employee_id, work_date, kind, new_punched_at, status')
      .eq('employee_id', employeeId).eq('status', 'approved').gte('work_date', from),
    loadRuleVersions(),
    loadHolidays(from, addDays(weekStart, 6)),
    loadTemplateOf(employeeId),
  ]);
  const rows = (ev ?? []) as EventRow[];
  const events = rows.map(toEvent);
  const corrections: PunchCorrection[] = (corr ?? []).map((c) => ({
    id: c.id, correctionType: c.correction_type, targetId: c.target_id, employeeId: c.employee_id, workDate: c.work_date,
    kind: c.kind, newPunchedAt: c.new_punched_at ? new Date(c.new_punched_at) : null, status: c.status,
  }));

  // 지금 근무일: 마지막 기록이 열린 출근이고 충분히 최근이면 그 근무일 (B-4)
  const last = rows[rows.length - 1];
  const openShift = last && last.kind === 'in' && now.getTime() - new Date(last.punched_at).getTime() < OFFICE.openShiftMaxHours * 3_600_000;
  const workDate = openShift ? last.work_date : today;

  // 근무일정 틀 (2026-10-10): 그 직원의 시작·끝 시각으로. 틀이 없으면 회사 규칙 그대로
  const rule = applyTemplate(ruleAt(versions, workDate), tpl);
  const byDate = pairsByWorkDate(events, corrections);
  const dayType = rule ? resolveDayType(workDate, rule, holidays) : 'workday';
  let pairs = byDate.get(workDate)?.pairs ?? [];
  // 간주 근무: 찍지 않은 근무일은 일정 시간만큼 근무로 본다
  if (pairs.length === 0 && tpl?.kind === 'deemed' && rule && dayType === 'workday') {
    const v = deemedPair(tpl, workDate, now);
    if (v) pairs = [v];
  }
  const c = classifyDay({ pairs, rule, dayType, workDate, now });
  const firstInRow = rows.find((r) => r.work_date === workDate && r.kind === 'in');

  let week: EmployeeToday['week'] = null;
  if (rule) {
    const days = [...Array(7)].map((_, i) => addDays(weekStart, i)).map((d) => ({
      workDate: d,
      pairs: byDate.get(d)?.pairs ?? [],
      dayType: resolveDayType(d, ruleAt(versions, d) ?? rule, holidays),
    }));
    // 연장(빨강) = 급여·관리자 집계와 같은 계산 (calcWeek: 하루 8시간·주 40시간 초과 + 휴일 근로)
    const calc = new Map(calcWeek(days, (d) => ruleAt(versions, d) ?? rule).map((r) => [r.workDate, r]));
    week = weeklyHours({
      weekStart,
      // 직원 화면의 이번 주 시간 = 출근부터 퇴근까지 실제 시간의 합 (끝난 출퇴근만, 2026-10-02 의뢰인).
      // 휴게 공제는 급여·관리자 집계(calcWeek)에서 한다 — 합계는 보여 주기용, 정규 = 합계 − 연장.
      dailyWork: days.map((d) => ({
        workDate: d.workDate,
        netMinutes: d.pairs.reduce((a, p) => a + (p.in && p.out && p.out > p.in ? Math.floor((p.out.getTime() - p.in.getTime()) / 60000) : 0), 0),
        overtimeMinutes: (calc.get(d.workDate)?.overtimeMinutes ?? 0) + (calc.get(d.workDate)?.holidayMinutes ?? 0),
      })),
      is5OrMore: OFFICE.workplaceSize === '5_or_more',
    });
  }

  const { data: notes } = await db
    .from('work_notes')
    .select('id, body, supersedes')
    .eq('employee_id', employeeId).eq('work_date', workDate).eq('is_test', practice)
    .order('created_at', { ascending: false }).limit(1);

  return {
    workDate,
    rule,
    status: c.status,
    firstIn: c.firstIn?.toISOString() ?? null,
    firstInVerified: firstInRow ? firstInRow.ip_verified : null,
    lastOut: c.lastOut?.toISOString() ?? null,
    isOpen: pairs.some((p) => p.in && !p.out),
    lateMinutes: c.lateness?.verdict === 'late' ? c.lateness.lateMinutes : null,
    week,
    note: notes?.[0] ? { id: notes[0].id, body: notes[0].body } : null,
    practice,
  };
}

/** 근무노트·기록이 붙을 근무일 — 출근 기록과 같은 규칙 (R-10-2: 서버가 정한다) */
export async function currentWorkDate(employeeId: string, now: Date): Promise<string> {
  const { data } = await createAdminClient()
    .from('punch_events').select('kind, punched_at, work_date')
    .eq('employee_id', employeeId).eq('is_test', OFFICE.practiceMode)
    .lte('punched_at', now.toISOString()).order('punched_at', { ascending: false }).limit(1);
  const last = data?.[0];
  if (last && last.kind === 'in' && now.getTime() - new Date(last.punched_at).getTime() < OFFICE.openShiftMaxHours * 3_600_000) {
    return last.work_date;
  }
  return toKstDate(now);
}
