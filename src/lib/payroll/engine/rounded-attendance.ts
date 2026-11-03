import type { DayRow } from '@/lib/period';
import { weekStartOf } from '@/lib/calendar';
import { kstDateTime } from '@/lib/time';
import { calcWeek } from '@/lib/worktime';
import type { WorkRule } from '@/lib/types';

/** 원본과 승인량은 보존하고, 끊은 출퇴근을 같은 주 전체에서 다시 분류한다. */
export function roundedAttendance(days: DayRow[], ruleOf: (d: string) => WorkRule) {
  const weeks = new Map<string, DayRow[]>();
  for (const d of days) { const key = weekStartOf(d.workDate); weeks.set(key, [...(weeks.get(key) ?? []), d]); }
  const result = new Map<string, ReturnType<typeof calcWeek>[number]>();
  for (const list of weeks.values()) {
    const input = list.map((d) => {
      const rule = ruleOf(d.workDate);
      const step = (rule.roundStepMin ?? 0) * 60_000;
      // 일정 시작 전(포함)에 온 근무는 일정 시작부터 그대로 — 시작이 끊는 단위에 맞지 않아도(07:40) 올리지 않는다 (2026-11-03 의뢰인, worktime.ts와 같게)
      const planStart = rule.clipBeforeStart ? kstDateTime(d.workDate, rule.startTime.slice(0, 5)).getTime() : null;
      return { ...d, pairs: d.pairs.map((p) => {
        if (!step || !p.in || !p.out) return p;
        const inMs = Math.floor(p.in.getTime() / 60_000) * 60_000;
        const start = planStart !== null && inMs <= planStart && p.out.getTime() > planStart ? planStart : Math.ceil(inMs / step) * step;
        const end = Math.max(start, Math.floor(Math.floor(p.out.getTime() / 60_000) * 60_000 / step) * step);
        return { in: new Date(start), out: new Date(end) };
      }) };
    });
    for (const row of calcWeek(input, (d) => ({ ...ruleOf(d), roundStepMin: 0 }))) result.set(row.workDate, row);
  }
  return result;
}
