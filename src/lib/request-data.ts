// 요청 통합 읽기 — 네 표(정정 · 연장근로 · 휴가 · 외근)를 한 목록으로. 서버 전용.
import 'server-only';
import { OFFICE } from '@/config/office';
import { fromCorrection, fromLeave, fromLeaveChange, fromOvertime, fromPunchRequest, fromShiftRequest, fromWork, type ReqItem } from '@/lib/requests';
import { createAdminClient } from '@/lib/supabase/admin';

export const REQUEST_WINDOW_DAYS = 62; // 완료 목록은 최근 두 달

/** 대기 중인 것 전부 + 최근 두 달 안에 낸 것. employeeId를 주면 그 사람 것만 */
export async function loadRequests(opts: { employeeId?: string; practice?: boolean } = {}): Promise<ReqItem[]> {
  const db = createAdminClient();
  const practice = opts.practice ?? OFFICE.practiceMode;
  const since = new Date(Date.now() - REQUEST_WINDOW_DAYS * 86_400_000).toISOString();
  const read = async (table: string, cols: string) => {
    let q = db.from(table).select(cols).eq('is_test', practice).or(`status.eq.pending,created_at.gte.${since}`).order('created_at', { ascending: false }).limit(1000);
    if (opts.employeeId) q = q.eq('employee_id', opts.employeeId);
    const { data, error } = await q;
    if (error) throw new Error(`loadRequests.${table}: ${error.code}`);
    return (data ?? []) as unknown as Record<string, unknown>[];
  };
  const [co, ot, lv, wk, pr, sh, lc] = await Promise.all([
    read('punch_corrections', 'id, employee_id, work_date, correction_type, target_id, kind, new_punched_at, status, reason, approved_by, created_at, decided_at'),
    read('overtime_requests', 'id, employee_id, work_date, overtime_minutes, holiday_minutes, status, reason, approved_by, created_at, decided_at'),
    read('leave_requests', 'id, employee_id, type_code, start_date, end_date, days, start_time, end_time, status, reason, approved_by, created_at, decided_at'),
    read('work_requests', 'id, employee_id, kind, start_date, end_date, start_time, end_time, place, status, reason, approved_by, created_at, decided_at'),
    read('punch_requests', 'id, employee_id, kind, requested_at, work_date, nearest_m, geo_reason, status, approved_by, created_at, decided_at'),
    read('shift_requests', 'id, employee_id, work_date, start_time, end_time, kind, reason, status, approved_by, created_at, decided_at'),
    read('leave_change_requests', 'id, employee_id, kind, reason, status, approved_by, created_at, decided_at, leave_requests(type_code, start_date, end_date, days, start_time, end_time)'),
  ]);
  // 시각 수정·무효 요청이 가리키는 원래 기록의 시각 (목록에서 「11:05 → 07:03」처럼 보이게)
  const targets = [...new Set(co.map((c) => c.target_id).filter((x): x is string => typeof x === 'string'))];
  if (targets.length) {
    const { data: evs } = await db.from('punch_events').select('id, punched_at').in('id', targets);
    const at = new Map((evs ?? []).map((e) => [e.id as string, e.punched_at as string]));
    for (const c of co) if (typeof c.target_id === 'string') c.old_punched_at = at.get(c.target_id) ?? null;
  }
  return [...pr.map(fromPunchRequest), ...sh.map(fromShiftRequest), ...lc.map(fromLeaveChange), ...co.map(fromCorrection), ...ot.map(fromOvertime), ...lv.map(fromLeave), ...wk.map(fromWork)];
}
