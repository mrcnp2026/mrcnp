// 백업 보관 규칙 (2026-10-16 의뢰인 결정, Supabase Pro가 최근 7일은 따로 보관)
// - 매주: 최근 8개
// - 매월: 최근 12개월, 그달의 첫 백업
// - 매년: 해마다 그해의 첫 백업, 지우지 않음
// 날짜는 한국 시간 기준 'YYYY-MM-DD'.

export const KEEP_WEEKLY = 8;
export const KEEP_MONTHLY = 12;

export type Kept = { weekly: boolean; monthly: boolean; yearly: boolean };

export function classify(dates: string[]): Map<string, Kept> {
  const sorted = [...new Set(dates)].sort();
  const res = new Map<string, Kept>(sorted.map((d) => [d, { weekly: false, monthly: false, yearly: false }]));
  for (const d of sorted.slice(-KEEP_WEEKLY)) res.get(d)!.weekly = true;
  const firstOfMonth = new Map<string, string>();
  const firstOfYear = new Map<string, string>();
  for (const d of sorted) {
    if (!firstOfMonth.has(d.slice(0, 7))) firstOfMonth.set(d.slice(0, 7), d);
    if (!firstOfYear.has(d.slice(0, 4))) firstOfYear.set(d.slice(0, 4), d);
  }
  for (const d of [...firstOfMonth.values()].slice(-KEEP_MONTHLY)) res.get(d)!.monthly = true;
  for (const d of firstOfYear.values()) res.get(d)!.yearly = true;
  return res;
}

export function toDelete(dates: string[]): string[] {
  return [...classify(dates)].filter(([, k]) => !k.weekly && !k.monthly && !k.yearly).map(([d]) => d);
}
