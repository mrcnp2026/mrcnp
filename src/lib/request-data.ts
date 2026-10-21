// 요청 통합 읽기 — 네 표(정정 · 연장근로 · 휴가 · 외근)를 한 목록으로. 서버 전용.
import 'server-only';
import { readAll } from '@/lib/read-all';
import { OFFICE } from '@/config/office';
import { fromCorrection, fromLeave, fromLeaveChange, fromOvertime, fromPunchRequest, fromShiftRequest, fromWork, type ReqItem } from '@/lib/requests';
import { viewerScope, within } from '@/lib/scope';
import { loadRejectReasons } from '@/lib/reject-reason';
import { createAdminClient } from '@/lib/supabase/admin';

export const REQUEST_WINDOW_DAYS = 62; // 완료 목록은 최근 두 달

/** 대기 중인 것 전부 + 최근 두 달 안에 낸 것. employeeId를 주면 그 사람 것만 */
export async function loadRequests(opts: { employeeId?: string; practice?: boolean } = {}): Promise<ReqItem[]> {
  const db = createAdminClient();
  const practice = opts.practice ?? OFFICE.practiceMode;
  const since = new Date(Date.now() - REQUEST_WINDOW_DAYS * 86_400_000).toISOString();
  const read = async (table: string, cols: string) => {
    let q = db.from(table).select(cols).eq('is_test', practice).or(`status.eq.pending,created_at.gte.${since}`).order('created_at', { ascending: false });
    if (opts.employeeId) q = q.eq('employee_id', opts.employeeId);
    const { data } = await readAll((a,b) => q.order('id').range(a,b));
    return (data ?? []) as unknown as Record<string, unknown>[];
  };
  const [co, ot, lv, wk, pr, sh, lc] = await Promise.all([
    read('punch_corrections', 'id, employee_id, work_date, correction_type, target_id, kind, new_punched_at, status, reason, requested_by, approved_by, created_at, decided_at'),
    read('overtime_requests', 'id, employee_id, work_date, overtime_minutes, holiday_minutes, status, reason, approved_by, created_at, decided_at, needs_review'),
    read('leave_requests', 'id, employee_id, type_code, start_date, end_date, days, start_time, end_time, status, reason, approved_by, created_at, decided_at, source'),
    read('work_requests', 'id, employee_id, kind, start_date, end_date, start_time, end_time, place, status, reason, approved_by, created_at, decided_at'),
    read('punch_requests', 'id, employee_id, kind, requested_at, work_date, nearest_m, geo_reason, status, approved_by, created_at, decided_at'),
    read('shift_requests', 'id, employee_id, work_date, start_time, end_time, kind, reason, status, approved_by, created_at, decided_at'),
    read('leave_change_requests', 'id, employee_id, kind, reason, status, approved_by, created_at, decided_at, leave_requests(type_code, start_date, end_date, days, start_time, end_time)'),
  ]);
  // 시각 수정·무효 요청이 가리키는 원래 기록의 시각 (목록에서 「11:05 → 07:03」처럼 보이게)
  const targets = [...new Set(co.map((c) => c.target_id).filter((x): x is string => typeof x === 'string'))];
  if (targets.length) {
    const { data: evs } = await readAll((a,b) => db.from('punch_events').select('id, punched_at').in('id', targets).order('id').range(a,b));
    const at = new Map((evs ?? []).map((e) => [e.id as string, e.punched_at as string]));
    for (const c of co) if (typeof c.target_id === 'string') c.old_punched_at = at.get(c.target_id) ?? null;
  }
  // 시프티에서 옮긴 기록은 요청 목록에 넣지 않는다 (2026-10-17 의뢰인: 「옮긴 기록은 빼고 보여줘」).
  // 옮긴 휴가(source 'import'), 옮긴 출퇴근으로 생긴 연장, 옮긴 날의 빠진 퇴근을 관리자가 채운 정정 — 직원이 앱에서 낸 요청이 아니다.
  // 대기 중인 것은 처리해야 하므로 그대로 보인다.
  const settled = (r: Record<string, unknown>) => r.status !== 'pending';
  const checkDays = [...ot.filter(settled), ...co.filter((c) => settled(c) && c.requested_by !== c.employee_id)];
  const importedDays = new Set<string>();
  if (checkDays.length) {
    const dates = checkDays.map((r) => r.work_date as string).sort();
    let q = db.from('punch_events').select('employee_id, work_date').eq('source', 'import').gte('work_date', dates[0]).lte('work_date', dates[dates.length - 1]);
    if (opts.employeeId) q = q.eq('employee_id', opts.employeeId);
    const { data: imp } = await readAll((a, b) => q.order('id').range(a, b));
    for (const e of imp) importedDays.add(`${e.employee_id}|${e.work_date}`);
  }
  const fromImport = (r: Record<string, unknown>) => importedDays.has(`${r.employee_id}|${r.work_date}`);
  const otShown = ot.filter((o) => !(settled(o) && fromImport(o)));
  const coShown = co.filter((c) => !(settled(c) && c.requested_by !== c.employee_id && fromImport(c)));
  const lvShown = lv.filter((l) => l.source !== 'import');
  const all = [...pr.map(fromPunchRequest), ...sh.map(fromShiftRequest), ...lc.map(fromLeaveChange), ...coShown.map(fromCorrection), ...otShown.map(fromOvertime), ...lvShown.map(fromLeave), ...wk.map(fromWork)];
  // 거절 사유 (2026-10-21 의뢰인) — 거절된 것만 결정 기록에서 읽는다
  const TABLE: Record<ReqItem['kind'], string> = { correction: 'punch_corrections', overtime: 'overtime_requests', leave: 'leave_requests', work: 'work_requests', punch: 'punch_requests', shift: 'shift_requests', leaveDelete: 'leave_change_requests' };
  const rejected = all.filter((r) => r.status === 'rejected');
  const why = await loadRejectReasons(rejected.map((r) => ({ table: TABLE[r.kind], id: r.id })));
  for (const r of rejected) r.rejectReason = why.get(`${TABLE[r.kind]}:${r.id}`) ?? null;
  return within(all, await viewerScope(), (r) => r.employeeId); // 지점관리자면 맡은 지점 직원 것만
}
