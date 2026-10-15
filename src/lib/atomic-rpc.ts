// 여러 표의 변경을 한 트랜잭션으로 처리하는 서버 전용 RPC. 미적용 환경에서 분할 쓰기로 되돌아가지 않는다.
import 'server-only';
import { ApiError } from '@/lib/api';
import { createAdminClient } from '@/lib/supabase/admin';

type AtomicFunction = 'append_payroll_version_atomic' | 'request_staff_role_atomic' | 'decide_staff_role_atomic' | 'replace_payroll_override_atomic' | 'decide_leave_atomic' | 'decide_leave_change_atomic';
const forbidden = new Set(['forbidden','rank','owner_only','self_change','self_decision','payroll_only_grant','payroll_forbidden','out_of_scope']);
const invalid = new Set(['invalid_input','invalid_decision','reason_required','payroll_effective_from_past','payroll_reason_required','payroll_needs_admin']);
const conflict = new Set(['already','employee_inactive','min_admins','min_payroll','request_pending','payroll_version_conflict','payroll_finalized','payroll_wrong_status','day_confirmed','period_locked','duplicate_request']);
/**
 * DB 규칙(트리거)이 막은 쓰기를 사용자에게 보일 오류로 바꾼다 — 확정한 날 · 마감 기간 · 겹친 휴가 등 (DB 변경 묶음 12).
 * 해당하지 않으면 아무것도 하지 않는다(부르는 쪽이 원래대로 처리).
 */
export function rethrowDbRule(error: { code?: string; message?: string } | null | undefined): void {
  if (!error) return;
  if (error.code === 'AC001') throw new ApiError(409, 'period_locked'); // 마감된 기간의 원장 줄
  if (error.code !== 'P0001' || !error.message) return;
  const code = error.message;
  if (forbidden.has(code)) throw new ApiError(403, code);
  if (invalid.has(code)) throw new ApiError(422, code);
  if (conflict.has(code)) throw new ApiError(409, code);
}

export async function atomicRpc<T>(name: AtomicFunction, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await createAdminClient().rpc(name, args);
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') throw new ApiError(503, 'db_update_required');
    if (error.code === 'AC001') throw new ApiError(409, 'period_locked');
    if (error.code === 'P0001') {
      const code = error.message;
      if (forbidden.has(code)) throw new ApiError(403, code);
      if (invalid.has(code)) throw new ApiError(422, code);
      if (conflict.has(code)) throw new ApiError(409, code);
      if (code === 'not_found') throw new ApiError(404, code);
    }
    if (error.code === '23P01' || error.code === '23505') throw new ApiError(409, name === 'request_staff_role_atomic' ? 'request_pending' : 'payroll_version_conflict');
    throw new Error(`${name}: ${error.code}`);
  }
  if (data === null) throw new Error(`${name}: empty_result`);
  return data as T;
}
