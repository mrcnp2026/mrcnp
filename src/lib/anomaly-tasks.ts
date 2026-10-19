// 이상 기록의 담당자 · 처리 기한 · 기한 지남 알림 (2026-10-19 의뢰인, 「아직 안 만든 기능」 #40). 서버 전용. 규칙은 lib/anomaly.ts taskOf.
// 기본값(담당 · 기한 일수 · 켜기)은 회사 정책 판(payroll_policy_versions, 종류 attendance.anomaly_task) — DB 변경 없이 동작한다.
// 한 건만 바꾼 담당 · 기한은 attendance_anomaly_assignments(DB 0061, 묶음 27) — 표가 없으면 바꾸기만 막히고 나머지는 기본값으로 동작한다.
import 'server-only';
import { OFFICE } from '@/config/office';
import { ApiError } from '@/lib/api';
import type { Me } from '@/lib/auth';
import { addDays } from '@/lib/calendar';
import { anomalyKey, DEFAULT_TASK_POLICY, summarizeAnomalies, taskOf, taskPolicyOf, type AnomalyOverride, type AnomalyTask, type AnomalyTaskPolicy } from '@/lib/anomaly';
import { collectAnomalies, loadAnomalyPolicy, loadAnomalyReviews } from '@/lib/anomaly-data';
import { loadPolicies, savePolicy } from '@/lib/payroll/data';
import { loadPeriod } from '@/lib/period-data';
import { firstTime, pushConfigured, sendPush } from '@/lib/push';
import { approverIdsFor } from '@/lib/scope';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';

const KIND = 'attendance.anomaly_task';
const db = () => createAdminClient();
const missingTable = (code?: string) => code === '42P01' || code === 'PGRST205' || code === 'PGRST204';

export async function loadTaskPolicy(): Promise<{ policy: AnomalyTaskPolicy; version: number; saved: boolean }> {
  const row = (await loadPolicies(KIND)).find((p) => p.kind === KIND);
  return row ? { policy: taskPolicyOf(row.payload), version: row.version, saved: true } : { policy: DEFAULT_TASK_POLICY, version: 0, saved: false };
}

export async function saveTaskPolicy(policy: AnomalyTaskPolicy, expectedVersion: number, me: Me): Promise<void> {
  const row = (await loadPolicies(KIND)).find((p) => p.kind === KIND);
  const today = toKstDate(new Date());
  const validFrom = row && row.validFrom >= today ? addDays(row.validFrom, 1) : today;
  await savePolicy({ kind: KIND, payload: policy, validFrom, reason: row ? 'anomaly task policy' : null, expectedVersion, me });
}

/** 기간 안에서 한 건만 바꾼 담당 · 기한 (직원|날짜 → 마지막 기록). 표가 없으면 null */
export async function loadOverrides(from: string, to: string, practice: boolean): Promise<Map<string, AnomalyOverride> | null> {
  const { data, error } = await db().from('attendance_anomaly_assignments').select('id, employee_id, work_date, assignee_id, due_on, note, set_by, set_at').eq('is_test', practice).gte('work_date', from).lte('work_date', to).order('id');
  if (missingTable(error?.code)) return null;
  if (error) throw new Error(`loadOverrides: ${error.code}`);
  const out = new Map<string, AnomalyOverride>();
  for (const r of data ?? []) out.set(anomalyKey(r.employee_id as string, r.work_date as string), { assigneeId: (r.assignee_id as string | null) ?? null, dueOn: (r.due_on as string | null) ?? null, note: (r.note as string | null) ?? null, setBy: r.set_by as string, setAt: r.set_at as string }); // 뒤의 줄이 앞의 것을 덮는다
  return out;
}

/** 이 건만 담당 · 기한 바꾸기. 둘 다 비우면 기본값으로 돌아간다(그것도 한 줄로 남는다) */
export async function setOverride(args: { employeeId: string; workDate: string; practice: boolean; assigneeId: string | null; dueOn: string | null; note: string | null; me: Me }): Promise<void> {
  if (args.assigneeId) {
    const { data: a } = await db().from('profiles').select('role, active').eq('id', args.assigneeId).maybeSingle();
    if (!a || !a.active || (a.role !== 'admin' && a.role !== 'manager')) throw new ApiError(400, 'invalid_assignee');
  }
  const { error } = await db().from('attendance_anomaly_assignments').insert({ employee_id: args.employeeId, work_date: args.workDate, is_test: args.practice, assignee_id: args.assigneeId, due_on: args.dueOn, note: args.note, set_by: args.me.id });
  if (missingTable(error?.code)) throw new ApiError(503, 'db_update_required');
  if (error?.code === '23514') throw new ApiError(400, 'invalid_due');
  if (error) throw new Error(`setOverride: ${error.code}`);
}

/** 직원마다 기본 담당(요청 승인자) — 여러 번 부르지 않게 모아서 */
export async function approverMap(employeeIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  for (const id of new Set(employeeIds)) out.set(id, await approverIdsFor(id));
  return out;
}

/** 화면 · 알림이 같이 쓰는 한 건의 담당 · 기한 */
export function tasksFor(items: { employeeId: string; workDate: string; open: boolean }[], args: { today: string; policy: AnomalyTaskPolicy; overrides: Map<string, AnomalyOverride> | null; approvers: Map<string, string[]> }): Map<string, AnomalyTask> {
  const out = new Map<string, AnomalyTask>();
  for (const it of items) {
    const key = anomalyKey(it.employeeId, it.workDate);
    out.set(key, taskOf({ workDate: it.workDate, open: it.open, today: args.today, policy: args.policy, override: args.overrides?.get(key), approvers: args.approvers.get(it.employeeId) ?? [] }));
  }
  return out;
}

/**
 * 매일 아침 — 처리 기한이 지난 이상 기록을 담당자에게 폰으로 알린다. 같은 건(직원 · 날짜 · 기한)은 한 번만.
 * 담당자마다 한 통: 「처리 기한이 지난 이상 기록 3건」 · 「김하늘 10/21 퇴근 누락 외 2건」. 정기 작업 /api/cron/anomaly-overdue가 부른다.
 */
export async function notifyOverdueAnomalies(now = new Date()): Promise<{ overdue: number; assignees: number; sent: number }> {
  const none = { overdue: 0, assignees: 0, sent: 0 };
  if (!pushConfigured() || OFFICE.practiceMode) return none;
  const { policy } = await loadTaskPolicy();
  if (!policy.enabled) return none;
  const today = toKstDate(now);
  const from = [policy.startsOn, addDays(today, -62)].sort()[1]; // 두 달 전까지만 본다(그보다 오래된 건은 이미 알렸다)
  if (from > today) return none;
  const [data, saved, reviews, overrides] = await Promise.all([loadPeriod(from, today, false), loadAnomalyPolicy(), loadAnomalyReviews(from, today, false), loadOverrides(from, today, false)]);
  const sum = summarizeAnomalies(collectAnomalies(data, from, today, now), saved.policy, new Set(reviews.keys()));
  const open = sum.shown.filter((x) => x.block || !x.reviewed);
  const tasks = tasksFor(open.map((x) => ({ ...x, open: true })), { today, policy, overrides, approvers: await approverMap(open.map((x) => x.employeeId)) });
  const names = new Map(data.people.map((p) => [p.id, p.name]));
  const per = new Map<string, { employeeId: string; workDate: string }[]>();
  let overdue = 0;
  for (const x of open) {
    const t = tasks.get(anomalyKey(x.employeeId, x.workDate));
    if (!t || t.overdueDays <= 0) continue;
    overdue++;
    if (!(await firstTime(`anomaly-overdue:${x.employeeId}:${x.workDate}:${t.due}`))) continue;
    for (const a of t.assignees) per.set(a, [...(per.get(a) ?? []), { employeeId: x.employeeId, workDate: x.workDate }]);
  }
  let sent = 0;
  for (const [a, list] of per) {
    const first = list.sort((p, q) => p.workDate.localeCompare(q.workDate))[0];
    const head = `${names.get(first.employeeId) ?? ''} ${first.workDate.slice(5).replace('-', '/')}`;
    sent += await sendPush([a], {
      title: `처리 기한이 지난 이상 기록 ${list.length}건`,
      body: list.length > 1 ? `${head} 외 ${list.length - 1}건 — 기록을 고치거나 확인함으로 표시해 주세요` : `${head} — 기록을 고치거나 확인함으로 표시해 주세요`,
      url: `/admin/anomalies?st=overdue&m=${first.workDate.slice(0, 7)}`,
      tag: `anomaly-overdue-${today}`,
    });
  }
  return { overdue, assignees: per.size, sent };
}
