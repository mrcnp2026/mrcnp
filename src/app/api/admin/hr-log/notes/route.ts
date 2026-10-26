// 인사 변동 이력에서 「기록 글」 여러 건 지우기 (2026-10-25 의뢰인: 선택 삭제). 관리자만.
// 지운다는 것은 숨기기다(deleted_at) — 변경 기록에는 남는다. 직원 한 명의 글을 지우는 것과 같은 길(hideStaffNote)이고, 그 직원에 대한 권한 검사도 같다.
// 퇴사 · 복직 · 권한 · 입사일 · 내려받기 기록은 여기서 지우지 못한다(증빙).
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { assertStaffTarget } from '@/lib/staff-data';
import { hideStaffNote } from '@/lib/staff-notes';
import { createAdminClient } from '@/lib/supabase/admin';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX = 50;

export const POST = api('admin.hrlog.notes', async (req) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const b = await readJson(req);
  const ids = Array.isArray(b.ids) ? [...new Set(b.ids)] : [];
  if (ids.length === 0 || ids.length > MAX || ids.some((x) => typeof x !== 'string' || !UUID.test(x))) throw new ApiError(400, 'invalid_input');
  const { data: notes } = await createAdminClient().from('staff_notes').select('id, employee_id').in('id', ids as string[]).is('deleted_at', null);
  let done = 0;
  for (const n of notes ?? []) {
    try {
      await assertStaffTarget(me.id, n.employee_id as string);
      await hideStaffNote(n.employee_id as string, n.id as string, me.id);
      done++;
    } catch {
      /* 권한이 없거나 이미 지워진 글 — 건너뛴다 */
    }
  }
  return { done, failed: ids.length - done };
});
