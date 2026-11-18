// 휴게 안 함 (결정 사항 급여-60, 2026-11-02) — 순수 함수. 그날 표시한 휴게시간대를 규칙에서 뺀다
import { hhmm } from '@/lib/time';
import type { WorkRule } from '@/lib/types';

/** 휴게 안 함으로 표시한 휴게시간대를 그날 규칙에서 뺀다 (시작 시각 'HH:MM'으로 맞춘다) */
export function waiveBreaks(rule: WorkRule, starts: ReadonlySet<string>): WorkRule {
  const main = rule.breakStart && starts.has(hhmm(rule.breakStart));
  return { ...rule, breakStart: main ? null : rule.breakStart, breakEnd: main ? null : rule.breakEnd, extraBreaks: (rule.extraBreaks ?? []).filter((b) => !starts.has(hhmm(b.start))) };
}

/** 저녁 휴게 기본값 (급여-78) — 그날 걸린 판이 「안 쉼」이면 그날 규칙의 17시 이후 휴게 시작 시각들. 판은 시작일 · 넣은 순서로 정렬해 받는다 */
export function eveningSkipped(rows: readonly { valid_from: string; skip_evening: boolean }[], date: string, rule: WorkRule | null): string[] {
  let off = false;
  for (const r of rows) if (r.valid_from <= date) off = r.skip_evening;
  return off && rule ? (rule.extraBreaks ?? []).map((b) => hhmm(b.start)).filter((s) => s >= '17:00') : [];
}
