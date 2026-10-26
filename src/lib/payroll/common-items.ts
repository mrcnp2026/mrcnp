// 회사 공통 고정 수당 · 공제 (2026-10-25 의뢰인: 직원마다 입력하지 않고, 관리자가 한 번 정하면 전원에게 붙게).
// 값은 「사원급여 기본값」 판(payroll_company_setting_versions, section = employee-defaults)의 commonItems에 들어간다 — 이력 · 임시/검증 표시를 그 판이 맡는다.
// 규칙: 공통 항목은 재직 중인 모든 직원에게 붙는다(급여 유형을 골랐으면 그 유형만). 단 ① 제외로 적은 직원은 빼고 ② 그 직원에게 같은 항목이 개인 항목으로 있으면 개인 항목이 이긴다(금액이 다른 사람).
// 자동 계산 항목(기본급 · 연장 · 야간 · 휴일 · 보험 · 세금)은 공통 항목으로도 넣을 수 없다. 순수 함수.
import { AUTO_PAYMENT_CODES } from './engine/reserved-items';

export const COMMON_MAX_ITEMS = 30;
export const COMMON_MAX_EXCEPT = 100;
const MAX_AMOUNT = 100_000_000_000; // 계약 금액과 같은 상한 — 자릿수 실수를 막는다
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const COMMON_PAY_TYPES = ['MONTHLY', 'HOURLY', 'ANNUAL'] as const;
export type CommonPayType = (typeof COMMON_PAY_TYPES)[number];

/** payTypes: 이 항목이 붙는 급여 유형. 없거나 비어 있으면 모든 유형(예전에 저장한 항목도 그대로 전원 적용) */
export type CommonItem = { code: string; amount: number; exceptIds: string[]; payTypes?: CommonPayType[] };

/** 입력 검사. 모양이 틀리면 null(저장 거절). 같은 항목을 두 번 넣거나 자동 계산 항목이면 거절 */
export function cleanCommonItems(v: unknown): CommonItem[] | null {
  if (v === undefined || v === null || v === '') return [];
  let list: unknown = v;
  if (typeof v === 'string') {
    try {
      list = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(list) || list.length > COMMON_MAX_ITEMS) return null;
  const out: CommonItem[] = [];
  for (const x of list) {
    if (!x || typeof x !== 'object') return null;
    const { code, amount, exceptIds, payTypes } = x as Record<string, unknown>;
    const n = typeof amount === 'string' && /^\d{1,12}$/.test(amount.trim()) ? Number(amount) : amount;
    if (typeof code !== 'string' || !/^[A-Z0-9_]{2,40}$/.test(code) || AUTO_PAYMENT_CODES.has(code) || out.some((o) => o.code === code)) return null;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > MAX_AMOUNT) return null;
    const ex = exceptIds === undefined ? [] : exceptIds;
    if (!Array.isArray(ex) || ex.length > COMMON_MAX_EXCEPT || ex.some((e) => typeof e !== 'string' || !UUID.test(e))) return null;
    const pt = payTypes === undefined || payTypes === null ? [] : payTypes;
    if (!Array.isArray(pt) || pt.some((p) => !(COMMON_PAY_TYPES as readonly unknown[]).includes(p))) return null;
    const types = COMMON_PAY_TYPES.filter((k) => (pt as unknown[]).includes(k));
    out.push({ code, amount: n, exceptIds: [...new Set(ex as string[])], ...(types.length > 0 && types.length < COMMON_PAY_TYPES.length ? { payTypes: types } : {}) }); // 셋 다 고르면 「전체」와 같으니 저장하지 않는다
  }
  return out;
}

export type Assigned = { itemCode: string; amount: number | null; source: 'personal' | 'common' };

/** 개인 항목(그날 붙어 있는 것) + 공통 항목 → 그 직원에게 붙는 항목. 개인 항목이 같은 항목의 공통 값을 덮는다 */
/** 이 공통 항목이 그 급여 유형에 붙는가. 유형을 모르면(계약 없음) 유형 제한이 없는 항목만 */
export function commonAppliesTo(c: CommonItem, payType: string | null | undefined): boolean {
  return !c.payTypes || c.payTypes.length === 0 || (!!payType && (c.payTypes as readonly string[]).includes(payType));
}

export function mergeAssigned(personal: { itemCode: string; amount: number | null }[], common: readonly CommonItem[] | undefined, employeeId: string, payType?: string | null): Assigned[] {
  const out: Assigned[] = personal.map((p) => ({ ...p, source: 'personal' as const }));
  for (const c of common ?? []) {
    if (c.exceptIds.includes(employeeId) || !commonAppliesTo(c, payType) || personal.some((p) => p.itemCode === c.code)) continue;
    out.push({ itemCode: c.code, amount: c.amount, source: 'common' });
  }
  return out;
}
