// 퇴사 처리 · 복직 (②-2 7-2). 계정과 기록은 지우지 않는다 (4-6) — profiles.active만 바꾼다.
// ★ 퇴사 처리 순간 접속을 끊는다: ① 로그인 계정 차단 ② 예전 지문 로그인·안 쓴 초대 해제 ③ active=false
//   → 서버 화면·API는 매 요청마다 active를 보고(getMe), DB 직접 읽기도 정책이 막는다 (0015).
// 사유는 필수이고 변경 기록에 남는다. 직원 비고에도 아이디 · 날짜 · 사유가 자동으로 한 줄 남는다 (2026-10-25). 본인은 스스로 처리하지 못하고, 관리자가 2명 미만이 되면 차단한다 (R-2).
import { api, ApiError, readJson } from '@/lib/api';
import { assertStaffTarget } from '@/lib/staff-data';
import { requireAdmin } from '@/lib/auth';
import { auditStaffAction, loadStaff, revokePhones, setLoginBlocked } from '@/lib/staff-data';
import { checkReinstate, checkResign, cleanReason, statusNote } from '@/lib/staff-rules';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncStaffHistorySafe } from '@/lib/staff-history';
import { addStaffNote } from '@/lib/staff-notes';
import { toKstDate } from '@/lib/time';

export const POST = api<{ params: Promise<{ id: string }> }>('admin.employees.status', async (req, ctx) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const { id } = await ctx.params;
  await assertStaffTarget(me.id, id);
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
    if (code) throw new ApiError(code === 'self_change' || code === 'owner_only' ? 403 : 409, code);
    // active를 먼저 끈다 — 여기서부터 화면·API·DB 읽기가 모두 막힌다. 뒤 단계가 실패해도 접속은 이미 끊겨 있다
    const { error } = await db.from('profiles').update({ active: false, updated_by: me.id }).eq('id', id);
    if (error) throw new Error(`status.resign: ${error.code}`);
    const phones = await revokePhones(id, me.id);
    await setLoginBlocked(id, true);
    await auditStaffAction({ actorId: me.id, targetId: id, event: 'resign', reason, detail: { phonesRevoked: phones, requestId: ctx.requestId } });
    await syncStaffHistorySafe(id, me.id);
    await noteSafe(id, me.id, statusNote('resign', await idOf(id), toKstDate(new Date()), reason));
    return { ok: true, phonesRevoked: phones };
  }

  const code = checkReinstate(me.id, target);
  if (code) throw new ApiError(code === 'self_change' ? 403 : 409, code);
  await setLoginBlocked(id, false);
  const { error } = await db.from('profiles').update({ active: true, updated_by: me.id }).eq('id', id);
  if (error) throw new Error(`status.reinstate: ${error.code}`);
  await auditStaffAction({ actorId: me.id, targetId: id, event: 'reinstate', reason, detail: { requestId: ctx.requestId } });
  await syncStaffHistorySafe(id, me.id);
  await noteSafe(id, me.id, statusNote('reinstate', await idOf(id), toKstDate(new Date()), reason));
  return { ok: true };
});

// 직원 비고에 자동으로 한 줄 남긴다 (2026-10-25 의뢰인) — 실패해도 퇴사 · 복직 처리 자체는 이미 끝났으니 막지 않는다
async function noteSafe(id: string, actorId: string, body: string): Promise<void> {
  try {
    await addStaffNote(id, body, actorId);
  } catch {
    /* 비고 표가 아직 없거나 일시 오류 — 변경 기록(audit_logs)에는 이미 남아 있다 */
  }
}
async function idOf(id: string): Promise<string> {
  const { data } = await createAdminClient().from('profiles').select('employee_no').eq('id', id).maybeSingle();
  return (data?.employee_no as string | null) ?? '-';
}
