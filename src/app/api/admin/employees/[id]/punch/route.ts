// 관리자 대리 등록 (②-3 7-6). 직원이 못 찍은 출근·퇴근을 관리자가 사유와 함께 넣는다.
// ★ 원본(punch_events)에는 쓰지 않는다 — 관리자 이름의 "빠진 기록 추가" 정정을 만들고 바로 승인한다 (proxy-punch.ts 머리말).
//   누가(requested_by·approved_by)·언제·왜(reason)가 정정 기록과 결정 기록(decision_log)에 남는다.
// 시각·작성자·연습 여부는 서버가 정한다. 같은 날·같은 종류 기록이 이미 있으면 넣지 않는다.
import { OFFICE } from '@/config/office';
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { applyCorrections } from '@/lib/pairs';
import { planProxyPunch } from '@/lib/proxy-punch';
import { isPeriodLocked } from '@/lib/punch';
import { createAdminClient } from '@/lib/supabase/admin';
import { cleanText } from '@/lib/text';

export const POST = api<{ params: Promise<{ id: string }> }>('admin.proxy.punch', async (req, ctx) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const { id } = await ctx.params;
  // 관리자가 자기 기록을 스스로 넣고 스스로 승인하지 못한다 — 본인 것은 정정 요청으로 보내고 다른 관리자가 처리한다
  if (id === me.id) throw new ApiError(403, 'proxy_self');
  const b = await readJson(req);
  const reason = cleanText(b.reason);
  const practice = OFFICE.practiceMode;
  const db = createAdminClient();

  const { data: person } = await db.from('profiles').select('id').eq('id', id).maybeSingle();
  if (!person) throw new ApiError(404, 'not_found');

  const workDate = typeof b.workDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.workDate) ? b.workDate : null;
  if (!workDate) throw new ApiError(400, 'invalid_input');
  const [{ data: ev, error: e1 }, { data: co, error: e2 }] = await Promise.all([
    db.from('punch_events').select('id, employee_id, kind, punched_at, work_date').eq('employee_id', id).eq('work_date', workDate).eq('is_test', practice),
    db.from('punch_corrections').select('id, correction_type, target_id, employee_id, work_date, kind, new_punched_at, status').eq('employee_id', id).eq('work_date', workDate).eq('is_test', practice),
  ]);
  if (e1 || e2) throw new Error(`proxy.read: ${(e1 ?? e2)!.code}`);
  const corrections = (co ?? []).map((c) => ({
    id: c.id, correctionType: c.correction_type, targetId: c.target_id, employeeId: c.employee_id, workDate: c.work_date, kind: c.kind,
    newPunchedAt: c.new_punched_at ? new Date(c.new_punched_at) : null, status: c.status,
  }));
  const effective = applyCorrections(
    (ev ?? []).map((e) => ({ id: e.id, employeeId: e.employee_id, kind: e.kind, punchedAt: new Date(e.punched_at), workDate: e.work_date })),
    corrections,
  );

  const plan = planProxyPunch({
    workDate, kind: b.kind, time: b.time, nextDay: b.nextDay, reason, now: new Date(), effective,
    pendingSameKind: corrections.some((c) => c.status === 'pending' && c.correctionType === 'add_missing' && c.kind === b.kind),
  });
  if (!plan.ok) throw new ApiError(plan.code === 'already_exists' || plan.code === 'pending_exists' ? 409 : 400, plan.code);
  if (await isPeriodLocked(id, plan.workDate)) throw new ApiError(409, 'period_locked');

  const { data: row, error } = await db
    .from('punch_corrections')
    .insert({
      correction_type: 'add_missing', target_id: null, employee_id: id, work_date: plan.workDate, kind: plan.kind,
      new_punched_at: plan.at.toISOString(), reason, requested_by: me.id, status: 'pending', is_test: practice,
    })
    .select('id')
    .single();
  if (error) throw new Error(`proxy.insert: ${error.code}`);

  const decide = (decision: 'approved' | 'rejected') =>
    db.rpc('decide_correction', { p_id: row.id, p_decision: decision, p_decided_by: me.id, p_reason: reason, p_request_id: ctx.requestId });
  const { data: result, error: e3 } = await decide('approved');
  if (e3) throw new Error(`proxy.decide: ${e3.code}`);
  if (result === 'conflict') {
    // 그 사이 같은 날·같은 종류가 승인됐다 (부분 유일 인덱스, R-4) — 방금 만든 건은 거부로 닫아 요청함에 남지 않게 한다
    await decide('rejected');
    throw new ApiError(409, 'already_exists');
  }
  return { id: row.id, at: plan.at.toISOString() };
});
