// 직원 등록 중 급여 입력 (2026-10-25 의뢰인) — 등록 양식의 pay* 칸을 계약 입력으로 바꾼다. 순수 함수.
// 금액을 비우면 급여는 건너뛴다(나중에 사원별 급여에서). 금액이 있으면 계약 검사를 그대로 통과해야 한다 —
// 직원을 만들기 전에 검사하므로, 틀린 급여 때문에 직원만 반쯤 만들어지는 일이 없다.
import { validateContract, type ContractInput } from './contract';

export type NewStaffPay = { skip: true } | { skip: false; input: ContractInput } | { error: string };

const blank = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

export function newStaffPay(b: Record<string, unknown>): NewStaffPay {
  if (blank(b.payAmount)) return { skip: true };
  const v = validateContract({
    payType: b.payType,
    amount: b.payAmount,
    timeBasis: blank(b.payTimeBasis) ? 'ROUNDED' : b.payTimeBasis,
    monthlyHours: b.payType === 'HOURLY' || blank(b.payMonthlyHours) ? null : b.payMonthlyHours,
    annualDivisor: b.payType === 'ANNUAL' ? (blank(b.payAnnualDivisor) ? null : b.payAnnualDivisor) : null,
  });
  return v.ok ? { skip: false, input: v.value } : { error: v.code };
}
