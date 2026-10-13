// 근태 이상자 판정 (PRD v1.3 A15, 통합 개발 계획 M6). 순수함수.
// 하루 한 직원의 기록을 보고 「이상 유형」을 낸다. 유형마다 회사가 정한다: 마감을 막는다(block) · 확인만 한다(check) · 보지 않는다(off).
// ★ 여기서는 드러내기만 한다 — 기록을 고치는 길은 정정 요청 · 관리자 대리 입력뿐이다.
import { FLAG } from '@/lib/flags';
import { kstDateTime } from '@/lib/time';
import type { PunchPair } from '@/lib/types';

export const ANOMALY_TYPES = ['missing_in', 'missing_out', 'orphan_out', 'overlap', 'duplicate', 'late', 'early', 'no_plan_work', 'unverified_place', 'leave_day_punch'] as const;
export type AnomalyType = (typeof ANOMALY_TYPES)[number];
export type AnomalyLevel = 'block' | 'check' | 'off';
export type AnomalyPolicy = Record<AnomalyType, AnomalyLevel>;

/** 통상 방식 — 근무시간을 알 수 없게 만드는 것(퇴근 누락 · 짝 없는 퇴근 · 겹침)은 마감을 막고, 나머지는 확인만. 출근 누락은 결근일 수 있어 막지 않는다 */
export const DEFAULT_ANOMALY_POLICY: AnomalyPolicy = {
  missing_out: 'block', orphan_out: 'block', overlap: 'block',
  missing_in: 'check', duplicate: 'check', late: 'check', early: 'check', no_plan_work: 'check', unverified_place: 'check', leave_day_punch: 'check',
};

export function validateAnomalyPolicy(v: unknown): AnomalyPolicy | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const out = { ...DEFAULT_ANOMALY_POLICY };
  for (const k of ANOMALY_TYPES) {
    if (o[k] !== 'block' && o[k] !== 'check' && o[k] !== 'off') return null;
    out[k] = o[k] as AnomalyLevel;
  }
  return out;
}
/** 저장된 값이 없거나 유형이 늘었으면 기본값으로 채운다 */
export function anomalyPolicyOf(v: unknown): AnomalyPolicy {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_ANOMALY_POLICY };
  for (const k of ANOMALY_TYPES) if (o[k] === 'block' || o[k] === 'check' || o[k] === 'off') out[k] = o[k] as AnomalyLevel;
  return out;
}

export function dayAnomalies(args: {
  workDate: string;
  pairs: readonly PunchPair[];
  flags: readonly string[];
  plan: { startTime: string; endTime: string; graceMin: number } | null; // 그날 일정 (반차가 반영된 시각). 없으면 쉬는 날
  deemed: boolean; // 간주 근무 — 찍은 기록으로 따지지 않는다
  excused: boolean; // 하루 전부 휴가 · 승인된 외근/출장/재택
  missing: 'in' | 'out' | null; // 누락 목록과 같은 기준 (missing-list.ts)
  unverified: number; // 사무실 인터넷 · 위치 어느 쪽으로도 확인되지 않은 기록 수 (관리자 대리 입력 제외)
}): AnomalyType[] {
  const out = new Set<AnomalyType>();
  if (args.deemed) return [];
  if (args.missing === 'in') out.add('missing_in');
  if (args.missing === 'out') out.add('missing_out');
  if (args.flags.includes(FLAG.ORPHAN_OUT)) out.add('orphan_out');
  if (args.flags.includes(FLAG.DUPLICATE_IN) || args.flags.includes(FLAG.DUPLICATE_OUT)) out.add('duplicate');
  if (args.flags.includes(FLAG.LEAVE_DAY_PUNCH)) out.add('leave_day_punch');
  const done = args.pairs.filter((p): p is { in: Date; out: Date } => !!p.in && !!p.out).sort((a, b) => a.in.getTime() - b.in.getTime());
  if (done.some((p, i) => p.out.getTime() < p.in.getTime() || (i > 0 && p.in.getTime() < done[i - 1].out.getTime()))) out.add('overlap');
  const ins = args.pairs.filter((p) => p.in).map((p) => (p.in as Date).getTime());
  if (ins.length > 0 && args.excused) out.add('leave_day_punch');
  if (ins.length > 0 && !args.plan && !args.excused) out.add('no_plan_work');
  if (args.plan && !args.excused && ins.length > 0) {
    const start = kstDateTime(args.workDate, args.plan.startTime).getTime() + args.plan.graceMin * 60_000;
    if (Math.min(...ins) > start) out.add('late');
    const open = args.pairs.some((p) => p.in && !p.out);
    const outs = args.pairs.filter((p) => p.out).map((p) => (p.out as Date).getTime());
    if (!open && outs.length > 0 && Math.max(...outs) < kstDateTime(args.workDate, args.plan.endTime).getTime()) out.add('early');
  }
  if (args.unverified > 0) out.add('unverified_place');
  return ANOMALY_TYPES.filter((t) => out.has(t));
}

export type AnomalyItem = { employeeId: string; workDate: string; types: AnomalyType[] };
/** 정책을 걸어 보이는 것만 남기고, 직원마다 막는 건수 · 확인할 건수를 센다 */
export function summarizeAnomalies(items: readonly AnomalyItem[], policy: AnomalyPolicy): { shown: (AnomalyItem & { block: boolean })[]; byEmployee: Map<string, { block: number; check: number }>; byType: Record<AnomalyType, number> } {
  const shown: (AnomalyItem & { block: boolean })[] = [];
  const byEmployee = new Map<string, { block: number; check: number }>();
  const byType = Object.fromEntries(ANOMALY_TYPES.map((t) => [t, 0])) as Record<AnomalyType, number>;
  for (const it of items) {
    for (const t of it.types) byType[t]++; // 유형별 건수는 꺼 둔 유형도 센다 — 끄기 전에 몇 건인지 보이게
    const types = it.types.filter((t) => policy[t] !== 'off');
    if (types.length === 0) continue;
    const block = types.some((t) => policy[t] === 'block');
    shown.push({ ...it, types, block });
    const e = byEmployee.get(it.employeeId) ?? { block: 0, check: 0 };
    if (block) e.block++;
    else e.check++;
    byEmployee.set(it.employeeId, e);
  }
  return { shown, byEmployee, byType };
}
