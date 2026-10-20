// 퇴사자 남은 연차 수당 (2026-10-20 의뢰인: 노프로 비교 뒤 「2번 진행해」). 순수 함수.
// 근로기준법 제60조 — 퇴사로 쓰지 못한 연차는 수당으로 준다. 금액 = 1일 통상임금 × 남은 일수.
//   1일 통상임금 = 통상시급 × 하루 소정근로시간(휴가 원장의 하루 = 8시간)
//   통상시급 = 시급(월급 ÷ 월 환산시간) + 통상임금에 「포함」인 매달 수당 ÷ 월 환산시간(시급제는 209시간)
// ★ 수당의 통상임금 포함 여부가 「모름」이면 빼고 계산하고 그 항목을 알린다(노무 확인 — 결정 사항 급여-47).
// ★ 선사용 미상계(당겨 쓰고 못 갚은 연차)는 임금에서 자동으로 빼지 않는다 — 일수만 따로 보인다.
import { referenceHourly } from '@/lib/payroll/contract';

export const LEAVE_PAYOUT_RULE = 'leave-payout-1';
const HOURLY_DIVISOR = 209; // 시급제의 월 환산시간 (주 40시간 + 주휴 8시간 × 4.345주)

export type PayoutContract = { payType: 'MONTHLY' | 'HOURLY' | 'ANNUAL'; amount: number; monthlyHours: number | null; annualDivisor: number | null };
export type PayoutItem = { code: string; label: string; amount: number; ordinaryWage: 'INCLUDED' | 'EXCLUDED' | 'UNKNOWN' };
export type LeavePayout = {
  state: 'OK' | 'NO_CONTRACT' | 'NO_HOURS';
  baseHourly: number | null;          // 계약에서 나온 시급(원, 반올림 전 정수 — 월급제는 참고 시급)
  ordinaryItems: { code: string; label: string; amount: number }[]; // 통상시급에 더한 수당
  unknownItems: string[];             // 포함 여부를 몰라 뺀 수당 이름
  ordinaryHourly: number | null;      // 통상시급(원, 1원 미만 버림)
  dayHours: number;
  daily: number | null;               // 1일 통상임금(원, 1원 미만 버림)
  unusedDays: number;
  amount: number | null;              // 남은 연차 수당(원, 1원 미만 버림)
  rule: string;
};

export function leavePayout(args: { contract: PayoutContract | null; items: readonly PayoutItem[]; unusedMinutes: number; dayMinutes: number }): LeavePayout {
  const dayHours = args.dayMinutes / 60;
  const unusedDays = Math.round((args.unusedMinutes / args.dayMinutes) * 10000) / 10000;
  const base = { dayHours, unusedDays, rule: LEAVE_PAYOUT_RULE, ordinaryItems: [], unknownItems: [] };
  if (!args.contract) return { ...base, state: 'NO_CONTRACT', baseHourly: null, ordinaryHourly: null, daily: null, amount: null };
  const c = args.contract;
  const divisor = c.payType === 'HOURLY' ? (c.monthlyHours ?? HOURLY_DIVISOR) : c.monthlyHours;
  // 월급 · 연봉제는 정확한 값으로 나눈다(참고 시급은 반올림돼 있다)
  const exactBase = c.payType === 'HOURLY' ? c.amount : divisor === null ? null : c.payType === 'MONTHLY' ? c.amount / divisor : c.annualDivisor === null ? null : c.amount / c.annualDivisor / divisor;
  if (exactBase === null || divisor === null) return { ...base, state: 'NO_HOURS', baseHourly: referenceHourly(c), ordinaryHourly: null, daily: null, amount: null };
  const ordinaryItems = args.items.filter((i) => i.ordinaryWage === 'INCLUDED' && i.amount > 0).map((i) => ({ code: i.code, label: i.label, amount: i.amount }));
  const unknownItems = args.items.filter((i) => i.ordinaryWage === 'UNKNOWN' && i.amount > 0).map((i) => i.label);
  const hourly = exactBase + ordinaryItems.reduce((a, i) => a + i.amount, 0) / divisor;
  const floor = (v: number) => Math.floor(v + 1e-9);
  return {
    ...base,
    state: 'OK',
    baseHourly: referenceHourly(c),
    ordinaryItems,
    unknownItems,
    ordinaryHourly: floor(hourly),
    daily: floor(hourly * dayHours),
    amount: floor((hourly * args.unusedMinutes) / 60),
  };
}
