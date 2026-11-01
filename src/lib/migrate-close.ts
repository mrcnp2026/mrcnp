// 이관 정리 (개발-63) — 기준일 이전 지난 연장 요청을 읽고, 고른 대로 결정한다. 서버 전용. 판단은 migrate-close-rules.ts.
// 결정은 평소와 같은 DB 함수(decide_overtime)로 — 결정 기록(decision_log)에 사유와 함께 덧붙는다. 직원 폰 알림은 보내지 않는다(1월 연장 결과가 한꺼번에 가지 않게).
import 'server-only';
import { OFFICE } from '@/config/office';
import { hiddenTestIds } from '@/lib/period-data';
import { readAll } from '@/lib/read-all';
import { createAdminClient } from '@/lib/supabase/admin';
import { isMigrateTarget, planMigrate, type MigrateAction, type MigrateRow, type MigrateSkip } from '@/lib/migrate-close-rules';

export type MigrateLine = MigrateRow & {
  employeeId: string; name: string; employeeNo: string;
  overtimeMinutes: number; nightMinutes: number; holidayMinutes: number;
  recomputedMinutes: number | null; // 다시 계산한 연장 + 휴일 (재확인 건만)
};

const COLS = 'id, employee_id, work_date, status, needs_review, overtime_minutes, night_minutes, holiday_minutes, approved_minutes, approved_night_minutes, approved_holiday_minutes, recomputed_overtime_minutes, recomputed_holiday_minutes';

async function readTargets(practice: boolean, cutoff: string): Promise<MigrateLine[]> {
  const db = createAdminClient();
  const [{ data }, hide, { data: people }] = await Promise.all([
    readAll((a, b) => db.from('overtime_requests').select(COLS).eq('is_test', practice).lte('work_date', cutoff).or('status.eq.pending,needs_review.eq.true').order('work_date').order('id').range(a, b)),
    hiddenTestIds(),
    readAll((a, b) => db.from('profiles').select('id, name, employee_no').order('id').range(a, b)),
  ]);
  const skip = new Set(hide);
  const who = new Map((people ?? []).map((p) => [p.id as string, p]));
  return (data ?? [])
    .filter((r) => !skip.has(r.employee_id as string))
    .map((r) => ({
      id: r.id as string, employeeId: r.employee_id as string, workDate: r.work_date as string,
      name: (who.get(r.employee_id as string)?.name as string) ?? '—', employeeNo: (who.get(r.employee_id as string)?.employee_no as string) ?? '',
      status: r.status as MigrateRow['status'], needsReview: r.needs_review === true,
      overtimeMinutes: Number(r.overtime_minutes ?? 0), nightMinutes: Number(r.night_minutes ?? 0), holidayMinutes: Number(r.holiday_minutes ?? 0),
      approvedMinutes: r.approved_minutes as number | null, approvedNightMinutes: r.approved_night_minutes as number | null, approvedHolidayMinutes: r.approved_holiday_minutes as number | null,
      recomputedMinutes: r.recomputed_overtime_minutes === null && r.recomputed_holiday_minutes === null ? null : Number(r.recomputed_overtime_minutes ?? 0) + Number(r.recomputed_holiday_minutes ?? 0),
    }))
    .filter((r) => isMigrateTarget(r, cutoff));
}

/** 마감된 기간(되열지 않은 것) 안의 날짜인가 — 이 날짜는 DB가 결정을 막으므로 화면에서 미리 알린다 */
async function closedDays(practice: boolean, rows: MigrateLine[]): Promise<Set<string>> {
  if (!rows.length) return new Set();
  const { data } = await createAdminClient().from('attendance_closes').select('employee_id, period_from, period_to').eq('state', 'CLOSED').eq('is_test', practice);
  const spans = data ?? [];
  return new Set(rows.filter((r) => spans.some((c) => c.employee_id === r.employeeId && c.period_from <= r.workDate && r.workDate < c.period_to)).map((r) => r.id));
}

export async function loadMigrate(practice = OFFICE.practiceMode, cutoff = OFFICE.migrationCutoff) {
  const rows = await readTargets(practice, cutoff);
  const closed = await closedDays(practice, rows);
  return { cutoff, rows: rows.map((r) => ({ ...r, closed: closed.has(r.id) })) };
}

export type MigrateResult = { ok: number; already: number; closed: number; failed: number; skipped: MigrateSkip[] };

export async function runMigrate(args: { picks: { id: string; action: MigrateAction }[]; actorId: string; requestId: string; reason: string; practice?: boolean; cutoff?: string }): Promise<MigrateResult> {
  const practice = args.practice ?? OFFICE.practiceMode;
  const cutoff = args.cutoff ?? OFFICE.migrationCutoff;
  const rows = await readTargets(practice, cutoff); // 지금 DB 기준으로 다시 확인한다(화면이 오래됐을 수 있다)
  const { ops, skipped } = planMigrate(rows, args.picks, cutoff);
  const db = createAdminClient();
  const out: MigrateResult = { ok: 0, already: 0, closed: 0, failed: 0, skipped };
  for (const op of ops) {
    const { data, error } = await db.rpc('decide_overtime', {
      p_id: op.id, p_decision: op.decision,
      p_approved_minutes: op.approvedMinutes, p_approved_night: op.approvedNightMinutes, p_approved_holiday: op.approvedHolidayMinutes,
      p_decided_by: args.actorId, p_reason: args.reason, p_request_id: args.requestId,
    });
    if (error) {
      if (error.code === 'AC001') out.closed++; // 마감된 달 — 마감을 다시 열어야 한다
      else out.failed++;
    } else if (data === 'ok') out.ok++;
    else out.already++;
  }
  return out;
}
