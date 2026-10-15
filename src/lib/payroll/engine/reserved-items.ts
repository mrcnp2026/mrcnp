// 자동 계산 항목은 개인 고정항목으로 중복 지급하지 않는다. 금액 변경은 명세 조정을 쓴다.
export const AUTO_PAYMENT_CODES = new Set(['BASE', 'BASE_PAY', 'PAID_LEAVE', 'OVERTIME', 'NIGHT', 'HOLIDAY', 'HOLIDAY_OVER8', 'OVERTIME_PAY', 'NIGHT_PAY', 'HOLIDAY_PAY', 'UNPAID_LEAVE_CUT', 'LATENESS_CUT']);

const aliases: Record<string, string> = { BASE_PAY: 'BASE', OVERTIME_PAY: 'OVERTIME', NIGHT_PAY: 'NIGHT', HOLIDAY_PAY: 'HOLIDAY', NATIONAL_PENSION: 'PENSION', HEALTH_INSURANCE: 'HEALTH', LONG_TERM_CARE: 'LTC', EMPLOYMENT_INSURANCE: 'EMPLOYMENT', LOCAL_INCOME_TAX: 'LOCAL_TAX' };
export const canonicalItemCode = (code: string) => aliases[code] ?? code;
