// 권한 등급 한 번에 바꾸기 — 최고관리자 · 대표자 · 총괄관리자 · 지점관리자 · 일반직원 (2026-10-15 의뢰인: `스샷/스샷2/권한3.png` — 상세에서 등급을 직접 부여할 수 없었다).
// 규칙(결정 사항 개발-39): 최고관리자 · 대표자로 지정하거나 그 사람을 바꾸는 것은 최고관리자 · 대표자만. 본인 것은 못 바꾼다.
//   등급(role)이 바뀌면 기존 권한 변경 절차(request_staff_role_atomic — 다른 관리자 확인, 최소 관리자 수)를 그대로 탄다.
//   관리자끼리의 구분(최고 · 대표 · 총괄)만 바뀌면 바로 반영한다.
// 2026-10-15 의뢰인: 화면에는 최고관리자 · 일반직원 두 가지만. 최고관리자는 대표자를 포함해 최대 3명(MAX_TOP — DB도 막는다, 묶음 13).
import { api, ApiError, readJson } from '@/lib/api';
import { atomicRpc } from '@/lib/atomic-rpc';
import { requireAdmin } from '@/lib/auth';
import { auditStaffAction, loadStaff } from '@/lib/staff-data';
import { cleanReason, gradeOf, MAX_TOP, type Grade } from '@/lib/staff-rules';
import { createAdminClient } from '@/lib/supabase/admin';

const GRADES: Grade[] = ['super', 'ceo', 'general', 'manager', 'employee'];

export const POST = api<{ params: Promise<{ id: string }> }>('admin.employees.grade', async (req, ctx) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const { id } = await ctx.params;
  const b = await readJson(req);
  const grade = GRADES.includes(b.grade as Grade) ? (b.grade as Grade) : null;
  if (!grade) throw new ApiError(400, 'invalid_input');
  const reason = cleanReason(b.reason);
  if (!reason) throw new ApiError(400, 'reason_required');
  const all = await loadStaff();
  const actor = all.find((s) => s.id === me.id);
  const target = all.find((s) => s.id === id);
  if (!actor || !target) throw new ApiError(404, 'not_found');
  if (target.id === actor.id) throw new ApiError(403, 'self_change');
  if (!target.active) throw new ApiError(409, 'employee_inactive');
  const top = (g: Grade) => g === 'super' || g === 'ceo';
  if ((target.owner || top(grade)) && !actor.owner) throw new ApiError(403, 'owner_only');
  const now = gradeOf(target);
  if (now === grade || (top(now) && top(grade))) throw new ApiError(409, 'already');
  if (top(grade) && all.filter((s) => s.active && top(gradeOf(s))).length >= MAX_TOP) throw new ApiError(409, 'super_full');

  const role = top(grade) || grade === 'general' ? 'admin' : grade;
  const db = createAdminClient();
  if (role !== target.role) {
    const r = await atomicRpc<{ ok: boolean; pending?: boolean }>('request_staff_role_atomic', { p_actor: me.id, p_target: id, p_role: role, p_pay: null, p_reason: reason, p_request_id: ctx.requestId });
    if (r.pending) return { ok: true, pending: true };
    if (!top(grade)) return { ok: true, grade };
  }
  // 관리자 안의 구분
  const { error } = await db.from('profiles').update({ admin_level: grade, updated_by: me.id }).eq('id', id).eq('role', 'admin');
  if (error?.code === '23505') throw new ApiError(409, 'level_taken');
  if (error) throw new Error(`grade.level: ${error.code}`);
  await auditStaffAction({ actorId: me.id, targetId: id, event: 'role_changed', reason, detail: { from: { grade: now }, to: { grade }, requestId: ctx.requestId } });
  return { ok: true, grade };
});
