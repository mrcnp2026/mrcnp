// 직원별 저녁 휴게 기본값 넣기 (결정 사항 급여-78, 2026-11-18 의뢰인: 저녁 휴게 없이 일하는 직원은 한 번 설정).
// { skipEvening: true(안 쉼) | false(쉼), validFrom: 'YYYY-MM-DD', reason } — 새 판을 덧붙인다. 계산은 period-data(waivedFor)가 한다.
// 시작일부터 오늘 사이에 확정한 날 · 마감한 달이 있으면 넣지 못한다(먼저 확정을 푼다 — 확정-2). 넣은 뒤 그 기간 연장을 다시 맞춘다.
import { OFFICE } from '@/config/office';
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { syncOvertimeRange } from '@/lib/period-data';
import { loadStaff } from '@/lib/staff-data';
import { approvalBlocked } from '@/lib/staff-rules';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST = api<{ params: Promise<{ id: string }> }>('admin.employees.breakDefault', async (req, ctx) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const { id } = await ctx.params;
  if (!UUID.test(id)) throw new ApiError(404, 'not_found');
  const b = await readJson(req);
  const reason = typeof b.reason === 'string' ? b.reason.trim() : '';
  if (typeof b.skipEvening !== 'boolean' || typeof b.validFrom !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.validFrom)) throw new ApiError(400, 'invalid_input');
  if (!reason || reason.length > 200) throw new ApiError(400, 'reason_required');
  const staff = await loadStaff();
  const actor = staff.find((s) => s.id === me.id);
  const target = staff.find((s) => s.id === id);
  if (!actor || !target) throw new ApiError(404, 'not_found');
  const blocked = approvalBlocked(actor, target, staff); // 자기 근로시간을 혼자 바꾸지 않는다 (권한-12)
  if (blocked) throw new ApiError(403, blocked);
  const practice = OFFICE.practiceMode;
  const db = createAdminClient();
  const [{ count: confirmed }, { count: closed }] = await Promise.all([
    db.from('day_confirms').select('id', { count: 'exact', head: true }).eq('employee_id', id).eq('is_test', practice).eq('active', true).gte('work_date', b.validFrom),
    db.from('attendance_closes').select('id', { count: 'exact', head: true }).eq('employee_id', id).eq('is_test', practice).eq('state', 'CLOSED').gt('period_to', b.validFrom),
  ]);
  if (closed) throw new ApiError(409, 'period_locked');
  if (confirmed) throw new ApiError(409, 'day_confirmed');
  const { error } = await db.from('break_defaults').insert({ employee_id: id, valid_from: b.validFrom, skip_evening: b.skipEvening, reason, is_test: practice, created_by: me.id });
  if (error) throw new Error(`breakDefaults.insert: ${error.code}`);
  // 늘거나 준 저녁 휴게만큼 연장 요청을 다시 맞춘다 — 승인한 건은 「다시 확인」으로 올라온다
  if (b.validFrom <= toKstDate(new Date())) await syncOvertimeRange(b.validFrom, toKstDate(new Date()), practice, new Set([id]));
  return { ok: true };
});
