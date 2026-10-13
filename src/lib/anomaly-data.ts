// 근태 이상자 읽기 · 정책 저장 (PRD v1.3 A15). 서버 전용.
// 정책(유형마다 마감 차단 / 확인 / 끔)은 회사 정책 판(payroll_policy_versions, 종류 attendance.anomaly)에 쌓는다 — 고치면 새 판, 옛 판은 남는다.
import 'server-only';
import { OFFICE } from '@/config/office';
import { ApiError } from '@/lib/api';
import { anomalyKey, anomalyPolicyOf, dayAnomalies, DEFAULT_ANOMALY_POLICY, type AnomalyItem, type AnomalyPolicy } from '@/lib/anomaly';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Me } from '@/lib/auth';
import { addDays } from '@/lib/calendar';
import { fullLeaveSet } from '@/lib/leave';
import { missingOfDay } from '@/lib/missing-list';
import { loadPolicies, savePolicy } from '@/lib/payroll/data';
import { daysFor, leaveDaysFor, workDaysFor, type PeriodData } from '@/lib/period-data';
import { toKstDate } from '@/lib/time';

const KIND = 'attendance.anomaly';
const hhmm = (t: string) => t.slice(0, 5);

export async function loadAnomalyPolicy(): Promise<{ policy: AnomalyPolicy; version: number; saved: boolean }> {
  const row = (await loadPolicies(KIND)).find((p) => p.kind === KIND);
  return row ? { policy: anomalyPolicyOf(row.payload), version: row.version, saved: true } : { policy: DEFAULT_ANOMALY_POLICY, version: 0, saved: false };
}

/** 새 판으로 저장. 같은 날 다시 고치면 시작일을 하루 뒤로 잡는다(판의 기간이 겹치지 않게) — 지금 쓰는 값은 늘 가장 새 판이다 */
export async function saveAnomalyPolicy(policy: AnomalyPolicy, expectedVersion: number, me: Me): Promise<void> {
  const row = (await loadPolicies(KIND)).find((p) => p.kind === KIND);
  const today = toKstDate(new Date());
  const validFrom = row && row.validFrom >= today ? addDays(row.validFrom, 1) : today;
  await savePolicy({ kind: KIND, payload: policy, validFrom, reason: row ? 'anomaly policy' : null, expectedVersion, me });
}

/** 기간 안의 이상 기록 (정책을 걸기 전의 전부). 검사 전용 계정 · 입사 전 · 앞날은 뺀다 */
export function collectAnomalies(data: PeriodData, from: string, to: string, now = new Date()): AnomalyItem[] {
  const today = toKstDate(now);
  const out: AnomalyItem[] = [];
  for (const p of data.people) {
    if (p.employeeNo?.startsWith('e2e-')) continue;
    const fullLeave = fullLeaveSet(leaveDaysFor(data, p.id));
    const away = workDaysFor(data, p.id);
    const mine = data.events.filter((e) => e.employeeId === p.id);
    for (const d of daysFor(data, p.id, from, to)) {
      if (d.workDate < p.startsOn || d.workDate > today) continue;
      const plan = data.planFor(p.id, d.workDate);
      const span = plan.items.length && plan.rule ? { startTime: hhmm(plan.rule.startTime), endTime: hhmm(plan.rule.endTime), graceMin: plan.rule.lateGraceMin ?? 0 } : null;
      const excused = fullLeave.has(d.workDate) || away.has(d.workDate);
      const deemed = !!plan.deemed || !!d.deemed;
      const types = dayAnomalies({
        workDate: d.workDate, pairs: d.pairs, flags: d.flags, plan: span, deemed, excused,
        missing: missingOfDay({ workDate: d.workDate, pairs: d.pairs, plan: span, deemed, excused, now, outGraceHours: OFFICE.missingOutGraceHours, inGraceMin: OFFICE.missingInGraceMin }),
        unverified: mine.filter((e) => e.workDate === d.workDate && !e.ipVerified && !e.verifiedBy && e.source !== 'admin').length,
      });
      if (types.length) out.push({ employeeId: p.id, workDate: d.workDate, types });
    }
  }
  return out;
}

// ── 「확인함」 표시 (0038) ──
export type AnomalyReview = { id: string; by: string; at: string; note: string | null };
/** 기간 안의 확인 표시 — 열쇠는 anomalyKey(직원, 날짜) */
export async function loadAnomalyReviews(from: string, to: string, practice: boolean): Promise<Map<string, AnomalyReview>> {
  const { data, error } = await createAdminClient().from('attendance_anomaly_reviews').select('id, employee_id, work_date, note, reviewed_by, reviewed_at').eq('active', true).eq('is_test', practice).gte('work_date', from).lte('work_date', to);
  if (error) throw new Error(`loadAnomalyReviews: ${error.code}`);
  return new Map((data ?? []).map((r) => [anomalyKey(r.employee_id as string, r.work_date as string), { id: r.id as string, by: r.reviewed_by as string, at: r.reviewed_at as string, note: r.note as string | null }]));
}

/** 그 날의 이상 기록을 봤다고 표시한다. 기록을 고치는 것이 아니다 — 「확인만」 유형이 확인할 건수에서 빠질 뿐이다 */
export async function reviewAnomaly(args: { employeeId: string; workDate: string; practice: boolean; types: string[]; note: string | null; me: Me }): Promise<void> {
  const { error } = await createAdminClient().from('attendance_anomaly_reviews').insert({ employee_id: args.employeeId, work_date: args.workDate, is_test: args.practice, types: args.types, note: args.note, reviewed_by: args.me.id });
  if (error && error.code !== '23505') throw new Error(`reviewAnomaly: ${error.code}`); // 23505 = 이미 확인돼 있다
}
export async function unreviewAnomaly(args: { employeeId: string; workDate: string; practice: boolean; me: Me }): Promise<void> {
  const { data, error } = await createAdminClient().from('attendance_anomaly_reviews').update({ active: false, updated_by: args.me.id }).eq('employee_id', args.employeeId).eq('work_date', args.workDate).eq('is_test', args.practice).eq('active', true).select('id');
  if (error) throw new Error(`unreviewAnomaly: ${error.code}`);
  if (!data?.length) throw new ApiError(404, 'not_found');
}
