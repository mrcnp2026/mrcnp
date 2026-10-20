// 관리자 대리 등록의 저장 길 (②-3 7-6) — 한 건 넣기(api/admin/employees/[id]/punch)와 엑셀 일괄 입력(2026-10-20)이 같이 쓴다. 서버 전용.
// ★ 원본(punch_events)에는 쓰지 않는다 — 관리자 이름의 「빠진 기록 추가」 정정을 만들고 바로 승인한다. 확정된 날 · 마감된 달 · 이미 있는 기록은 막는다.
import 'server-only';
import { OFFICE } from '@/config/office';
import { ApiError } from '@/lib/api';
import type { Me } from '@/lib/auth';
import { assertNotConfirmed } from '@/lib/confirm-data';
import { applyCorrections } from '@/lib/pairs';
import { syncOvertimeFor } from '@/lib/period-data';
import { planProxyPunch } from '@/lib/proxy-punch';
import { isPeriodLocked } from '@/lib/punch';
import { createAdminClient } from '@/lib/supabase/admin';
import { cleanText } from '@/lib/text';

export async function proxyPunch(args: { me: Me; employeeId: string; workDate: unknown; kind: unknown; time: unknown; nextDay: unknown; reason: unknown; requestId?: string; syncOvertime?: boolean }): Promise<{ id: string; at: string; workDate: string }> {
  const { me } = args;
  const id = args.employeeId;
  const reason = cleanText(args.reason);
  const practice = OFFICE.practiceMode;
  const db = createAdminClient();

  const { data: person } = await db.from('profiles').select('id').eq('id', id).maybeSingle();
  if (!person) throw new ApiError(404, 'not_found');

  const workDate = typeof args.workDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.workDate) ? args.workDate : null;
  if (!workDate) throw new ApiError(400, 'invalid_input');
  await assertNotConfirmed(id, workDate, practice); // 확정된 날에는 대신 넣지 못한다 — 먼저 확정을 푼다 (의뢰인 2026-10-11)
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
    workDate, kind: args.kind, time: args.time, nextDay: args.nextDay, reason, now: new Date(), effective,
    pendingSameKind: corrections.some((c) => c.status === 'pending' && c.correctionType === 'add_missing' && c.kind === args.kind),
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
    db.rpc('decide_correction', { p_id: row.id, p_decision: decision, p_decided_by: me.id, p_reason: reason, p_request_id: args.requestId ?? null });
  const { data: result, error: e3 } = await decide('approved');
  if (e3) throw new Error(`proxy.decide: ${e3.code}`);
  if (result === 'conflict') {
    // 그 사이 같은 날·같은 종류가 승인됐다 (부분 유일 인덱스, R-4) — 방금 만든 건은 거부로 닫아 요청함에 남지 않게 한다
    await decide('rejected');
    throw new ApiError(409, 'already_exists');
  }
  // 기록이 바뀐 날의 연장근로 확인을 바로 맞춘다 (2026-10-19 — 화면을 열 때 하던 계산을 옮김). 일괄 입력은 끝에 한 번에
  if (args.syncOvertime !== false) syncOvertimeFor(id, [plan.workDate]);
  return { id: row.id as string, at: plan.at.toISOString(), workDate: plan.workDate };
}
