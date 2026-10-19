// 보상휴가로 돌린 연장을 급여 시간에서 빼기 (2026-10-19, 묶음 29). 순수함수.
// 인정 연장과 일한 시간에서 같이 뺀다 — 정규 시간(일한 시간 − 연장 − 휴일)은 그대로라 기본급은 바뀌지 않고 연장수당만 줄어든다.
import type { EngineTime } from './engine/engine';

export function applyCompMinutes(time: EngineTime, converted: number): { time: EngineTime; exceeds: boolean } {
  if (converted <= 0) return { time, exceeds: false };
  if (converted > time.overtimeMinutes) return { time, exceeds: true }; // 돌린 것이 인정 연장보다 많다 — 계산을 막는다
  return { time: { ...time, overtimeMinutes: time.overtimeMinutes - converted, workedMinutes: time.workedMinutes - converted }, exceeds: false };
}
