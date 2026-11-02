// 휴게 안 함 (결정 사항 급여-60, 2026-11-02) — 순수 함수. 그날 표시한 휴게시간대를 규칙에서 뺀다
import { hhmm } from '@/lib/time';
import type { WorkRule } from '@/lib/types';

/** 휴게 안 함으로 표시한 휴게시간대를 그날 규칙에서 뺀다 (시작 시각 'HH:MM'으로 맞춘다) */
export function waiveBreaks(rule: WorkRule, starts: ReadonlySet<string>): WorkRule {
  const main = rule.breakStart && starts.has(hhmm(rule.breakStart));
  return { ...rule, breakStart: main ? null : rule.breakStart, breakEnd: main ? null : rule.breakEnd, extraBreaks: (rule.extraBreaks ?? []).filter((b) => !starts.has(hhmm(b.start))) };
}
