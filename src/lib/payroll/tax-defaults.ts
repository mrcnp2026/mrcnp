// 4대보험 · 세무 회사 기본값 (2026-10-25 의뢰인: 직원마다 보험 가입 여부를 하나씩 넣지 않고, 회사가 한 번 정하면 전원에게).
// 값은 「사원급여 기본값」 판의 taxDefaults에 들어간다(이력 · 임시/검증 표시는 그 판이 맡는다).
// 규칙 — 직원의 세무 판이 없으면 이 기본값으로 계산하고(소득세 선택 비율은 대장 기본값, 공제대상 가족 1명 · 자녀 0명 · 학자금 없음 · 감면 없음),
//        판은 있는데 보험이 「모름」이면 그 보험만 이 기본값으로 채운다. 직원 판에 「가입 · 미가입」이 적혀 있으면 그 값이 우선한다(예외 직원).
// ⚠️ 가족 1명 · 자녀 0명은 임시 값이다(검증 대기) — 부양가족이 있는 직원은 직원 화면에서 세무를 따로 넣는다. 순수 함수.
export const DEFAULT_INSURERS = ['pension', 'health', 'employment', 'accident'] as const;
export type DefaultInsurer = (typeof DEFAULT_INSURERS)[number];
export type TaxDefaults = { insurance: Record<DefaultInsurer, 'YES' | 'NO'> };
type Tri = 'YES' | 'NO' | 'UNKNOWN';

/**
 * 입력 검사. 안 쓰면 null, 모양이 틀리면 undefined(저장 거절).
 * 보험 넷을 모두 정해야 쓴다 — 일부만 정하면 어떤 직원은 막히고 어떤 직원은 풀려서 헷갈린다.
 */
export function cleanTaxDefaults(v: unknown): TaxDefaults | null | undefined {
  if (v === undefined || v === null || v === '') return null;
  let o: unknown = v;
  if (typeof v === 'string') {
    try {
      o = JSON.parse(v);
    } catch {
      return undefined;
    }
  }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return undefined;
  const ins = (o as { insurance?: unknown }).insurance;
  if (ins === undefined || ins === null) return null;
  if (typeof ins !== 'object' || Array.isArray(ins)) return undefined;
  const given = DEFAULT_INSURERS.filter((k) => (ins as Record<string, unknown>)[k] !== undefined && (ins as Record<string, unknown>)[k] !== '' && (ins as Record<string, unknown>)[k] !== null);
  if (given.length === 0) return null;
  if (given.length !== DEFAULT_INSURERS.length) return undefined;
  const out = {} as Record<DefaultInsurer, 'YES' | 'NO'>;
  for (const k of DEFAULT_INSURERS) {
    const s = (ins as Record<string, unknown>)[k];
    if (s !== 'YES' && s !== 'NO') return undefined;
    out[k] = s;
  }
  return { insurance: out };
}

/** 직원 판에서 읽은 보험 가입 여부 → 모름이면 회사 기본값 */
export const fillState = (state: Tri, key: DefaultInsurer, d: TaxDefaults | null | undefined): Tri => (state === 'UNKNOWN' && d ? d.insurance[key] : state);

/** 직원의 세무 판이 아예 없을 때 계산에 쓰는 값 (임시 — 위 설명 참고) */
export function synthTax(d: TaxDefaults, ratio: 80 | 100 | 120) {
  return {
    withholdingRatio: ratio,
    familyCount: 1,
    childCount: 0,
    insurance: Object.fromEntries(DEFAULT_INSURERS.map((k) => [k, { state: d.insurance[k] as Tri, reportedWage: null as number | null }])) as Record<DefaultInsurer, { state: Tri; reportedWage: number | null }>,
    studentLoan: { state: 'NO' as Tri, monthlyAmount: null as number | null },
  };
}

/** 감면을 모두 「아니오」로 둔 값 — 세무 판이 없는 직원에게 쓴다 (reliefsForMonth의 입력 모양) */
export const NO_RELIEFS = {
  sme: { state: 'NO', rate: null, from: null, to: null, note: null },
  durunuri: { state: 'NO', pensionRate: null, employmentRate: null, from: null, to: null, note: null },
  flat19: { state: 'NO', from: null, to: null, note: null },
};
