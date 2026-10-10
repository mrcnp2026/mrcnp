// 기록 확정 읽기·막기 (의뢰인 2026-10-11 확정: 확정한 기록만 급여 계산에 쓰고, 확정 뒤에는 정정 요청을 막는다). 서버 전용.
// 확정 단위는 「한 직원의 하루」다. 켜진 줄(active)이 있으면 확정된 날이다 — 풀면 active=false로 남는다 (지우지 않는다).
import 'server-only';
import { OFFICE } from '@/config/office';
import { ApiError } from '@/lib/api';
import { createAdminClient } from '@/lib/supabase/admin';

export type DayConfirm = { id: string; employeeId: string; workDate: string; confirmedBy: string; confirmedAt: string };
export const confirmKey = (employeeId: string, workDate: string) => `${employeeId}|${workDate}`;

/** 기간 안의 확정된 날 — 열쇠는 confirmKey(직원, 날짜) */
export async function loadConfirms(from: string, to: string, practice = OFFICE.practiceMode): Promise<Map<string, DayConfirm>> {
  const { data, error } = await createAdminClient()
    .from('day_confirms')
    .select('id, employee_id, work_date, confirmed_by, confirmed_at')
    .eq('active', true)
    .eq('is_test', practice)
    .gte('work_date', from)
    .lte('work_date', to);
  if (error) throw new Error(`loadConfirms: ${error.code}`);
  return new Map((data ?? []).map((r) => [confirmKey(r.employee_id, r.work_date), { id: r.id, employeeId: r.employee_id, workDate: r.work_date, confirmedBy: r.confirmed_by, confirmedAt: r.confirmed_at }]));
}

/** 확정된 날이면 막는다 (정정 요청 · 대리 입력 · 정정 승인 · 정정 취소) — 고치려면 관리자가 먼저 확정을 푼다 */
export async function assertNotConfirmed(employeeId: string, workDate: string, practice = OFFICE.practiceMode): Promise<void> {
  const { data, error } = await createAdminClient().from('day_confirms').select('id').eq('employee_id', employeeId).eq('work_date', workDate).eq('is_test', practice).eq('active', true).limit(1);
  if (error) throw new Error(`assertNotConfirmed: ${error.code}`);
  if (data?.length) throw new ApiError(409, 'day_confirmed');
}
