// 이번 주 누적 근로시간 (7-13). 순수함수. 알림을 보내지 않는다 — 숫자와 색만 (요점 3).

import { OFFICE } from '@/config/office';
import { addDays } from '@/lib/calendar';

export type WeeklyLevel = 'normal' | 'caution' | 'over';

export function weeklyHours(args: {
  weekStart: string; // 월요일 (KST)
  // 요점 6: 합계는 regular + overtime + holiday (= netMinutes). 휴일근로를 뺀 합계로 색을 정하지 마라
  dailyWork: { workDate: string; netMinutes: number }[];
  is5OrMore: boolean; // 상시 5인 이상인가 (7-14: 지금은 OFFICE.workplaceSize)
}): { totalMinutes: number; level: WeeklyLevel; colored: boolean; note: string } {
  const weekEnd = addDays(args.weekStart, 6);
  // 요점 1: 월~일 KST. 근무일(work_date)로 묶으므로 일요일 23시 기록이 다음 주로 넘어가지 않는다
  const totalMinutes = args.dailyWork
    .filter((d) => d.workDate >= args.weekStart && d.workDate <= weekEnd)
    .reduce((a, d) => a + d.netMinutes, 0);

  let level: WeeklyLevel = 'normal';
  if (totalMinutes > OFFICE.weeklyLimitHours * 60) level = 'over';
  else if (totalMinutes >= OFFICE.weeklyCautionHours * 60) level = 'caution';

  // 요점 4: 상시 5인 미만이면 52시간 한도 규정이 적용되지 않으므로 색 없이 숫자만
  const colored = args.is5OrMore;
  // 요점 5 + 7-14: 연차·출장 모듈(②)이 아직 없어 승인된 휴가일은 합계에 들어가지 않는다
  const note = '실제 출퇴근 기록만 합산함 (연차·출장 등 승인된 휴가·근무 신청은 ② 연결 전이라 미반영)';
  return { totalMinutes, level, colored, note };
}
