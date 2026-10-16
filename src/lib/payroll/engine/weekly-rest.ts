// 시급제의 주휴 · 유급휴일 시간 (2026-10-16 의뢰인, 26.08 · 2025.12 대장의 회사 방식). 순수함수.
//   주휴(대장 「주차」) = 그 달 재직 기간에 든 주휴일(보통 일요일) 수 × 하루 시간
//   유급휴일(대장 「유휴」) = 그 달 재직 기간에 든 공휴일 가운데 소정 근무일(보통 월~금)인 날 × 하루 시간 — 토요일 공휴일(8/15)은 넣지 않고 대체공휴일(8/17)을 넣는다
// ★ 결근한 주의 주휴를 뺄지는 아직 정하지 않았다(결정 사항 급여-41). 여기서는 빼지 않고, 결근한 날이 있으면 부르는 쪽이 「참고」로 남긴다.
// 월급 · 연봉제는 기본급에 이미 들어 있어 쓰지 않는다.
import { addDays } from '@/lib/calendar';
import type { HolidayRow, WorkRule } from '@/lib/types';

const isoWeekday = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
};

export function restAndHolidayMinutes(args: {
  from: string; // 그 달 첫날
  last: string; // 그 달 마지막 날
  startsOn?: string | null; // 입사일 — 그 전 날은 세지 않는다
  endsOn?: string | null; // 퇴사일 — 그 뒤 날은 세지 않는다
  ruleAt: (date: string) => WorkRule | null;
  holidays: readonly HolidayRow[];
  dayMinutes?: number; // 하루 시간 (기본 8시간)
}): { weeklyRestMinutes: number; paidHolidayMinutes: number; weeklyRestDays: string[]; paidHolidays: string[] } {
  const day = args.dayMinutes ?? 480;
  const lo = args.startsOn && args.startsOn > args.from ? args.startsOn : args.from;
  const hi = args.endsOn && args.endsOn < args.last ? args.endsOn : args.last;
  const publicDays = new Set(args.holidays.filter((h) => h.kind === 'public').map((h) => h.date));
  const weeklyRestDays: string[] = [];
  const paidHolidays: string[] = [];
  for (let d = lo; d <= hi; d = addDays(d, 1)) {
    const rule = args.ruleAt(d);
    if (!rule) continue;
    const wd = isoWeekday(d);
    if (wd === rule.weeklyRestDay) weeklyRestDays.push(d);
    else if (publicDays.has(d) && rule.workdays.includes(wd)) paidHolidays.push(d);
  }
  return { weeklyRestMinutes: weeklyRestDays.length * day, paidHolidayMinutes: paidHolidays.length * day, weeklyRestDays, paidHolidays };
}
