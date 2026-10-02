// 그 날짜에 유효한 근무규칙 — 순수함수 (② 4-1, B-1).
// 규칙을 09:00 → 09:30으로 바꿔도 지난달 지각은 지난달 규칙으로 판정한다. 최신 규칙으로 과거를 다시 계산하지 않는다.
import type { WorkRule } from '@/lib/types';

export type RuleVersion = { effectiveFrom: string; rule: WorkRule };

/** versions 중 effectiveFrom ≤ date 인 것 가운데 가장 늦게 시작한 것. 없으면 null (지어내지 않는다) */
export function ruleAt(versions: readonly RuleVersion[], date: string): WorkRule | null {
  let best: RuleVersion | null = null;
  for (const v of versions) if (v.effectiveFrom <= date && (!best || v.effectiveFrom > best.effectiveFrom)) best = v;
  return best?.rule ?? null;
}
