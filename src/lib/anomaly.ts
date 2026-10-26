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

// ── 화면에서 보는 묶음 (2026-10-23 의뢰인: 항목 10가지가 과하다 → 5가지로). 저장하는 기준은 그대로 유형별이고, 묶음 하나를 고르면 안의 유형이 함께 바뀐다.
export const ANOMALY_GROUPS = [
  { key: 'g_missing', types: ['missing_in', 'missing_out'] },
  { key: 'g_record', types: ['orphan_out', 'overlap', 'duplicate'] },
  { key: 'g_plan', types: ['no_plan_work', 'leave_day_punch'] },
  { key: 'g_late', types: ['late', 'early'] },
  { key: 'g_place', types: ['unverified_place'] },
] as const satisfies readonly { key: string; types: readonly AnomalyType[] }[];
export type AnomalyGroup = (typeof ANOMALY_GROUPS)[number]['key'];
export const isAnomalyGroup = (v: unknown): v is AnomalyGroup => ANOMALY_GROUPS.some((g) => g.key === v);
export const groupOfType = (t: AnomalyType): AnomalyGroup => ANOMALY_GROUPS.find((g) => (g.types as readonly string[]).includes(t))!.key;
const RANK: Record<AnomalyLevel, number> = { off: 0, check: 1, block: 2 };
/** 묶음의 기준 = 안의 유형 중 가장 엄한 것 */
export function groupLevel(policy: AnomalyPolicy, key: AnomalyGroup): AnomalyLevel {
  const g = ANOMALY_GROUPS.find((x) => x.key === key)!;
  return g.types.reduce<AnomalyLevel>((a, t) => (RANK[policy[t]] > RANK[a] ? policy[t] : a), 'off');
}
/** 묶음 기준을 안의 유형에 적용한다. 출퇴근 누락을 「마감 차단」으로 하면 퇴근 누락만 막고 출근 누락(결근일 수 있다)은 확인만 한다 */
export function applyGroupLevel(policy: AnomalyPolicy, key: AnomalyGroup, level: AnomalyLevel): AnomalyPolicy {
  const out = { ...policy };
  for (const t of ANOMALY_GROUPS.find((x) => x.key === key)!.types) out[t] = key === 'g_missing' && t === 'missing_in' && level === 'block' ? 'check' : level;
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
export const anomalyKey = (employeeId: string, workDate: string) => `${employeeId}|${workDate}`;
/**
 * 정책을 걸어 보이는 것만 남기고, 직원마다 막는 건수 · 확인할 건수를 센다.
 * reviewed: 담당자가 「확인함」으로 표시한 날(직원|날짜). 확인만 하는 날은 확인하면 「확인할 건수」에서 빠진다. 마감을 막는 날은 확인 표시로 풀리지 않는다 — 기록을 고쳐야 한다.
 */
export function summarizeAnomalies(items: readonly AnomalyItem[], policy: AnomalyPolicy, reviewed?: ReadonlySet<string>): { shown: (AnomalyItem & { block: boolean; reviewed: boolean })[]; byEmployee: Map<string, { block: number; check: number }>; byType: Record<AnomalyType, number> } {
  const shown: (AnomalyItem & { block: boolean; reviewed: boolean })[] = [];
  const byEmployee = new Map<string, { block: number; check: number }>();
  const byType = Object.fromEntries(ANOMALY_TYPES.map((t) => [t, 0])) as Record<AnomalyType, number>;
  for (const it of items) {
    for (const t of it.types) byType[t]++; // 유형별 건수는 꺼 둔 유형도 센다 — 끄기 전에 몇 건인지 보이게
    const types = it.types.filter((t) => policy[t] !== 'off');
    if (types.length === 0) continue;
    const block = types.some((t) => policy[t] === 'block');
    const done = !!reviewed?.has(anomalyKey(it.employeeId, it.workDate));
    shown.push({ ...it, types, block, reviewed: done });
    const e = byEmployee.get(it.employeeId) ?? { block: 0, check: 0 };
    if (block) e.block++;
    else if (!done) e.check++;
    byEmployee.set(it.employeeId, e);
  }
  return { shown, byEmployee, byType };
}

// ── 담당자 · 처리 기한 · 기한 지남 (2026-10-19 의뢰인, 「아직 안 만든 기능」 #40) ──
// 기본: 그 직원의 요청을 승인하는 관리자(요청 알림을 받는 사람과 같다)가 담당, 기한은 이상이 생긴 날 + dueDays일.
// 한 건만 바꾸려면 담당 · 기한을 따로 적는다(DB 0061, 묶음 27). 처리 = 「확인만」 유형은 확인함 표시, 「마감 차단」 유형은 기록을 고쳐 이상이 사라지는 것.
// startsOn보다 앞선 날의 이상(시프티에서 옮긴 옛 기록 등)에는 기한을 매기지 않는다 — 기능을 켠 날 옛 기록이 한꺼번에 「기한 지남」이 되지 않게.
export const ANOMALY_TASK_START = '2026-10-20';
export type AnomalyTaskPolicy = { enabled: boolean; assignee: 'approvers' | string; dueDays: number; startsOn: string };
export const DEFAULT_TASK_POLICY: AnomalyTaskPolicy = { enabled: true, assignee: 'approvers', dueDays: 3, startsOn: ANOMALY_TASK_START };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateTaskPolicy(v: unknown): AnomalyTaskPolicy | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.enabled !== 'boolean') return null;
  if (o.assignee !== 'approvers' && !(typeof o.assignee === 'string' && UUID_RE.test(o.assignee))) return null;
  if (typeof o.dueDays !== 'number' || !Number.isInteger(o.dueDays) || o.dueDays < 0 || o.dueDays > 31) return null;
  const startsOn = o.startsOn === undefined ? ANOMALY_TASK_START : o.startsOn;
  if (typeof startsOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(startsOn)) return null;
  return { enabled: o.enabled, assignee: o.assignee as AnomalyTaskPolicy['assignee'], dueDays: o.dueDays, startsOn };
}
export const taskPolicyOf = (v: unknown): AnomalyTaskPolicy => validateTaskPolicy(v) ?? DEFAULT_TASK_POLICY;

export type AnomalyOverride = { assigneeId: string | null; dueOn: string | null; note: string | null; setBy: string; setAt: string };
export type AnomalyTask = { assignees: string[]; due: string | null; overdueDays: number; custom: boolean; note: string | null };

const plusDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/**
 * 한 건의 담당 · 기한. open = 아직 처리하지 않음(마감 차단이거나 확인함 표시가 없음). 처리한 건은 기한이 지나도 0일.
 * approvers: 그 직원의 요청을 승인하는 사람들(기본 담당일 때).
 */
export function taskOf(args: { workDate: string; open: boolean; today: string; policy: AnomalyTaskPolicy; override?: AnomalyOverride; approvers: string[] }): AnomalyTask {
  const { policy: p, override: o } = args;
  const tracked = p.enabled && args.workDate >= p.startsOn;
  const assignees = o?.assigneeId ? [o.assigneeId] : p.assignee === 'approvers' ? args.approvers : [p.assignee];
  const due = o?.dueOn ?? (tracked ? plusDays(args.workDate, p.dueDays) : null);
  const late = due && args.open && (tracked || !!o?.dueOn) ? Math.max(0, daysBetween(due, args.today)) : 0;
  return { assignees, due, overdueDays: late, custom: !!(o?.assigneeId || o?.dueOn), note: o?.note ?? null };
}
