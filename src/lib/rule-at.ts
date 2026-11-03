// 그 날짜에 유효한 근무규칙 — 순수함수 (② 4-1, B-1).
// 규칙을 09:00 → 09:30으로 바꿔도 지난달 지각은 지난달 규칙으로 판정한다. 최신 규칙으로 과거를 다시 계산하지 않는다.
import type { LateRound, WorkRule } from '@/lib/types';

export type RuleVersion = { effectiveFrom: string; rule: WorkRule };

/** versions 중 effectiveFrom ≤ date 인 것 가운데 가장 늦게 시작한 것. 없으면 null (지어내지 않는다) */
export function ruleAt(versions: readonly RuleVersion[], date: string): WorkRule | null {
  let best: RuleVersion | null = null;
  for (const v of versions) if (v.effectiveFrom <= date && (!best || v.effectiveFrom > best.effectiveFrom)) best = v;
  return best?.rule ?? null;
}

/** 늦은 출근 끊기 설정(이력)을 규칙 판에 얹는다 — 설정이 바뀐 날도 판이 갈리게 해 그 날짜의 값으로 계산한다 (② 4-1) */
export function withLateRound(versions: readonly RuleVersion[], history: readonly { value: unknown; effectiveFrom: string }[], fallback: LateRound): RuleVersion[] {
  const modeAt = (d: string) => { let best: { value: unknown; effectiveFrom: string } | null = null; for (const h of history) if (h.effectiveFrom <= d && (!best || h.effectiveFrom > best.effectiveFrom)) best = h; return (best?.value as LateRound | undefined) ?? fallback; };
  const dates = [...new Set([...versions.map((v) => v.effectiveFrom), ...history.map((h) => h.effectiveFrom)])].sort();
  const out: RuleVersion[] = [];
  for (const d of dates) { const r = ruleAt(versions, d); if (r) out.push({ effectiveFrom: d, rule: { ...r, lateRound: modeAt(d) } }); }
  return out.reverse();
}
