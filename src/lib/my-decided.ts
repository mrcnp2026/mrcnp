// 직원 본인 요청 중 처리된 것(승인 · 거절) — 「요청」 메뉴의 숫자 (2026-10-19 의뢰인: 요청한 것이 처리되면 메뉴에 알림).
// 「요청」 화면을 마지막으로 연 뒤에 처리된 것만 센다. 연 시각은 이 기기의 쿠키(req_seen)에 둔다 — 처음이면 최근 3일. 서버 전용.
import 'server-only';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { OFFICE } from '@/config/office';
import { createAdminClient } from '@/lib/supabase/admin';

export const SEEN_COOKIE = 'req_seen';

export const myDecidedCount = cache(async (employeeId: string): Promise<number> => {
  const raw = (await cookies()).get(SEEN_COOKIE)?.value;
  const floor = new Date(Date.now() - 3 * 86_400_000).toISOString(); // 처음 보는 기기 · 오래 안 연 경우에도 최근 3일 것만
  const seen = raw && !Number.isNaN(Date.parse(raw)) ? new Date(raw).toISOString() : floor;
  const since = seen > floor ? seen : floor;
  const db = createAdminClient();
  // 직원이 낸 요청만 — 관리자가 대신 넣은 정정 · 직권 휴가(requested_by가 본인이 아님), 옮겨 온 휴가, 바로 반영된 일정 요청(본인이 승인자)은 세지 않는다
  const n = (table: string, extra?: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => {
    const q = base(table);
    return (extra ? extra(q) : q).then((r) => r.count ?? 0);
  };
  const base = (table: string) =>
    db.from(table).select('id', { count: 'exact', head: true }).eq('employee_id', employeeId).eq('is_test', OFFICE.practiceMode).in('status', ['approved', 'rejected']).gt('decided_at', since).or(`approved_by.is.null,approved_by.neq.${employeeId}`);
  const counts = await Promise.all([
    n('punch_corrections', (q) => q.eq('requested_by', employeeId)),
    n('leave_requests', (q) => q.eq('requested_by', employeeId).neq('source', 'import')),
    n('work_requests', (q) => q.eq('requested_by', employeeId)),
    n('punch_requests'),
    n('shift_requests'),
    n('leave_change_requests'),
  ]);
  return counts.reduce((a, b) => a + b, 0);
});
