// 한 직원의 기간 계산 — 현황판(7-9)·처리함(7-7)·월간 집계(7-10)가 같은 함수를 쓴다. 순수함수.
// ★ 주 40시간 판정은 그 주 월요일부터 순서대로 계산해야 맞다 (7-6 요점 3, B-25).
//   그래서 요청 기간이 주 중간에서 시작해도 **그 주 월요일부터** 계산하고, 요청 기간의 날만 돌려준다.
//   (월간 집계에서 1일이 수요일이면 앞선 월·화의 소정근로가 수요일 판정에 들어가야 한다)
import { resolveDayType } from '@/config/labor-rules';
import { addDays, weekStartOf } from '@/lib/calendar';
import { pairsByWorkDate } from '@/lib/pairs';
import type { DayType, HolidayRow, PunchCorrection, PunchEvent, PunchPair, WorkRule } from '@/lib/types';
import { calcWeek, type WorkCalc } from '@/lib/worktime';

export type DayRow = WorkCalc & { workDate: string; dayType: DayType; pairs: PunchPair[]; weekRegularMinutesSoFar: number };

/** from~to(포함)의 날짜별 계산. events·corrections는 그 직원 것, from이 속한 주 월요일부터 있어야 한다 */
export function computeEmployeeDays(args: {
  events: PunchEvent[];
  approvedCorrections: PunchCorrection[];
  rule: WorkRule; // 기본 규칙 (그날 규칙이 없을 때)
  ruleAt?: (date: string) => WorkRule | null; // ② 4-1: 날짜마다 그날 유효한 규칙
  deemed?: (date: string, dayType: DayType) => PunchPair | null; // 간주 근무 (2026-10-10): 찍은 기록이 없는 근무일에 근무로 볼 시간. 없으면 null
  holidays: HolidayRow[];
  from: string;
  to: string;
}): DayRow[] {
  const ruleOf = (d: string) => args.ruleAt?.(d) ?? args.rule;
  const byDate = pairsByWorkDate(args.events, args.approvedCorrections.filter((c) => c.status === 'approved'));
  const out: DayRow[] = [];
  for (let ws = weekStartOf(args.from); ws <= args.to; ws = addDays(ws, 7)) {
    const days = [...Array(7)].map((_, i) => addDays(ws, i)).map((d) => {
      const dayType = resolveDayType(d, ruleOf(d), args.holidays);
      let pairs = byDate.get(d)?.pairs ?? [];
      // 간주 근무: 찍은 기록이 하나도 없을 때만 (근무일인지는 부르는 쪽이 본다). 기록이 있으면 기록이 먼저다
      if (pairs.length === 0) {
        const v = args.deemed?.(d, dayType);
        if (v) pairs = [v];
      }
      return { workDate: d, pairs, flags: byDate.get(d)?.flags ?? [], dayType };
    });
    const pairsOf = new Map(days.map((d) => [d.workDate, d.pairs]));
    const calc = calcWeek(days, ruleOf);
    for (const r of calc) {
      if (r.workDate < args.from || r.workDate > args.to) continue;
      out.push({ ...r, pairs: pairsOf.get(r.workDate) ?? [] });
    }
  }
  return out;
}

/** 이번 주 합계 (7-13 요점 6: regular + overtime + holiday) */
export function weekTotalMinutes(rows: DayRow[]): number {
  return rows.reduce((a, r) => a + r.regularMinutes + r.overtimeMinutes + r.holidayMinutes, 0);
}
