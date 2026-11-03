// 관리자: 직원이 답한 「저녁 휴게 못 쉬었어요」 승인 · 반려 (2026-11-04). 승인은 화면이 「휴게 안 함」 표시(/api/admin/break-waivers)를 먼저 넣은 뒤 부른다.
import { api, ApiError, readJson } from '@/lib/api';
import { decideBreakSkip } from '@/lib/break-skip';
import { requireApprover, requireStaffViewer } from '@/lib/scope';
import { createAdminClient } from '@/lib/supabase/admin';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST = api('admin.breakSkip', async (req) => {
  const viewer = await requireStaffViewer();
  if (!viewer || viewer.me.adminLevel === 'ceo') throw new ApiError(403, 'forbidden'); // 대표자는 보기만
  const b = await readJson(req);
  if (typeof b.id !== 'string' || !UUID.test(b.id) || (b.decision !== 'approved' && b.decision !== 'rejected')) throw new ApiError(400, 'invalid_input');
  const { data: row } = await createAdminClient().from('break_skip_requests').select('employee_id').eq('id', b.id).maybeSingle();
  if (!row) throw new ApiError(404, 'not_found');
  await requireApprover(row.employee_id as string);
  const done = await decideBreakSkip(b.id, b.decision, viewer.me.id);
  if (!done) return { result: 'already' };
  return { result: 'ok' };
});
