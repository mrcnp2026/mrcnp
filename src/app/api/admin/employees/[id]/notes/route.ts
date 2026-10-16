// 직원 비고 쓰기 · 지우기 (관리자만, 묶음 19). { body } → 새 비고, { remove: noteId } → 숨기기.
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { assertStaffTarget } from '@/lib/staff-data';
import { addStaffNote, cleanNote, hideStaffNote } from '@/lib/staff-notes';

export const POST = api<{ params: Promise<{ id: string }> }>('admin.employees.notes', async (req, ctx) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const { id } = await ctx.params;
  await assertStaffTarget(me.id, id);
  const b = await readJson(req);
  if (typeof b.remove === 'string') {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(b.remove)) throw new ApiError(400, 'invalid_input');
    await hideStaffNote(id, b.remove, me.id);
    return { ok: true };
  }
  const body = cleanNote(b.body);
  if (!body) throw new ApiError(400, 'invalid_note');
  await addStaffNote(id, body, me.id);
  return { ok: true };
});
