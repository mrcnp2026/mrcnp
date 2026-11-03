// 근태 점검 — 기간 자료(loadPeriod)를 하루 판정(judgeDay) 입력으로 바꾼다. 서버 전용, DB에 쓰지 않는다 (급여-69).
// 근태 마감이 이미 읽는 자료만 쓴다 — 따로 더 읽지 않는다.
import 'server-only';
import { OFFICE } from '@/config/office';
import { SETTINGS } from '@/config/settings-catalog';
import { bundleMonth, judgeDay, type DayCheck, type MonthCheck } from '@/lib/attendance-check';
import { settingHistory } from '@/lib/settings';
import { pickAt } from '@/lib/settings-pick';
import { fullLeaveSet } from '@/lib/leave';
import { missingOfDay } from '@/lib/missing-list';
import { FLAG } from '@/lib/flags';
import { daysFor, leaveDaysFor, workDaysFor, type PeriodData } from '@/lib/period-data';
import { toKstDate } from '@/lib/time';
import type { WorkRule } from '@/lib/types';

const hhmm = (t: string) => t.slice(0, 5);
const breaksOf = (r: WorkRule) => [...(r.breakStart && r.breakEnd ? [{ start: hhmm(r.breakStart), end: hhmm(r.breakEnd) }] : []), ...(r.extraBreaks ?? []).map((b) => ({ start: hhmm(b.start), end: hhmm(b.end) }))];
const minutesOf = (b: { start: string; end: string }) => { const [h1, m1] = b.start.split(':').map(Number); const [h2, m2] = b.end.split(':').map(Number); return h2 * 60 + m2 - (h1 * 60 + m1); };


export type PersonChecks = { employeeId: string; days: DayCheck[]; monthly: MonthCheck[] };

/** 날짜별 「일찍 출근 — 확인 필요에서 빼는 시간」 — 바꾼 날부터 적용(지난 날은 예전 값) */
export async function loadEarlyIgnoreAt(): Promise<(date: string) => number> {
  const key = 'check.early_ignore_min';
  const rows = (await settingHistory(key)).map((r) => ({ key, value: r.value, effective_from: r.effectiveFrom }));
  return (date) => Number(pickAt(rows, key, date, SETTINGS[key].default));
}

/** 「저녁 휴게 확인」 기준 분 — 그 달 끝 날짜에 유효했던 값 */
export async function loadBreakEarlyLeaveMin(onDate: string): Promise<number> {
  const key = 'check.break_early_leave_min';
  const rows = (await settingHistory(key)).map((r) => ({ key, value: r.value, effective_from: r.effectiveFrom }));
  return Number(pickAt(rows, key, onDate, SETTINGS[key].default));
}

/** 「일정 확인 필요」 기준 분 — 그 달 끝 날짜에 유효했던 값 */
export async function loadPatternMinEarly(onDate: string): Promise<number> {
  const key = 'check.pattern_min_early';
  const rows = (await settingHistory(key)).map((r) => ({ key, value: r.value, effective_from: r.effectiveFrom }));
  return Number(pickAt(rows, key, onDate, SETTINGS[key].default));
}

/** 기간 안 직원마다 확인 필요인 날 (판정 대상이 아닌 사람 · 날은 뺀다: 시스템관리자 · 최고관리자 · 대표 · 입사 전 · 앞날) */
export function collectChecks(data: PeriodData, from: string, to: string, now = new Date(), earlyIgnoreAt: (date: string) => number = () => SETTINGS['check.early_ignore_min'].default, patternMinEarly: number = SETTINGS['check.pattern_min_early'].default, breakEarlyLeaveMin: number = SETTINGS['check.break_early_leave_min'].default): PersonChecks[] {
  const today = toKstDate(now);
  const out: PersonChecks[] = [];
  // 직원별로 한 번만 나눠 둔다 — 날마다 전체 목록을 다시 훑으면 한 달 계산이 0.5초 걸렸다 (2026-11-03 속도)
  const group = <T extends { employeeId: string }>(rows: readonly T[]) => { const m = new Map<string, T[]>(); for (const r of rows) { const a = m.get(r.employeeId); if (a) a.push(r); else m.set(r.employeeId, [r]); } return m; };
  const otOf = group(data.overtime), coOf = group(data.corrections), lvOf = group(data.leaveRequests), wkOf = group(data.workRequests);
  for (const p of data.people) {
    if (p.employeeNo === OFFICE.ownerEmployeeNo || p.role === 'admin') continue;
    if (!p.groupId) continue; // 소속 지점이 없는 계정(시험용 「테스트 관리자」 등)은 점검 대상 아님 — 담당 지점관리자도 없다 (2026-11-03 의뢰인)
    const fullLeave = fullLeaveSet(leaveDaysFor(data, p.id));
    const away = workDaysFor(data, p.id);
    const days: DayCheck[] = [];
    // 평소 퇴근 시각 = 그 기간 퇴근(일정 있는 근무일) 가운데값 — 이보다 60분 이상 일찍 나간 날에 저녁 휴게를 확인한다
    const outMin = (dt: Date) => { const s = new Date(dt.getTime() + 9 * 3600_000).toISOString().slice(11, 16); return +s.slice(0, 2) * 60 + +s.slice(3); };
    const allDays = daysFor(data, p.id, from, to); // 계산이 무거워 한 번만
    const outs = allDays.filter((d) => data.planFor(p.id, d.workDate).items.length && d.pairs.some((x) => x.out) && !d.pairs.some((x) => x.in && !x.out)).map((d) => Math.max(...d.pairs.filter((x) => x.out).map((x) => outMin(x.out!)))).sort((a, b) => a - b);
    const usualOut = outs.length ? outs[Math.floor(outs.length / 2)] : null;
    let worked = 0; // 일정 있고 출근한 날 — 「한 달 80%」의 바닥
    const myOt = otOf.get(p.id) ?? [], myCo = coOf.get(p.id) ?? [], myLv = lvOf.get(p.id) ?? [], myWk = wkOf.get(p.id) ?? [];
    for (const d of allDays) {
      if (d.workDate < p.startsOn || d.workDate > today) continue;
      const plan = data.planFor(p.id, d.workDate);
      const rule = plan.items.length && plan.rule ? plan.rule : null;
      const span = rule ? { startTime: hhmm(rule.startTime), endTime: hhmm(rule.endTime) } : null;
      const excused = fullLeave.has(d.workDate) || away.has(d.workDate);
      const deemed = !!plan.deemed || !!d.deemed;
      if (span && !excused && !deemed && d.pairs.some((x) => x.in)) worked++;
      const ot = myOt.filter((o) => o.workDate === d.workDate);
      const onDay = (s: string, e: string) => s <= d.workDate && d.workDate <= e;
      const pending =
        ot.some((o) => o.status === 'pending') ||
        myCo.some((c) => c.workDate === d.workDate && c.status === 'pending') ||
        myLv.some((r) => r.status === 'pending' && onDay(r.startDate, r.endDate)) ||
        myWk.some((r) => r.status === 'pending' && onDay(r.startDate, r.endDate));
      const approved = ot.filter((o) => o.status === 'approved').reduce((n, o) => n + (o.approvedMinutes ?? o.overtimeMinutes) + (o.approvedHolidayMinutes ?? o.holidayMinutes), 0);
      // 휴게 안 함 — 회사 규칙의 휴게시간대 중 표시한 것의 분
      const waived = data.waivedFor(p.id, d.workDate);
      const base = data.ruleAt(d.workDate);
      const lastOut = d.pairs.some((x) => x.out) ? Math.max(...d.pairs.filter((x) => x.out).map((x) => outMin(x.out!))) : null;
      const evening = base && span ? breaksOf(base).find((b) => b.start >= span.endTime) ?? breaksOf(base).find((b) => b.start >= '17:00') ?? null : null; // 일정 끝 무렵 휴게(17:00–17:30)
      const breakCheck = evening && !waived.has(evening.start) && usualOut !== null && lastOut !== null && usualOut - lastOut >= breakEarlyLeaveMin ? evening : null; // 회사 설정 check.break_early_leave_min (기본 60분)
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
        earlyIgnoreMin: earlyIgnoreAt(d.workDate),
        lateRound: (rule ?? base)?.lateRound,
        breakCheck,
        clipStart: span ? null : (plan.rule ?? base)?.startTime ? hhmm((plan.rule ?? base)!.startTime) : null,
      });
      if (check.parts.length) days.push(check); // 흐리게만 남은 날도 둔다 — 기록 화면 표시 · 한 달 묶음 판단에 쓴다
    }
    const b = bundleMonth(from.slice(0, 7), days, worked, patternMinEarly);
    out.push({ employeeId: p.id, days: b.days, monthly: b.monthly });
  }
  return out;
}
