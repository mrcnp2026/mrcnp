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
export type DailyTerms = { taxState: 'UNKNOWN' | 'DAILY' | 'NONE'; ei: 'UNKNOWN' | 'YES' | 'NO'; np: 'UNKNOWN' | 'YES' | 'NO'; hi: 'UNKNOWN' | 'YES' | 'NO' };
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

/** 한 사람 · 한 달의 근무 줄(무효 제외)로 지급명세를 만든다 */
export function calcDaily(works: readonly DailyWork[], terms: DailyTerms): DailyResult {
  const live = works.filter((w) => w.status !== 'VOID');
  const blockers: DailyBlocker[] = [];
  const warnings: string[] = [];
  if (live.length === 0) blockers.push('no_work');
  if (live.some((w) => w.status === 'DRAFT')) blockers.push('unconfirmed_work'); // 확정하지 않은 근무가 섞여 있으면 계산하지 않는다
  if (terms.taxState === 'UNKNOWN') blockers.push('tax_unknown');
  if (terms.ei === 'UNKNOWN' || terms.np === 'UNKNOWN' || terms.hi === 'UNKNOWN') blockers.push('insurance_unknown');
  if (blockers.length > 0) return { state: 'BLOCKED', blockers, warnings };
  if (terms.ei === 'YES' || terms.np === 'YES' || terms.hi === 'YES') warnings.push('insurance_not_calculated'); // 보험료는 프로그램이 계산하지 않는다
  // 세금은 「하루」 단위다 — 같은 날 여러 줄(구간 · 현장)을 넣었으면 그 날의 과세 지급액을 더한 뒤 한 번 계산한다
  const byDate = new Map<string, DailyWork[]>();
  for (const w of [...live].sort((x, y) => x.workDate.localeCompare(y.workDate) || x.id.localeCompare(y.id))) byDate.set(w.workDate, [...(byDate.get(w.workDate) ?? []), w]);
  const days = [...byDate].map(([workDate, rows]): DailyDay => {
    const sum = (k: DailyItem['kind']) => rows.reduce((a, w) => a + w.items.filter((i) => i.kind === k).reduce((x, i) => x + i.amount, 0), 0);
    const taxable = rows.reduce((a, w) => a + Math.round(w.quantity * w.dayRate), 0) + sum('TAXABLE'), nontax = sum('NONTAX');
    const incomeTax = terms.taxState === 'DAILY' ? dailyIncomeTax(taxable) : 0;
    return { workIds: rows.map((w) => w.id), workDate, gross: taxable + nontax, taxable, nontax, incomeTax, localTax: floor10(Math.floor(incomeTax / 10)), deduction: sum('DEDUCTION') };
  });
  const total = (k: keyof Omit<DailyDay, 'workIds' | 'workDate'>) => days.reduce((a, d) => a + d[k], 0);
  const gross = total('gross'), incomeTax = total('incomeTax'), localTax = total('localTax'), otherDeduction = total('deduction');
  return {
    state: 'OK', blockers: [], warnings, days, workDays: Math.round(live.reduce((a, w) => a + w.quantity, 0) * 100) / 100, gross, taxable: total('taxable'), nontax: total('nontax'), incomeTax, localTax, otherDeduction,
    net: gross - incomeTax - localTax - otherDeduction, rule: DAILY_RULE,
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
