// 보상휴가 ↔ 연장근로 연결 (2026-10-19 의뢰인, 「아직 안 만든 기능」 #33 · DB 0063 묶음 29). 서버 전용.
// 연장근로 n분을 돈 대신 휴가(n × 배율)로 준다 — 근로기준법 57조 보상휴가제(근로자대표와 서면 합의가 있어야 쓸 수 있다).
// ★ 휴가는 연차 원장의 지급 건(종류 compensatory)으로 바로 지급되고, 급여 계산은 그 달 인정 연장에서 이 분을 빼고 연장수당을 계산한다 — 두 번 주지 않는다.
// ★ 그 달 급여대장을 이미 확정했으면 돌릴 수도 취소할 수도 없다(연장수당이 이미 나갔다).
// ★ 이번에는 연장(OVERTIME)만. 휴일 · 야간은 가산 구조가 달라 따로 만든다.
import 'server-only';
import { OFFICE } from '@/config/office';
import { ApiError } from '@/lib/api';
import type { Me } from '@/lib/auth';
import { addManualLot, decideLots } from '@/lib/leave-ledger-data';
import { createAdminClient } from '@/lib/supabase/admin';

const db = () => createAdminClient();
const missingTable = (code?: string) => code === '42P01' || code === 'PGRST205' || code === 'PGRST204';
const monthEnd = (m: string) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10);

export type OvertimeComp = { id: string; employeeId: string; month: string; minutes: number; rate: number; leaveMinutes: number; lotId: string | null; note: string | null; createdBy: string; createdAt: string; cancelledAt: string | null; cancelReason: string | null };
const toComp = (r: Record<string, unknown>): OvertimeComp => ({
  id: r.id as string, employeeId: r.employee_id as string, month: (r.pay_month as string).slice(0, 7), minutes: r.minutes as number, rate: Number(r.rate), leaveMinutes: r.leave_minutes as number, lotId: (r.lot_id as string | null) ?? null,
  note: (r.note as string | null) ?? null, createdBy: r.created_by as string, createdAt: r.created_at as string, cancelledAt: (r.cancelled_at as string | null) ?? null, cancelReason: (r.cancel_reason as string | null) ?? null,
});

/** 기록 (취소한 것 포함, 새것부터). 표가 없으면 null */
export async function loadComps(args: { practice: boolean; employeeId?: string; month?: string; limit?: number }): Promise<OvertimeComp[] | null> {
  let q = db().from('payroll_overtime_comp').select('*').eq('is_test', args.practice);
  if (args.employeeId) q = q.eq('employee_id', args.employeeId);
  if (args.month) q = q.eq('pay_month', `${args.month}-01`);
  const { data, error } = await q.order('created_at', { ascending: false }).limit(args.limit ?? 500);
  if (missingTable(error?.code)) return null;
  if (error) throw new Error(`loadComps: ${error.code}`);
  return (data ?? []).map(toComp);
}

/** 급여 계산용 — 그 달 직원마다 보상휴가로 돌린 연장 분(취소 뺀 것). 표가 없으면 빈 것 */
export async function compMinutesFor(month: string, practice: boolean): Promise<Map<string, number>> {
  const rows = await loadComps({ practice, month, limit: 5000 });
  const out = new Map<string, number>();
  for (const r of rows ?? []) if (!r.cancelledAt) out.set(r.employeeId, (out.get(r.employeeId) ?? 0) + r.minutes);
  return out;
}

/** 그 달 승인된 연장(분) — 연장근로 요청의 인정분(비어 있으면 요청 전부) 합. 급여는 끊은 시간 기준일 수 있어 계산 때 한 번 더 확인한다 */
export async function approvedOvertime(employeeId: string, month: string, practice: boolean): Promise<number> {
  const { data, error } = await db().from('overtime_requests').select('overtime_minutes, approved_minutes').eq('employee_id', employeeId).eq('is_test', practice).eq('status', 'approved').gte('work_date', `${month}-01`).lte('work_date', monthEnd(month));
  if (error) throw new Error(`approvedOvertime: ${error.code}`);
  return (data ?? []).reduce((a, r) => a + ((r.approved_minutes as number | null) ?? (r.overtime_minutes as number)), 0);
}

/** 그 달 정규 급여대장을 확정했는가 */
async function monthFinalized(month: string, practice: boolean): Promise<boolean> {
  const { data, error } = await db().from('payroll_runs').select('id').eq('run_kind', 'REGULAR').eq('period_from', `${month}-01`).eq('is_test', practice).eq('status', 'FINALIZED').limit(1);
  if (error) throw new Error(`monthFinalized: ${error.code}`);
  return (data ?? []).length > 0;
}

/** 직원의 그 달 — 승인 연장 · 이미 돌린 분 · 남은 분 (화면용) */
export async function compRoom(employeeId: string, month: string, practice: boolean): Promise<{ approved: number; converted: number; left: number; finalized: boolean }> {
  const [approved, rows, finalized] = await Promise.all([approvedOvertime(employeeId, month, practice), loadComps({ practice, employeeId, month }), monthFinalized(month, practice)]);
  const converted = (rows ?? []).filter((r) => !r.cancelledAt).reduce((a, r) => a + r.minutes, 0);
  return { approved, converted, left: Math.max(0, approved - converted), finalized };
}

export async function createComp(args: { me: Me; employeeId: string; month: string; minutes: number; rate: number; usableTo: string | null; note: string | null; practice?: boolean }): Promise<OvertimeComp> {
  const practice = args.practice ?? OFFICE.practiceMode;
  if ((await loadComps({ practice, limit: 1 })) === null) throw new ApiError(503, 'db_update_required');
  const room = await compRoom(args.employeeId, args.month, practice);
  if (room.finalized) throw new ApiError(409, 'payroll_finalized');
  if (args.minutes > room.left) throw new ApiError(409, 'comp_exceeds_overtime');
  const leaveMinutes = Math.round(args.minutes * args.rate);
  const { data, error } = await db().from('payroll_overtime_comp').insert({ employee_id: args.employeeId, pay_month: `${args.month}-01`, minutes: args.minutes, rate: args.rate, leave_minutes: leaveMinutes, is_test: practice, note: args.note, created_by: args.me.id }).select('*').single();
  if (error || !data) throw new Error(`createComp: ${error?.code}`);
  // 휴가 지급: 그 달 말일부터 쓸 수 있다(연장을 한 달의 끝). 메모에 몇 시간 → 몇 시간인지 남긴다
  const h = (m: number) => `${Math.round((m / 60) * 100) / 100}시간`;
  const r = await addManualLot({ employeeId: args.employeeId, kind: 'compensatory', minutes: leaveMinutes, usableFrom: monthEnd(args.month), usableTo: args.usableTo, note: `${args.month} 연장 ${h(args.minutes)} → 보상휴가 ${h(leaveMinutes)} (×${args.rate})${args.note ? ` · ${args.note}` : ''}`, me: args.me, basis: { rule: 'overtime_comp', compId: data.id, month: args.month, minutes: args.minutes, rate: args.rate }, dedupeKey: `overtime_comp:${data.id}` });
  if (r.result !== 'approved') {
    await db().from('payroll_overtime_comp').update({ cancelled_at: new Date().toISOString(), cancelled_by: args.me.id, cancel_reason: `휴가 지급 실패(${r.result})` }).eq('id', data.id);
    throw new ApiError(409, r.result === 'locked' ? 'period_locked' : 'comp_grant_failed');
  }
  const u = await db().from('payroll_overtime_comp').update({ lot_id: r.id }).eq('id', data.id).select('*').single();
  if (u.error) throw new Error(`createComp.lot: ${u.error.code}`);
  return toComp(u.data);
}

/** 취소 — 급여를 확정하기 전, 휴가를 아직 쓰지 않았을 때만. 지급 건을 거두고 기록에 취소를 적는다 */
export async function cancelComp(args: { me: Me; id: string; reason: string }): Promise<void> {
  const { data } = await db().from('payroll_overtime_comp').select('*').eq('id', args.id).maybeSingle();
  if (!data) throw new ApiError(404, 'not_found');
  const c = toComp(data);
  if (c.cancelledAt) throw new ApiError(409, 'already');
  if (await monthFinalized(c.month, data.is_test as boolean)) throw new ApiError(409, 'payroll_finalized');
  if (c.lotId) {
    const [r] = await decideLots({ ids: [c.lotId], decision: 'withdraw', me: args.me });
    if (r?.result === 'in_use') throw new ApiError(409, 'comp_in_use');
    if (r?.result === 'locked') throw new ApiError(409, 'period_locked');
  }
  const { error } = await db().from('payroll_overtime_comp').update({ cancelled_at: new Date().toISOString(), cancelled_by: args.me.id, cancel_reason: args.reason }).eq('id', args.id).is('cancelled_at', null);
  if (error) throw new Error(`cancelComp: ${error.code}`);
}
