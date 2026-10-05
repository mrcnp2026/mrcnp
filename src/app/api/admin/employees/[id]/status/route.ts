// 퇴사 처리 · 복직 (②-2 7-2). 계정과 기록은 지우지 않는다 (4-6) — profiles.active만 바꾼다.
// ★ 퇴사 처리 순간 접속을 끊는다: ① 로그인 계정 차단 ② 예전 지문 로그인·안 쓴 초대 해제 ③ active=false
//   → 서버 화면·API는 매 요청마다 active를 보고(getMe), DB 직접 읽기도 정책이 막는다 (0015).
// 사유는 필수이고 변경 기록에 남는다. 본인은 스스로 처리하지 못하고, 관리자가 2명 미만이 되면 차단한다 (R-2).
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { auditStaffAction, loadStaff, revokePhones, setLoginBlocked } from '@/lib/staff-data';
import { checkReinstate, checkResign, cleanReason } from '@/lib/staff-rules';
import { createAdminClient } from '@/lib/supabase/admin';

export const POST = api<{ params: Promise<{ id: string }> }>('admin.employees.status', async (req, ctx) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const { id } = await ctx.params;
  const b = await readJson(req);
  if (b.action !== 'resign' && b.action !== 'reinstate') throw new ApiError(400, 'invalid_input');
  const reason = cleanReason(b.reason);
  if (!reason) throw new ApiError(400, 'reason_required');
  const all = await loadStaff();
  const target = all.find((s) => s.id === id);
  if (!target) throw new ApiError(404, 'not_found');
  const db = createAdminClient();

  if (b.action === 'resign') {
    const code = checkResign(me.id, target, all);
    if (code) throw new ApiError(code === 'self_change' ? 403 : 409, code);
    // active를 먼저 끈다 — 여기서부터 화면·API·DB 읽기가 모두 막힌다. 뒤 단계가 실패해도 접속은 이미 끊겨 있다
    const { error } = await db.from('profiles').update({ active: false, updated_by: me.id }).eq('id', id);
    if (error) throw new Error(`status.resign: ${error.code}`);
    const phones = await revokePhones(id, me.id);
    await setLoginBlocked(id, true);
    await auditStaffAction({ actorId: me.id, targetId: id, event: 'resign', reason, detail: { phonesRevoked: phones, requestId: ctx.requestId } });
    return { ok: true, phonesRevoked: phones };
  }

  const code = checkReinstate(me.id, target);
  if (code) throw new ApiError(code === 'self_change' ? 403 : 409, code);
  await setLoginBlocked(id, false);
  const { error } = await db.from('profiles').update({ active: true, updated_by: me.id }).eq('id', id);
  if (error) throw new Error(`status.reinstate: ${error.code}`);
  await auditStaffAction({ actorId: me.id, targetId: id, event: 'reinstate', reason, detail: { requestId: ctx.requestId } });
  return { ok: true };
});
