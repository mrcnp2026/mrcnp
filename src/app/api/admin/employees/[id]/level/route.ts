// 관리자 구분 바꾸기 — 최고관리자 · 대표자 (2026-10-16 의뢰인 권한-10: 권한은 같고 대표자 표시만 다르다, 대표자 1명).
// 자기 것은 못 바꾼다. 사유 필수, 변경 기록에 남는다.
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { auditStaffAction, loadStaff } from '@/lib/staff-data';
import { checkLevelChange, cleanReason, MAX_CEO, type AdminLevel } from '@/lib/staff-rules';
import { createAdminClient } from '@/lib/supabase/admin';

export const POST = api<{ params: Promise<{ id: string }> }>('admin.employees.level', async (req, ctx) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const { id } = await ctx.params;
  const b = await readJson(req);
  const level: AdminLevel | null = b.level === 'super' || b.level === 'ceo' ? b.level : null;
  if (!level) throw new ApiError(400, 'invalid_input');
  const reason = cleanReason(b.reason);
  if (!reason) throw new ApiError(400, 'reason_required');
  const all = await loadStaff();
  const actor = all.find((s) => s.id === me.id);
  const target = all.find((s) => s.id === id);
  if (!actor || !target) throw new ApiError(404, 'not_found');
  const code = checkLevelChange(actor, target, level);
  if (code) throw new ApiError(code === 'already' || code === 'employee_inactive' ? 409 : 403, code);
  if (level === 'ceo' && all.filter((s) => s.active && s.id !== id && s.level === 'ceo').length >= MAX_CEO) throw new ApiError(409, 'ceo_taken');
  const { error } = await createAdminClient().from('profiles').update({ admin_level: level, updated_by: me.id }).eq('id', id);
  if (error?.code === '23505') throw new ApiError(409, 'level_taken');
  if (error) throw new Error(`level.update: ${error.code}`);
  await auditStaffAction({ actorId: me.id, targetId: id, event: 'role_changed', reason, detail: { from: { level: target.level ?? 'super' }, to: { level }, requestId: ctx.requestId } });
  return { ok: true, level };
});
