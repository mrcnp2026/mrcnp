// 승인된 기준 자료(요율 · 상하한 · 세액표) → 계산 모듈의 입력. 순수함수.
// ★ 자료가 없거나 모양이 틀리면 null로 두고 무엇이 빠졌는지 돌려준다 — 0이나 예전 값으로 채우지 않는다. 계산 모듈이 그 보험에 가입한 직원을 차단한다.
// ★ 관리자가 「확인 후 반영」한 자료만 넘겨받는다(여기서는 승인 여부를 모른다 — 부르는 쪽이 승인된 것만 고른다).
import { estimateTax, type ChildRule, type Json, type ReferenceKind, type TaxBand, type TaxRules } from '@/lib/payroll/reference';
import { dec, div, isDecText, text, type Rounding } from './decimal';
import type { EngineReference, InsuranceRef, Withholding } from './engine';

/**
 * 보험료의 끝수 규칙 — 임시 입력(검증 대기 기록.md). 수집한 자료에는 요율과 상하한만 있고 끝수 규칙은 없다.
 * 통상 알려진 방식(연금 기준소득월액은 천 원 미만 버림, 보험료는 10원 미만 버림)을 넣었고 노무 · 세무 확인 전이다.
 */
export const TEMP_INSURANCE_ROUNDING: { pensionBaseUnit: number; contribution: Rounding } = { pensionBaseUnit: 1000, contribution: { mode: 'FLOOR', unit: 10 } };

type Payloads = Partial<Record<ReferenceKind, Record<string, Json>>>;
const rate = (v: Json | undefined): string | null => (isDecText(v) && !v.trim().startsWith('-') ? v.trim() : null);
const krw = (v: Json | undefined): number | null => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null);

export function referenceFrom(approved: Payloads): { reference: EngineReference; missing: ReferenceKind[] } {
  const missing: ReferenceKind[] = [];
  const pair = (kind: ReferenceKind): { employeeRate: string; employerRate: string } | null => {
    const e = rate(approved[kind]?.employeeRate), o = rate(approved[kind]?.employerRate);
    if (e === null || o === null) return missing.push(kind), null;
    return { employeeRate: e, employerRate: o };
  };
  // 국민연금: 요율 + 기준소득월액 상하한이 둘 다 있어야 한다(상한 없이 계산하면 고액 급여의 연금이 틀린다)
  const pRate = pair('pension.rate');
  const lower = krw(approved['pension.limit']?.lower), upper = krw(approved['pension.limit']?.upper);
  if (lower === null || upper === null) missing.push('pension.limit');
  const pension: InsuranceRef | null = pRate && lower !== null && upper !== null ? { ...pRate, floor: lower, ceiling: upper, baseUnit: TEMP_INSURANCE_ROUNDING.pensionBaseUnit } : null;
  const hRate = pair('health.rate');
  const health: InsuranceRef | null = hRate ? { ...hRate, floor: null, ceiling: null, baseUnit: null } : null;
  // 장기요양 = 건강보험료 × (요양 요율 ÷ 건강보험 요율)
  const income = rate(approved['ltc.rate']?.incomeRate), ofHealth = rate(approved['ltc.rate']?.healthRate);
  let ltcOfHealth: string | null = null;
  if (income === null || ofHealth === null || Number(ofHealth) === 0) missing.push('ltc.rate');
  else ltcOfHealth = text(div(dec(income), dec(ofHealth)));
  const eRate = pair('employment.rate');
  const employment: InsuranceRef | null = eRate ? { ...eRate, floor: null, ceiling: null, baseUnit: null } : null;
  // 산재보험 요율은 업종별이라 수집 자료(출퇴근재해 요율)만으로는 알 수 없다 — 회사 값이 생길 때까지 비워 둔다
  return { reference: { pension, health, ltcOfHealth, employment, accidentEmployerRate: null }, missing };
}

/** 세액표 구간과 규칙 → 계산 모듈이 부르는 원천징수 함수. 과세 금액이 든 구간을 찾아 기존 세액 계산(estimateTax)을 그대로 쓴다 */
export function makeWithholding(args: { bands: readonly TaxBand[]; rules: TaxRules; childRule: ChildRule | null }): Withholding {
  return ({ taxable, family, children, ratio }) => {
    const wage = Math.max(0, Math.trunc(taxable));
    const band = args.bands.find((b) => wage >= b.wageFrom && (b.wageTo === null || wage < b.wageTo));
    const r = estimateTax({ wage, family, children, ratio, bandTaxes: band ? band.taxes : null, rules: args.rules, childRule: args.childRule });
    if (!r.ok) return { ok: false, why: r.why };
    return { ok: true, incomeTax: r.incomeTax, localTax: r.localTax, trace: { how: r.how, baseTax: r.baseTax, childAdjust: r.childAdjust, ratio: r.ratio } };
  };
}
