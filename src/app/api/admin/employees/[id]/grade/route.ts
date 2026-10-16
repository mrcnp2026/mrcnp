// 권한 등급 한 번에 바꾸기 — 최고관리자 · 대표자 · 지점관리자 · 일반직원 (2026-10-16 의뢰인 권한-10).
// 규칙: 관리자는 모두 최고관리자(대표자 포함 최대 3명, 대표자는 1명). 급여도 함께 본다(급여 담당 구분 없음). 본인 것은 못 바꾼다.
//   등급(role)이 바뀌면 권한 변경 함수(request_staff_role_atomic — 최소 관리자 수)를 탄다. 최고관리자 ↔ 대표자는 바로 반영한다.
import { api, ApiError, readJson } from '@/lib/api';
import { atomicRpc } from '@/lib/atomic-rpc';
import { requireAdmin } from '@/lib/auth';
import { auditStaffAction, loadStaff } from '@/lib/staff-data';
import { cleanReason, gradeOf, MAX_CEO, MAX_TOP, SHOWN_GRADES, type Grade } from '@/lib/staff-rules';
import { createAdminClient } from '@/lib/supabase/admin';

const GRADES: readonly Grade[] = SHOWN_GRADES;

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
  if (now === grade) throw new ApiError(409, 'already');
  if (top(grade) && !top(now) && all.filter((s) => s.active && top(gradeOf(s))).length >= MAX_TOP) throw new ApiError(409, 'super_full');
  if (grade === 'ceo' && all.filter((s) => s.active && s.id !== id && gradeOf(s) === 'ceo').length >= MAX_CEO) throw new ApiError(409, 'ceo_taken');

  const role = top(grade) ? 'admin' : grade;
  const db = createAdminClient();
  if (role !== target.role) {
    const r = await atomicRpc<{ ok: boolean; pending?: boolean }>('request_staff_role_atomic', { p_actor: me.id, p_target: id, p_role: role, p_pay: role === 'admin', p_reason: reason, p_request_id: ctx.requestId });
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
