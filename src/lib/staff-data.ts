// 직원 관리 — DB를 건드리는 쪽. 서버 전용. 판단은 staff-rules.ts가 한다.
import 'server-only';
import { OFFICE } from '@/config/office';
import { ApiError } from '@/lib/api';
import { selfDecisionBlocked, type Staff } from '@/lib/staff-rules';
import { createAdminClient } from '@/lib/supabase/admin';

export async function loadStaff(): Promise<Staff[]> {
  const { data, error } = await createAdminClient().from('profiles').select('id, role, active, can_view_payroll');
  if (error) throw new Error(`loadStaff: ${error.code}`);
  return (data ?? []).map((p) => ({ id: p.id, role: p.role, active: p.active, canViewPayroll: p.can_view_payroll }));
}

/** 요청 결정 API가 부른다: 본인 요청인데 다른 관리자가 있으면 거절 (403 self_decision) */
export async function assertNotOwnRequest(actorId: string, employeeId: string): Promise<void> {
  if (actorId !== employeeId) return;
  if (selfDecisionBlocked(actorId, employeeId, await loadStaff())) throw new ApiError(403, 'self_decision');
}

/**
 * 변경 기록에 "무엇을·왜"를 한 줄 남긴다. 직원 정보 표(profiles)에는 사유 칸이 없어서
 * 자동 기록(audit_row)만으로는 퇴사·권한 변경의 사유가 빠진다 (R-2의 5: 누가 눌렀는지·왜가 보여야 한다).
 */
export async function auditStaffAction(args: { actorId: string; targetId: string; event: string; reason: string; detail?: Record<string, unknown>; table?: string }): Promise<void> {
  const { error } = await createAdminClient().from('audit_logs').insert({
    actor_id: args.actorId, action: 'update', target_table: args.table ?? 'profiles', target_id: args.targetId,
    after_data: { event: args.event, ...args.detail }, reason: args.reason,
  });
  if (error) throw new Error(`auditStaffAction: ${error.code}`);
}

/** 그 직원의 활성 폰 등록을 전부 해제하고, 쓰지 않은 초대도 무효로 한다. 해제한 폰 수를 돌려준다 */
export async function revokePhones(employeeId: string, actorId: string): Promise<number> {
  const db = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await db.from('user_passkeys').update({ revoked_at: now, revoked_by: actorId }).eq('employee_id', employeeId).is('revoked_at', null).select('id');
  if (error) throw new Error(`revokePhones: ${error.code}`);
  const { error: e2 } = await db.from('invites').update({ revoked_at: now }).eq('employee_id', employeeId).is('used_at', null).is('revoked_at', null);
  if (e2) throw new Error(`revokePhones.invites: ${e2.code}`);
  return data?.length ?? 0;
}

/** 로그인 계정 차단·해제 (Supabase Auth). 차단하면 새 로그인과 토큰 갱신이 막힌다 */
export async function setLoginBlocked(employeeId: string, blocked: boolean): Promise<void> {
  const { error } = await createAdminClient().auth.admin.updateUserById(employeeId, { ban_duration: blocked ? '876000h' : 'none' });
  if (error) throw new Error(`setLoginBlocked: ${error.message}`);
}

/** 퇴사 처리 전에 남은 일 (②-2 7-2 요점 3) — 놓치면 나중에 분쟁이 된다 */
export async function resignChecklist(employeeId: string): Promise<{ overtime: number; corrections: number; leave: number; work: number }> {
  const db = createAdminClient();
  const practice = OFFICE.practiceMode;
  const count = async (table: string) =>
    (await db.from(table).select('id', { count: 'exact', head: true }).eq('employee_id', employeeId).eq('status', 'pending').eq('is_test', practice)).count ?? 0;
  const [overtime, corrections, leave, work] = await Promise.all([count('overtime_requests'), count('punch_corrections'), count('leave_requests'), count('work_requests')]);
  return { overtime, corrections, leave, work };
}
