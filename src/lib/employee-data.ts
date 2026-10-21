// 직원 본인 화면용 읽기 (미기록 배너·내 기록·정정 요청). 서버 전용. 본인 것만 읽는다.
import 'server-only';
import { resolveDayType } from '@/config/labor-rules';
import { OFFICE } from '@/config/office';
import { collectAnomalies } from '@/lib/anomaly-data';
import { addDays } from '@/lib/calendar';
import { findMissingPunches, type MissingPunch } from '@/lib/missing-punch';
import { fullLeaveSet } from '@/lib/leave';
import { daysFor, leaveDaysFor, loadPeriod, workDaysFor, type CorrectionRow, type EventRow, type OvertimeRow } from '@/lib/period-data';
import type { DayRow } from '@/lib/period';
import { hhmm, toKstDate, toKstTime } from '@/lib/time';

/**
 * 정정 요청 화면 맨 위 「정정이 필요한 기록」 한 줄 (2026-10-21 의뢰인: 무엇이 빠졌는지 직원이 일일이 기억해서 쓰지 않게).
 * 빠진 출근 · 퇴근은 「빠진 기록 추가」로, 지각 · 조퇴는 기록이 실제와 다를 때 「시각 수정」으로 — 누르면 날짜 · 종류 · 시각이 채워진다.
 * planned = 그날 일정의 시작(출근) · 끝(퇴근) 시각, at = 찍힌 시각(지각 · 조퇴), eventId = 고칠 기록(지각 · 조퇴)
 */
export type CorrectionTodo = { workDate: string; kind: 'in' | 'out'; issue: 'missing' | 'late' | 'early'; pending: boolean; planned: string | null; at: string | null; eventId: string | null };

export type EmployeeRecent = {
  missing: MissingPunch[];
  todo: CorrectionTodo[];
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
  // 시스템관리자(admin)는 직원이 아니다 — 출퇴근 판정에서 뺀다 (2026-10-17: 연습 모드를 끈 뒤 admin 홈에 「출근 기록 없음」이 떴다)
  if (data.rule && data.templateOf(employeeId)?.kind !== 'deemed' && me?.employeeNo !== OFFICE.ownerEmployeeNo) {
    const dayTypes = Object.fromEntries(
      [...Array(lookback)].map((_, i) => addDays(from, i)).map((d) => [d, resolveDayType(d, data.rule!, data.holidays)]),
    );
    // 7-8: 앱을 열 때 계산한다. 본인 화면에만 (요점 6)
    missing = findMissingPunches({
      employeeId,
      events,
      approvedCorrections: corrections.filter((c) => c.status === 'approved'),
      pendingCorrections: corrections.filter((c) => c.status === 'pending'),
      rule: data.ruleFor(employeeId, today) ?? data.rule,
      dayTypes,
      now,
      outGraceHours: OFFICE.missingOutGraceHours,
      inGraceMin: OFFICE.missingInGraceMin,
      joinedOn: me?.startsOn ?? null,
      lookbackDays: lookback,
      fullLeaveDates: new Set([...fullLeaveSet(leaveDaysFor(data, employeeId)), ...workDaysFor(data, employeeId).keys()]),
    });
  }
  // 정정이 필요한 기록: 빠진 것 + 지각 · 조퇴 (이상 기록 화면과 같은 판정, 최근 lookback일)
  const todo: CorrectionTodo[] = [];
  const planTime = (d: string, kind: 'in' | 'out') => {
    const r = data.planFor(employeeId, d).rule;
    return r ? hhmm(kind === 'in' ? r.startTime : r.endTime) : null;
  };
  for (const m of missing) todo.push({ workDate: m.workDate, kind: m.kind, issue: 'missing', pending: m.hasPendingRequest, planned: planTime(m.workDate, m.kind), at: null, eventId: null });
  // 하루 종일 아무것도 안 찍은 날은 출근만 빠진 것으로 잡힌다 — 퇴근도 같이 넣게 한 줄 더 (2026-10-21 의뢰인: 날짜를 고르면 시각만 넣고 끝나게)
  for (const m of missing.filter((x) => x.kind === 'in' && x.workDate < today)) {
    if (missing.some((x) => x.workDate === m.workDate && x.kind === 'out') || events.some((e) => e.workDate === m.workDate) || corrections.some((c) => c.status === 'approved' && c.workDate === m.workDate && c.kind === 'out')) continue;
    const pending = corrections.some((c) => c.status === 'pending' && c.workDate === m.workDate && c.kind === 'out' && !c.targetId);
    todo.push({ workDate: m.workDate, kind: 'out', issue: 'missing', pending, planned: planTime(m.workDate, 'out'), at: null, eventId: null });
  }
  if (me && me.employeeNo !== OFFICE.ownerEmployeeNo) {
    const mineOnly = { ...data, people: [me] };
    for (const a of collectAnomalies(mineOnly, from, today, now)) {
      for (const issue of (['late', 'early'] as const).filter((x) => a.types.includes(x))) {
        const kind = issue === 'late' ? 'in' : 'out';
        const same = events.filter((e) => e.workDate === a.workDate && e.kind === kind).sort((x, y) => x.punchedAt.getTime() - y.punchedAt.getTime());
        const ev = issue === 'late' ? same[0] : same[same.length - 1];
        if (!ev) continue;
        const pending = corrections.some((c) => c.status === 'pending' && c.workDate === a.workDate && (c.targetId === ev.id || c.kind === kind));
        todo.push({ workDate: a.workDate, kind, issue, pending, planned: planTime(a.workDate, kind), at: toKstTime(ev.punchedAt).slice(0, 5), eventId: ev.id });
      }
    }
  }
  todo.sort((x, y) => (x.workDate === y.workDate ? (x.kind === y.kind ? 0 : x.kind === 'in' ? -1 : 1) : x.workDate < y.workDate ? 1 : -1));
  return {
    missing,
    todo,
    days: daysFor(data, employeeId, from, today),
    events: events.filter((e) => e.workDate >= from),
    corrections: corrections.filter((c) => c.workDate >= from),
    overtime: data.overtime.filter((o) => o.employeeId === employeeId),
    hasRule: !!data.rule,
  };
}
