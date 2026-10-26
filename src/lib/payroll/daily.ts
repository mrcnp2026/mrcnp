// 일용직 지급 계산 — 순수 계산 (PRD v1.3 9장 · 18.5 W07). 화면과 서버가 같이 쓴다.
// ★ 정규직 월 세액표를 쓰지 않는다. 일용근로소득은 하루 단위로 계산한다.
// ★ 아래 숫자는 통상 방식의 임시 값이다(세무 검증 대기 — 검증 대기 기록). 규칙 번호를 명세에 남겨, 값이 바뀌면 어느 규칙으로 계산했는지 알 수 있게 한다.
//     하루 과세 지급액 − 150,000원(근로소득공제) → × 6%(세율) → × (1 − 55%)(근로소득세액공제) = 소득세. 10원 미만 버림.
//     하루 소득세가 1,000원 미만이면 떼지 않는다(소액부징수). 지방소득세 = 소득세의 10%, 10원 미만 버림.
// ★ 세금 적용 상태가 「모름」이거나 보험 적용 상태에 「모름」이 있으면 계산하지 않는다(BLOCKED). 0원으로 내지 않는다.
// ★ 4대보험료는 계산하지 않는다. 떼야 하면 근무 줄의 「공제」 항목으로 직접 넣는다.
export const DAILY_RULE = 'daily-tax-temp-1';
export const DAILY_TAX = { dailyDeduction: 150_000, rate: 0.06, credit: 0.55, minTax: 1_000 } as const;

export type DailyItem = { label: string; kind: 'TAXABLE' | 'NONTAX' | 'DEDUCTION'; amount: number };
export type DailyWork = { id: string; workDate: string; project: string; quantity: number; dayRate: number; items: DailyItem[]; status: 'DRAFT' | 'CONFIRMED' | 'VOID' };
// 프리랜서(사업소득) — 한 달 지급 합계 × 3%, 10원 미만 버림, 1,000원 미만이면 떼지 않음(소액부징수). 지방소득세 = 소득세의 10%. 4대보험 없음.
//   임시 값(세무 검증 대기 — 검증 대기 기록). 사업소득에는 근로소득 비과세가 없어 「비과세」로 넣은 항목도 세금 기준에 넣는다(경고) (2026-10-22 의뢰인)
export const BUSINESS_RULE = 'business-tax-temp-1';
export const BUSINESS_TAX = { percent: 3, minTax: 1_000 } as const;
/** 지급 기준 — 수량이 무엇을 뜻하는가: 일당 = 공수(일) · 시간당 = 시간 · 월급 = 개월 · 고정 금액 = 건수 */
export const PAY_BASES = ['DAY', 'HOUR', 'MONTH', 'FIXED'] as const;
export type PayBasis = (typeof PAY_BASES)[number];
export const QTY_MAX: Record<PayBasis, number> = { DAY: 3, HOUR: 744, MONTH: 12, FIXED: 100 };
export type DailyTerms = { taxState: 'UNKNOWN' | 'DAILY' | 'BUSINESS' | 'NONE'; ei: 'UNKNOWN' | 'YES' | 'NO'; np: 'UNKNOWN' | 'YES' | 'NO'; hi: 'UNKNOWN' | 'YES' | 'NO' };
export type DailyBlocker = 'tax_unknown' | 'insurance_unknown' | 'unconfirmed_work' | 'no_work';
export type DailyDay = { workIds: string[]; workDate: string; gross: number; taxable: number; nontax: number; incomeTax: number; localTax: number; deduction: number };
export type DailyResult =
  | { state: 'BLOCKED'; blockers: DailyBlocker[]; warnings: string[] }
  | { state: 'OK'; blockers: []; warnings: string[]; days: DailyDay[]; workDays: number; gross: number; taxable: number; nontax: number; incomeTax: number; localTax: number; otherDeduction: number; net: number; rule: string };

const floor10 = (v: number) => Math.floor(v / 10) * 10;
/** 하루 소득세 — 과세 지급액에서 */
export function dailyIncomeTax(taxable: number): number {
  const base = taxable - DAILY_TAX.dailyDeduction;
  if (base <= 0) return 0;
  // 0.06 × 0.45 = 0.027 — 소수 오차가 없도록 정수로 계산한다 (× 27 ÷ 1000)
  const tax = floor10(Math.floor((base * 27) / 1000));
  return tax < DAILY_TAX.minTax ? 0 : tax;
}

/** 사업소득 원천징수 소득세 — 한 달 지급 합계에서 */
export function businessIncomeTax(amount: number): number {
  if (amount <= 0) return 0;
  const tax = floor10(Math.floor((amount * BUSINESS_TAX.percent) / 100));
  return tax < BUSINESS_TAX.minTax ? 0 : tax;
}

/** 한 사람 · 한 달의 근무 줄(무효 제외)로 지급명세를 만든다 */
export function calcDaily(works: readonly DailyWork[], terms: DailyTerms): DailyResult {
  const live = works.filter((w) => w.status !== 'VOID');
  const blockers: DailyBlocker[] = [];
  const warnings: string[] = [];
  if (live.length === 0) blockers.push('no_work');
  if (live.some((w) => w.status === 'DRAFT')) blockers.push('unconfirmed_work'); // 확정하지 않은 근무가 섞여 있으면 계산하지 않는다
  if (terms.taxState === 'UNKNOWN') blockers.push('tax_unknown');
  const business = terms.taxState === 'BUSINESS'; // 프리랜서는 4대보험이 없다 — 보험 「모름」으로 막지 않는다
  if (!business && (terms.ei === 'UNKNOWN' || terms.np === 'UNKNOWN' || terms.hi === 'UNKNOWN')) blockers.push('insurance_unknown');
  if (blockers.length > 0) return { state: 'BLOCKED', blockers, warnings };
  if (terms.ei === 'YES' || terms.np === 'YES' || terms.hi === 'YES') warnings.push(business ? 'business_insurance' : 'insurance_not_calculated'); // 보험료는 프로그램이 계산하지 않는다
  // 세금은 「하루」 단위다 — 같은 날 여러 줄(구간 · 현장)을 넣었으면 그 날의 과세 지급액을 더한 뒤 한 번 계산한다
  const byDate = new Map<string, DailyWork[]>();
  for (const w of [...live].sort((x, y) => x.workDate.localeCompare(y.workDate) || x.id.localeCompare(y.id))) byDate.set(w.workDate, [...(byDate.get(w.workDate) ?? []), w]);
  // 같은 날 다른 현장 두 곳 이상 — 막지는 않는다(오전 · 오후 다른 현장일 수 있다). 겹쳐 넣은 것인지 담당자가 보게 알린다 (2026-10-20, 미구현 #12)
  if ([...byDate.values()].some((rows) => new Set(rows.map((w) => w.project)).size > 1)) warnings.push('same_day_projects');
  const days = [...byDate].map(([workDate, rows]): DailyDay => {
    const sum = (k: DailyItem['kind']) => rows.reduce((a, w) => a + w.items.filter((i) => i.kind === k).reduce((x, i) => x + i.amount, 0), 0);
    const taxable = rows.reduce((a, w) => a + Math.round(w.quantity * w.dayRate), 0) + sum('TAXABLE'), nontax = sum('NONTAX');
    const incomeTax = terms.taxState === 'DAILY' ? dailyIncomeTax(taxable) : 0;
    return { workIds: rows.map((w) => w.id), workDate, gross: taxable + nontax, taxable, nontax, incomeTax, localTax: floor10(Math.floor(incomeTax / 10)), deduction: sum('DEDUCTION') };
  });
  const total = (k: keyof Omit<DailyDay, 'workIds' | 'workDate'>) => days.reduce((a, d) => a + d[k], 0);
  const gross = total('gross'), otherDeduction = total('deduction');
  let incomeTax = total('incomeTax'), localTax = total('localTax'), taxable = total('taxable'), nontax = total('nontax');
  if (business) {
    // 사업소득은 한 달 합계로 한 번 — 비과세 없이 지급 전액이 기준
    if (nontax > 0) warnings.push('business_no_exempt');
    taxable = gross;
    nontax = 0;
    incomeTax = businessIncomeTax(gross);
    localTax = floor10(Math.floor(incomeTax / 10));
  }
  return {
    state: 'OK', blockers: [], warnings, days, workDays: Math.round(live.reduce((a, w) => a + w.quantity, 0) * 100) / 100, gross, taxable, nontax, incomeTax, localTax, otherDeduction,
    net: gross - incomeTax - localTax - otherDeduction, rule: business ? BUSINESS_RULE : DAILY_RULE,
  };
}

/** 저장 · 요청에서 온 항목을 정리한다 (모르는 값은 버린다) */
export function toDailyItems(v: unknown): DailyItem[] | null {
  if (!Array.isArray(v) || v.length > 10) return null;
  const out: DailyItem[] = [];
  for (const x of v as Record<string, unknown>[]) {
    const label = typeof x?.label === 'string' ? x.label.trim().slice(0, 40) : '';
    const amount = typeof x?.amount === 'number' ? x.amount : typeof x?.amount === 'string' ? Number(x.amount.replace(/,/g, '')) : NaN;
    if (!label || !Number.isInteger(amount) || amount <= 0 || amount > 1e9 || (x.kind !== 'TAXABLE' && x.kind !== 'NONTAX' && x.kind !== 'DEDUCTION')) return null;
    out.push({ label, kind: x.kind, amount });
  }
  return out;
}
