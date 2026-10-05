// 폰 등록 해제 (②-3 7-12). 지우지 않고 해제 시각만 남긴다 (4-6). 사유 필수.
// 자기 폰은 스스로 해제하지 못한다 — 다른 관리자가 한다 (R-2의 2: 실수로 본인을 잠그는 것을 막는다).
// 해제 뒤에는 초대 링크를 다시 보내 새 폰을 등록한다. 그 전까지의 출퇴근은 관리자 대리 등록으로 넣는다.
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { auditStaffAction, revokePhones } from '@/lib/staff-data';
import { checkPhoneRevoke, cleanReason } from '@/lib/staff-rules';
import { createAdminClient } from '@/lib/supabase/admin';

export const POST = api<{ params: Promise<{ id: string }> }>('admin.employees.phone', async (req, ctx) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const { id } = await ctx.params;
  const b = await readJson(req);
  const reason = cleanReason(b.reason);
  if (!reason) throw new ApiError(400, 'reason_required');
  if (checkPhoneRevoke(me.id, id)) throw new ApiError(403, 'self_change');
  const { data: p } = await createAdminClient().from('profiles').select('id').eq('id', id).maybeSingle();
  if (!p) throw new ApiError(404, 'not_found');
  const n = await revokePhones(id, me.id);
  if (n === 0) throw new ApiError(409, 'no_phone');
  await auditStaffAction({ actorId: me.id, targetId: id, event: 'phone_revoked', reason, detail: { phonesRevoked: n, requestId: ctx.requestId } });
  return { ok: true };
});
