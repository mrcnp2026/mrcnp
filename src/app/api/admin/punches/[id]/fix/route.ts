// 최고관리자 직권 수정 — 찍힌 출퇴근 기록의 시각을 고치거나(modify) 지운다(void). (2026-10-15 의뢰인: 최고관리자는 직원이 잘못 넣은 것을 직권으로 추가 · 수정 · 삭제)
// ★ 원본(punch_events)은 그대로 둔다 — 관리자 이름의 정정을 만들고 바로 승인한다(대리 등록과 같은 길, proxy-punch.ts 머리말).
//   같은 기록에 이미 승인된 수정 · 무효가 있으면 그것을 먼저 취소하고 새로 넣는다(마지막 판단 하나만 남게).
//   누가 · 언제 · 왜가 정정 기록과 결정 기록(decision_log)에 남는다. 확정된 날 · 마감된 달은 고치지 못한다(먼저 푼다).
import { OFFICE } from '@/config/office';
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { addDays } from '@/lib/calendar';
import { assertNotConfirmed } from '@/lib/confirm-data';
import { isPeriodLocked } from '@/lib/punch';
import { assertStaffTarget } from '@/lib/staff-data';
import { cleanReason } from '@/lib/staff-rules';
import { createAdminClient } from '@/lib/supabase/admin';
import { kstDateTime } from '@/lib/time';

export const POST = api<{ params: Promise<{ id: string }> }>('admin.punches.fix', async (req, ctx) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  if (!me.top) throw new ApiError(403, 'top_only'); // 직권 수정은 최고관리자만
  const { id } = await ctx.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new ApiError(404, 'not_found');
  const b = await readJson(req);
  const action = b.action;
  if (action !== 'modify' && action !== 'void') throw new ApiError(400, 'invalid_input');
  const reason = cleanReason(b.reason);
  if (!reason) throw new ApiError(400, 'reason_required');
  const practice = OFFICE.practiceMode;
  const db = createAdminClient();

  const { data: ev } = await db.from('punch_events').select('id, employee_id, work_date, kind, punched_at, is_test').eq('id', id).maybeSingle();
  if (!ev || ev.is_test !== practice) throw new ApiError(404, 'not_found');
  await assertStaffTarget(me.id, ev.employee_id, 'approve');

  let newAt: Date | null = null;
  if (action === 'modify') {
    if (typeof b.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(b.time)) throw new ApiError(400, 'invalid_input');
    if (b.nextDay === true && ev.kind === 'in') throw new ApiError(400, 'invalid_input');
    newAt = kstDateTime(b.nextDay === true ? addDays(ev.work_date, 1) : ev.work_date, b.time);
    if (newAt > new Date()) throw new ApiError(400, 'future_time');
    if (newAt.getTime() === new Date(ev.punched_at).getTime()) throw new ApiError(409, 'already');
  }
  if (await isPeriodLocked(ev.employee_id, ev.work_date)) throw new ApiError(409, 'period_locked');
  await assertNotConfirmed(ev.employee_id, ev.work_date, practice);

  // 같은 기록에 걸린 대기 중 요청이 있으면 요청함에서 먼저 처리한다
  const { data: prior, error: e0 } = await db.from('punch_corrections').select('id, status').eq('target_id', id).in('status', ['pending', 'approved']);
  if (e0) throw new Error(`fix.read: ${e0.code}`);
  if ((prior ?? []).some((c) => c.status === 'pending')) throw new ApiError(409, 'pending_exists');
  for (const c of prior ?? []) {
    const { error } = await db.rpc('cancel_correction', { p_id: c.id, p_decided_by: me.id, p_reason: reason, p_request_id: ctx.requestId });
    if (error) throw new Error(`fix.cancel: ${error.code}`);
  }

  const { data: row, error } = await db
    .from('punch_corrections')
    .insert({
      correction_type: action, target_id: id, employee_id: ev.employee_id, work_date: ev.work_date, kind: ev.kind,
      new_punched_at: newAt?.toISOString() ?? null, reason, requested_by: me.id, status: 'pending', is_test: practice,
    })
    .select('id')
    .single();
  if (error) throw new Error(`fix.insert: ${error.code}`);
  const { data: result, error: e2 } = await db.rpc('decide_correction', { p_id: row.id, p_decision: 'approved', p_decided_by: me.id, p_reason: reason, p_request_id: ctx.requestId });
  if (e2) throw new Error(`fix.decide: ${e2.code}`);
  if (result !== 'ok') throw new ApiError(409, 'already');
  return { id: row.id };
});
