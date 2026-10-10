// 근무일정 틀 고치기: 내용(이름·시각·유형·색·메모) · 끄기/켜기 · 적용할 직원. 지우지 않는다 (4-6).
// 적용 직원(employeeIds)은 보낸 목록으로 통째로 맞춘다 — 목록에 든 사람은 이 틀로, 이 틀을 쓰던 사람 중 빠진 사람은 「틀 없음」(회사 규칙)으로.
// 직원이 쓰고 있는 틀은 끌 수 없다 — 먼저 다른 틀로 옮긴다.
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { validateTemplate } from '@/lib/shifts';
import { createAdminClient } from '@/lib/supabase/admin';

const UUID = /^[0-9a-f-]{36}$/i;

export const POST = api<{ params: Promise<{ id: string }> }>('admin.shifts.update', async (req, ctx) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const { id } = await ctx.params;
  if (!UUID.test(id)) throw new ApiError(404, 'not_found');
  const b = await readJson(req);
  const db = createAdminClient();
  const { data: cur } = await db.from('shift_templates').select('id, active').eq('id', id).maybeSingle();
  if (!cur) throw new ApiError(404, 'not_found');

  if (b.active !== undefined) {
    if (typeof b.active !== 'boolean') throw new ApiError(400, 'invalid_input');
    if (!b.active) {
      const { count } = await db.from('profiles').select('id', { count: 'exact', head: true }).eq('shift_template_id', id).eq('active', true);
      if ((count ?? 0) > 0) throw new ApiError(409, 'template_in_use');
    }
    const { error } = await db.from('shift_templates').update({ active: b.active, updated_by: me.id }).eq('id', id);
    if (error?.code === '23505') throw new ApiError(409, 'duplicate_template');
    if (error) throw new Error(`shifts.toggle: ${error.code}`);
    return { ok: true };
  }

  if (b.employeeIds !== undefined) {
    if (!cur.active) throw new ApiError(409, 'template_off');
    if (!Array.isArray(b.employeeIds) || b.employeeIds.length > 500 || b.employeeIds.some((x) => typeof x !== 'string' || !UUID.test(x))) throw new ApiError(400, 'invalid_input');
    const want = [...new Set(b.employeeIds as string[])];
    const { data: now } = await db.from('profiles').select('id').eq('shift_template_id', id);
    const had = (now ?? []).map((p) => p.id as string);
    const drop = had.filter((x) => !want.includes(x));
    const add = want.filter((x) => !had.includes(x));
    if (add.length) {
      const { data: found } = await db.from('profiles').select('id').in('id', add).eq('active', true);
      if ((found?.length ?? 0) !== add.length) throw new ApiError(400, 'invalid_input');
      const { error } = await db.from('profiles').update({ shift_template_id: id, updated_by: me.id }).in('id', add);
      if (error) throw new Error(`shifts.assign: ${error.code}`);
    }
    if (drop.length) {
      const { error } = await db.from('profiles').update({ shift_template_id: null, updated_by: me.id }).in('id', drop);
      if (error) throw new Error(`shifts.unassign: ${error.code}`);
    }
    return { ok: true, added: add.length, removed: drop.length };
  }

  const v = validateTemplate(b);
  if (!v.ok) throw new ApiError(400, v.code);
  const t = v.value;
  const { error } = await db.from('shift_templates').update({ name: t.name, start_time: t.startTime, end_time: t.endTime, kind: t.kind, color: t.color, memo: t.memo, updated_by: me.id }).eq('id', id);
  if (error?.code === '23505') throw new ApiError(409, 'duplicate_template');
  if (error) throw new Error(`shifts.update: ${error.code}`);
  return { ok: true };
});
