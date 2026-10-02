// 관리자 「주 52시간 관리」 목록 (시프티 대조 2026-10-02 우선 반영 ②). 순수함수.
// 이번 주(월~일) 합계가 소정(40시간)을 넘은 직원만, 많은 순. 숫자는 현황판과 같은 weekTotalMinutes.
import type { WeeklyLevel } from '@/lib/weekly-hours';

export type WeekLimitRow = { id: string; name: string; employeeNo: string | null; minutes: number; leftMinutes: number; level: WeeklyLevel };

export function weekLimitList(
  people: { id: string; name: string; employeeNo: string | null; weekMinutes: number | null }[],
  limits: { regularMin: number; cautionMin: number; limitMin: number },
): WeekLimitRow[] {
  return people
    .filter((p): p is typeof p & { weekMinutes: number } => p.weekMinutes !== null && p.weekMinutes > limits.regularMin)
    .map((p) => ({
      id: p.id,
      name: p.name,
      employeeNo: p.employeeNo,
      minutes: p.weekMinutes,
      leftMinutes: limits.limitMin - p.weekMinutes, // 음수 = 초과
      level: (p.weekMinutes > limits.limitMin ? 'over' : p.weekMinutes >= limits.cautionMin ? 'caution' : 'normal') as WeeklyLevel,
    }))
    .sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name, 'ko'));
}
