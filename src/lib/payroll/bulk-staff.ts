// 사원별 급여 「여러 명에게 한 번에 적용」 (2026-10-25 의뢰인). 순수 함수 — 저장은 직원마다 기존 길(saveContract · saveTax · addStaffItem)로 한다.
// ★ 바꾸는 칸만 바꾸고 나머지는 그 직원의 지금 값을 그대로 이어 쓴다(판이 새로 쌓인다). 모르는 값을 지어내지 않는다.
import type { ContractInput, Insurer, TaxInput, TimeBasis } from './contract';
import { INSURERS, TIME_BASES, UNKNOWN_TAX } from './contract';

export const BULK_MAX = 100; // 한 번에 고를 수 있는 직원 수 (실수로 전원 · 대량 변경을 막는 상한이 아니라 요청 크기 상한)
const MAX_AMOUNT = 100_000_000_000;

export type AmountMode = 'keep' | 'percent' | 'add' | 'set';
export type ContractEdit = { amountMode: AmountMode; amountValue: number | null; timeBasis: TimeBasis | null; monthlyHours: number | null };

/** 입력 검사 — 하나도 안 바꾸면 거절 */
export function cleanContractEdit(b: Record<string, unknown>): ContractEdit | null {
  const mode = b.amountMode === undefined || b.amountMode === '' ? 'keep' : b.amountMode;
  if (mode !== 'keep' && mode !== 'percent' && mode !== 'add' && mode !== 'set') return null;
  const numOf = (v: unknown): number | null | undefined => (v === undefined || v === null || v === '' ? null : typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);
  const amountValue = numOf(b.amountValue);
  const monthlyHours = numOf(b.monthlyHours);
  if (amountValue === undefined || monthlyHours === undefined) return null;
  if (mode !== 'keep' && amountValue === null) return null;
  if (mode === 'percent' && (amountValue! < -90 || amountValue! > 500 || !Number.isInteger(amountValue! * 100))) return null;
  if ((mode === 'add' || mode === 'set') && (!Number.isInteger(amountValue!) || (mode === 'set' && amountValue! <= 0) || Math.abs(amountValue!) > MAX_AMOUNT)) return null;
  const timeBasis = b.timeBasis === undefined || b.timeBasis === null || b.timeBasis === '' ? null : (TIME_BASES as readonly unknown[]).includes(b.timeBasis) ? (b.timeBasis as TimeBasis) : undefined;
  if (timeBasis === undefined) return null;
  if (monthlyHours !== null && (monthlyHours <= 0 || monthlyHours > 744 || !Number.isInteger(monthlyHours * 100))) return null;
  if (mode === 'keep' && timeBasis === null && monthlyHours === null) return null; // 바꾸는 것이 없다
  return { amountMode: mode, amountValue, timeBasis, monthlyHours };
}

/** 지금 계약에 바꾸는 칸만 얹은 새 계약. 금액이 0 이하가 되면 null(그 직원은 건너뛴다). 원 미만은 반올림 */
export function applyContractEdit(cur: ContractInput, e: ContractEdit): ContractInput | null {
  let amount = cur.amount;
  if (e.amountMode === 'percent') amount = Math.round(cur.amount * (1 + e.amountValue! / 100));
  else if (e.amountMode === 'add') amount = cur.amount + e.amountValue!;
  else if (e.amountMode === 'set') amount = e.amountValue!;
  if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_AMOUNT) return null;
  return { ...cur, amount, timeBasis: e.timeBasis ?? cur.timeBasis, monthlyHours: cur.payType === 'HOURLY' ? null : (e.monthlyHours ?? cur.monthlyHours) }; // 시급제에는 월 환산 시간이 없다
}

export type InsuranceEdit = Partial<Record<Insurer, 'YES' | 'NO'>>;

/** 입력 검사 — 하나도 안 고르면 거절 */
export function cleanInsuranceEdit(v: unknown): InsuranceEdit | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const out: InsuranceEdit = {};
  for (const k of INSURERS) {
    const s = (v as Record<string, unknown>)[k];
    if (s === undefined || s === null || s === '') continue;
    if (s !== 'YES' && s !== 'NO') return null;
    out[k] = s;
  }
  return Object.keys(out).length ? out : null;
}

/** 지금 세무 판에 고른 보험만 바꾼 새 세무 판 (판이 없는 직원은 「모름」 바탕에 고른 보험만) */
export function applyInsuranceEdit(cur: TaxInput | null, e: InsuranceEdit): TaxInput {
  const base = cur ?? UNKNOWN_TAX;
  const insurance = { ...base.insurance };
  for (const k of INSURERS) if (e[k]) insurance[k] = { ...insurance[k], state: e[k]!, ...(e[k] === 'NO' ? { reportedWage: null } : {}) };
  return { ...base, insurance };
}
