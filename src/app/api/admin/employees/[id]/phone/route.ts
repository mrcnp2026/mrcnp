// 로그인 초기화 (②-3 7-12의 "폰 등록 해제"가 2026-10-05 의뢰인 요청으로 바뀜: 로그인이 폰이 아니라 아이디 + 비밀번호).
// 폰을 잃어버렸거나 비밀번호가 새어 나갔을 때: 모든 기기 로그아웃 + 비밀번호 무효 + 예전 지문 로그인 해제 + 안 쓴 초대 무효. 사유 필수.
// 자기 것은 스스로 초기화하지 못한다 — 다른 관리자가 한다 (R-2의 2: 실수로 본인을 잠그는 것을 막는다).
// 초기화 뒤에는 초대 링크를 다시 보내 새 비밀번호를 만들게 한다. 그 전까지의 출퇴근은 관리자 대리 등록으로 넣는다.
import { resetLogin } from '@/lib/account';
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
  await resetLogin(id, me.id);
  const n = await revokePhones(id, me.id);
  await auditStaffAction({ actorId: me.id, targetId: id, event: 'login_reset', reason, detail: { phonesRevoked: n, requestId: ctx.requestId } });
  return { ok: true };
});
