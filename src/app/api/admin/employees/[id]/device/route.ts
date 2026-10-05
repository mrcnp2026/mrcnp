// 출퇴근 기기 해제 (2026-10-05 의뢰인: 출퇴근은 등록한 기기 1대에서만) — 폰을 바꿨거나 잃어버렸을 때 관리자가 한다. 사유 필수.
// 지우지 않고 해제 시각만 남긴다 (4-6). 해제하면 직원이 새 폰에서 로그인해 직접 다시 등록한다 — 이것이 "기기 변경 승인"이다.
// 로그인(비밀번호)은 건드리지 않는다 — 비밀번호까지 막으려면 「로그인 초기화」(phone/route.ts).
// 본인 것은 스스로 해제하지 못한다. 다만 다른 관리자가 없으면(혼자 운영) 허용한다 — 아니면 폰을 바꿀 길이 없다.
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { auditStaffAction, loadStaff, revokePhones } from '@/lib/staff-data';
import { checkDeviceRevoke, cleanReason } from '@/lib/staff-rules';
import { createAdminClient } from '@/lib/supabase/admin';

export const POST = api<{ params: Promise<{ id: string }> }>('admin.employees.device', async (req, ctx) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const { id } = await ctx.params;
  const b = await readJson(req);
  const reason = cleanReason(b.reason);
  if (!reason) throw new ApiError(400, 'reason_required');
  if (checkDeviceRevoke(me.id, id, await loadStaff())) throw new ApiError(403, 'self_change');
  const { data: p } = await createAdminClient().from('profiles').select('id').eq('id', id).maybeSingle();
  if (!p) throw new ApiError(404, 'not_found');
  const n = await revokePhones(id, me.id, { keepInvites: true });
  if (n === 0) throw new ApiError(409, 'no_device');
  await auditStaffAction({ actorId: me.id, targetId: id, event: 'device_revoked', reason, detail: { devicesRevoked: n, requestId: ctx.requestId } });
  return { ok: true };
});
