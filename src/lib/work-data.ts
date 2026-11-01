// 외근 신청 읽기. 서버 전용. 쓰기는 API 라우트가 service_role로만 (4-11).
import 'server-only';
import { readAll } from '@/lib/read-all';
import { OFFICE } from '@/config/office';
import { viewerScope, within } from '@/lib/scope';
import { createAdminClient } from '@/lib/supabase/admin';
import type { WorkRequest } from '@/lib/work-requests';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase 행 모양 그대로
const toWork = (r: any): WorkRequest => ({
  id: r.id, employeeId: r.employee_id, kind: r.kind, startDate: r.start_date, endDate: r.end_date,
  startTime: r.start_time ? String(r.start_time).slice(0, 5) : null, endTime: r.end_time ? String(r.end_time).slice(0, 5) : null,
  place: r.place, reason: r.reason, status: r.status, createdAt: r.created_at, decidedAt: r.decided_at, approvedBy: r.approved_by,
  lat: typeof r.lat === 'number' ? r.lat : null, lng: typeof r.lng === 'number' ? r.lng : null,
});

/** 기간과 겹치는 외근 신청. employeeId를 주면 그 직원 것만 */
export async function loadWorkRequests(opts: { from?: string; to?: string; employeeId?: string; practice?: boolean } = {}): Promise<WorkRequest[]> {
  // 쪽마다 조회를 새로 만든다 (하나를 고쳐 쓰면 여러 쪽을 동시에 물을 때 첫 쪽 500줄만 받는다 — 2026-11-01)
  const q = () => {
    let b = createAdminClient().from('work_requests').select('*').eq('is_test', opts.practice ?? OFFICE.practiceMode);
    if (opts.employeeId) b = b.eq('employee_id', opts.employeeId);
    if (opts.from) b = b.gte('end_date', opts.from);
    if (opts.to) b = b.lte('start_date', opts.to);
    return b;
  };
  const { data } = await readAll((a,b) => q().order('start_date', { ascending: false }).order('id').range(a,b));
  return within((data ?? []).map(toWork), await viewerScope(), (w) => w.employeeId); // 지점관리자면 맡은 지점 직원 것만
}
