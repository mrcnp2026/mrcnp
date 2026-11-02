// 자동 계산 항목은 개인 고정항목으로 중복 지급하지 않는다. 금액 변경은 명세 조정을 쓴다.
export const AUTO_PAYMENT_CODES = new Set(['BASE', 'BASE_PAY', 'PAID_LEAVE', 'OVERTIME', 'NIGHT', 'HOLIDAY', 'HOLIDAY_OVER8', 'OVERTIME_PAY', 'NIGHT_PAY', 'HOLIDAY_PAY', 'UNPAID_LEAVE_CUT', 'LATENESS_CUT', 'WEEKLY_REST', 'PAID_HOLIDAY']);

const aliases: Record<string, string> = { BASE_PAY: 'BASE', OVERTIME_PAY: 'OVERTIME', NIGHT_PAY: 'NIGHT', HOLIDAY_PAY: 'HOLIDAY', NATIONAL_PENSION: 'PENSION', HEALTH_INSURANCE: 'HEALTH', LONG_TERM_CARE: 'LTC', EMPLOYMENT_INSURANCE: 'EMPLOYMENT', LOCAL_INCOME_TAX: 'LOCAL_TAX' };
export const canonicalItemCode = (code: string) => aliases[code] ?? code;
/** 만근수당 — 그 달에 무단결근이 있으면 주지 않는다 (급여-46, 2026-11-02 의뢰인). 회사 항목 코드로 알아본다 */
export const PERFECT_ATTENDANCE_CODES = new Set(['FULL_ATTENDANCE']);
