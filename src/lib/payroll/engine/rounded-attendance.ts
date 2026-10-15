import type { DayRow } from '@/lib/period';
import { weekStartOf } from '@/lib/calendar';
import { calcWeek } from '@/lib/worktime';
import type { WorkRule } from '@/lib/types';

/** 원본과 승인량은 보존하고, 끊은 출퇴근을 같은 주 전체에서 다시 분류한다. */
export function roundedAttendance(days: DayRow[], ruleOf: (d: string) => WorkRule) {
  const weeks = new Map<string, DayRow[]>();
  for (const d of days) { const key = weekStartOf(d.workDate); weeks.set(key, [...(weeks.get(key) ?? []), d]); }
  const result = new Map<string, ReturnType<typeof calcWeek>[number]>();
  for (const list of weeks.values()) {
    const input = list.map((d) => {
      const step = (ruleOf(d.workDate).roundStepMin ?? 0) * 60_000;
      return { ...d, pairs: d.pairs.map((p) => {
        if (!step || !p.in || !p.out) return p;
        const start = Math.ceil(Math.floor(p.in.getTime() / 60_000) * 60_000 / step) * step;
        const end = Math.max(start, Math.floor(Math.floor(p.out.getTime() / 60_000) * 60_000 / step) * step);
        return { in: new Date(start), out: new Date(end) };
      }) };
    });
    for (const row of calcWeek(input, (d) => ({ ...ruleOf(d), roundStepMin: 0 }))) result.set(row.workDate, row);
  }
  return result;
}
