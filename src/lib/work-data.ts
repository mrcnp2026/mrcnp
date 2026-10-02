// 외근 신청 읽기. 서버 전용. 쓰기는 API 라우트가 service_role로만 (4-11).
import 'server-only';
import { OFFICE } from '@/config/office';
import { createAdminClient } from '@/lib/supabase/admin';
import type { WorkRequest } from '@/lib/work-requests';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase 행 모양 그대로
const toWork = (r: any): WorkRequest => ({
  id: r.id, employeeId: r.employee_id, kind: r.kind, startDate: r.start_date, endDate: r.end_date,
  startTime: r.start_time ? String(r.start_time).slice(0, 5) : null, endTime: r.end_time ? String(r.end_time).slice(0, 5) : null,
  place: r.place, reason: r.reason, status: r.status, createdAt: r.created_at, decidedAt: r.decided_at, approvedBy: r.approved_by,
});

/** 기간과 겹치는 외근 신청. employeeId를 주면 그 직원 것만 */
export async function loadWorkRequests(opts: { from?: string; to?: string; employeeId?: string; practice?: boolean } = {}): Promise<WorkRequest[]> {
  let q = createAdminClient().from('work_requests').select('*').eq('is_test', opts.practice ?? OFFICE.practiceMode);
  if (opts.employeeId) q = q.eq('employee_id', opts.employeeId);
  if (opts.from) q = q.gte('end_date', opts.from);
  if (opts.to) q = q.lte('start_date', opts.to);
  const { data } = await q.order('start_date', { ascending: false });
  return (data ?? []).map(toWork);
}
