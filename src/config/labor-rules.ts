// 노무 해석이 들어간 값과 판정표를 한곳에 모은다 (부록 R-3).
//
// ⚠️ 여기 있는 값은 전부 "미검증 — 노무 확인 필요"다 (요청서 A 구역, 2026-10-02 기준 미발송).
//    노무사 답이 본문 해석과 다르면 **이 파일만** 고친다. 계산 모듈(worktime·overtime·lateness)에
//    480·2400·22:00 같은 숫자를 직접 쓰지 마라 — 고칠 곳이 흩어지면 하나를 놓친다.
//    값을 바꾸면 office.ts의 CALC_VERSION도 올린다 (부록 R-12-2).

import type { DayType, HolidayRow, WorkRule } from '@/lib/types';
import { isoWeekday } from '@/lib/calendar';

export const LABOR = {
  // 7-6 요점 3: 1일 8시간 / 주 40시간. 둘을 한 번만 센다 (B-9)
  dailyRegularLimitMin: 480,
  weeklyRegularLimitMin: 2400,

  // 7-6 요점 7: 휴일근로 8시간 이내/초과 구분 (근로기준법 제56조 제2항) — 미검증
  holidaySplitMin: 480,

  // 7-6 요점 4: 야간 구간. 자정을 넘기므로 계산은 두 조각으로 나눈다 (B-10)
  nightStart: '22:00',
  nightEnd: '06:00',

  // 휴게시간대와 겹친 분은 근무 길이와 상관없이 뺀다 (확정-9, 2026-10-11: 시프티에서 지금 쓰는 방식 그대로 — 9월 508건 전부 겹친 만큼 차감).
  //   예전 값은 240(4시간 미만 근무는 공제하지 않음)이었다.
  breakDeductionMinGrossMin: 0,

  // 7-6 요점 1: 법정 최소 휴게 (근로기준법 제54조). 모자라면 더 빼지 않고 flags만 남긴다 — 미검증
  //   실근로가 workMin 이상인데 공제된 휴게가 breakMin 미만이면 '법정 휴게 미확인'. 큰 기준부터 본다.
  legalBreak: [
    { workMin: 480, breakMin: 60 },
    { workMin: 240, breakMin: 30 },
  ],

  // 7-6 요점 5·7-13 요점 6: 주 52시간 판정 합계에 휴일근로를 넣는다 (제2조 제1항 제7호) — 미검증
  weeklyTotalIncludesHoliday: true,
} as const;

/**
 * 7-6 요점 7 — 그날이 어떤 날인가. **판정표는 여기 한 곳뿐이다** (지각 판정도 이것을 쓴다, 7-5 요점 2).
 *
 * | 조건 (위에서부터 먼저 맞는 것)              | dayType   |
 * |--------------------------------------------|-----------|
 * | holidays.kind = public 또는 weekly_rest     | holiday   |
 * | 요일 = work_rules.weekly_rest_day           | holiday   |
 * | holidays.kind = company                     | rest_off  |
 * | 요일이 workdays에 없음 (예: 토요일)          | rest_off  |
 * | 그 외                                       | workday   |
 *
 * 휴무일(rest_off)은 휴일 축이 아니라 소정·연장으로 간다 — 미검증, 노무 확인 필요.
 */
export function resolveDayType(date: string, rule: WorkRule, holidays: HolidayRow[]): DayType {
  const h = holidays.find((x) => x.date === date);
  const wd = isoWeekday(date);
  if (h && (h.kind === 'public' || h.kind === 'weekly_rest')) return 'holiday';
  if (wd === rule.weeklyRestDay) return 'holiday';
  if (h && h.kind === 'company') return 'rest_off';
  if (!rule.workdays.includes(wd)) return 'rest_off';
  return 'workday';
}
