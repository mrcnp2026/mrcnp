// 승인된 정정 취소 (직원 요청으로 승인된 정정 · 관리자 대리 등록 모두). 사유 필수.
// 정정 행은 지우지 않는다 — 상태만 'cancelled'가 되고 결정 기록에 누가·왜가 남는다 (0016). 원본(punch_events)은 그대로다.
// 자기 기록의 정정은 스스로 취소하지 못한다 (다른 관리자가 한다). 마감된 달은 취소할 수 없다.
// 취소 뒤 그 날 집계는 화면을 열 때 다시 계산되고, 이미 결정한 연장 요청은 "재확인 필요"로 올라온다 (R-4).
import { OFFICE } from '@/config/office';
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { assertNotConfirmed } from '@/lib/confirm-data';
import { isPeriodLocked } from '@/lib/punch';
import { cleanReason } from '@/lib/staff-rules';
import { createAdminClient } from '@/lib/supabase/admin';

export const POST = api<{ params: Promise<{ id: string }> }>('admin.corrections.cancel', async (req, ctx) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const { id } = await ctx.params;
  const reason = cleanReason((await readJson(req)).reason);
  if (!reason) throw new ApiError(400, 'reason_required');
  const db = createAdminClient();
  const { data: c } = await db.from('punch_corrections').select('employee_id, work_date').eq('id', id).maybeSingle();
  if (!c) throw new ApiError(404, 'not_found');
  if (c.employee_id === me.id && me.employeeNo !== OFFICE.ownerEmployeeNo) throw new ApiError(403, 'self_change'); // 오너는 자기 것도 직접 처리한다
  if (await isPeriodLocked(c.employee_id, c.work_date)) throw new ApiError(409, 'period_locked');
  await assertNotConfirmed(c.employee_id, c.work_date); // 확정된 날의 기록은 바뀌지 않는다 — 먼저 확정을 푼다
  const { data, error } = await db.rpc('cancel_correction', { p_id: id, p_decided_by: me.id, p_reason: reason, p_request_id: ctx.requestId });
  if (error) throw new Error(`cancel_correction: ${error.code}`);
  if (data === 'not_found') throw new ApiError(404, 'not_found');
  if (data === 'already') throw new ApiError(409, 'already');
  return { ok: true };
});
