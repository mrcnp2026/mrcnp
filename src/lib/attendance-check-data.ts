// 근태 점검 — 기간 자료(loadPeriod)를 하루 판정(judgeDay) 입력으로 바꾼다. 서버 전용, DB에 쓰지 않는다 (급여-69).
// 근태 마감이 이미 읽는 자료만 쓴다 — 따로 더 읽지 않는다.
import 'server-only';
import { OFFICE } from '@/config/office';
import { judgeDay, type DayCheck } from '@/lib/attendance-check';
import { fullLeaveSet } from '@/lib/leave';
import { missingOfDay } from '@/lib/missing-list';
import { FLAG } from '@/lib/flags';
import { daysFor, leaveDaysFor, workDaysFor, type PeriodData } from '@/lib/period-data';
import { toKstDate } from '@/lib/time';
import type { WorkRule } from '@/lib/types';

const hhmm = (t: string) => t.slice(0, 5);
const breaksOf = (r: WorkRule) => [...(r.breakStart && r.breakEnd ? [{ start: hhmm(r.breakStart), end: hhmm(r.breakEnd) }] : []), ...(r.extraBreaks ?? []).map((b) => ({ start: hhmm(b.start), end: hhmm(b.end) }))];
const minutesOf = (b: { start: string; end: string }) => { const [h1, m1] = b.start.split(':').map(Number); const [h2, m2] = b.end.split(':').map(Number); return h2 * 60 + m2 - (h1 * 60 + m1); };

export type PersonChecks = { employeeId: string; days: DayCheck[] };

/** 기간 안 직원마다 확인 필요인 날 (판정 대상이 아닌 사람 · 날은 뺀다: 시스템관리자 · 최고관리자 · 대표 · 입사 전 · 앞날) */
export function collectChecks(data: PeriodData, from: string, to: string, now = new Date()): PersonChecks[] {
  const today = toKstDate(now);
  const out: PersonChecks[] = [];
  for (const p of data.people) {
    if (p.employeeNo === OFFICE.ownerEmployeeNo || p.role === 'admin') continue;
    const fullLeave = fullLeaveSet(leaveDaysFor(data, p.id));
    const away = workDaysFor(data, p.id);
    const days: DayCheck[] = [];
    for (const d of daysFor(data, p.id, from, to)) {
      if (d.workDate < p.startsOn || d.workDate > today) continue;
      const plan = data.planFor(p.id, d.workDate);
      const rule = plan.items.length && plan.rule ? plan.rule : null;
      const span = rule ? { startTime: hhmm(rule.startTime), endTime: hhmm(rule.endTime) } : null;
      const excused = fullLeave.has(d.workDate) || away.has(d.workDate);
      const deemed = !!plan.deemed || !!d.deemed;
      const same = <T extends { employeeId: string; workDate?: string }>(r: T) => r.employeeId === p.id && r.workDate === d.workDate;
      const ot = data.overtime.filter((o) => same(o));
      const onDay = (s: string, e: string) => s <= d.workDate && d.workDate <= e;
      const pending =
        ot.some((o) => o.status === 'pending') ||
        data.corrections.some((c) => same(c) && c.status === 'pending') ||
        data.leaveRequests.some((r) => r.employeeId === p.id && r.status === 'pending' && onDay(r.startDate, r.endDate)) ||
        data.workRequests.some((r) => r.employeeId === p.id && r.status === 'pending' && onDay(r.startDate, r.endDate));
      const approved = ot.filter((o) => o.status === 'approved').reduce((n, o) => n + (o.approvedMinutes ?? o.overtimeMinutes) + (o.approvedHolidayMinutes ?? o.holidayMinutes), 0);
      // 휴게 안 함 — 회사 규칙의 휴게시간대 중 표시한 것의 분
      const waived = data.waivedFor(p.id, d.workDate);
      const base = data.ruleAt(d.workDate);
      const waivedMin = waived.size && base ? breaksOf(base).filter((b) => waived.has(b.start)).reduce((n, b) => n + minutesOf(b), 0) : 0;
      const check = judgeDay({
        workDate: d.workDate,
        plan: span,
        breaks: rule ? breaksOf(rule) : base ? breaksOf(base) : [],
        roundStepMin: (rule ?? base)?.roundStepMin ?? 0,
        pairs: d.pairs,
        deemed,
        fullLeave: excused,
        missing: missingOfDay({ workDate: d.workDate, pairs: d.pairs, plan: span, deemed, excused, now, outGraceHours: OFFICE.missingOutGraceHours, inGraceMin: OFFICE.missingInGraceMin }),
        recordError: [FLAG.ORPHAN_OUT, FLAG.DUPLICATE_IN, FLAG.DUPLICATE_OUT].some((f) => d.flags.includes(f)) || d.pairs.some((x, i, all) => !!x.in && !!x.out && (x.out < x.in || (i > 0 && !!all[i - 1].out && x.in < all[i - 1].out!))),
        pending,
        approvedExtraMin: approved,
        waivedBreakMin: waivedMin,
      });
      if (check.state) days.push(check);
    }
    out.push({ employeeId: p.id, days });
  }
  return out;
}
