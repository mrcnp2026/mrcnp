// 퇴직연금 DC — 가입 · 매달 부담금 읽기 · 쓰기 (묶음 32, 2026-10-20). 서버 전용 — 부르는 쪽이 급여 담당자인지 먼저 확인한다.
// 부담금은 그 달 확정한 급여대장(정기 + 상여, 차수마다 마지막 정정본)의 지급 합계 ÷ 12. 은행에 낸 달 · 손으로 넣은 달은 다시 계산하지 않는다.
import 'server-only';
import { ApiError } from '@/lib/api';
import type { Me } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { contributionOf, inDcPlan, type MemberInput, type PensionContribution, type PensionMember } from './pension';

type Row = Record<string, unknown>;
const db = () => createAdminClient();
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const toMember = (r: Row): PensionMember => ({ id: r.id as string, employeeId: r.employee_id as string, planKind: r.plan_kind as 'DC' | 'DB', joinedOn: r.joined_on as string, endedOn: (r.ended_on as string | null) ?? null, institution: (r.institution as string | null) ?? null, openingBalance: num(r.opening_balance), openingAsOf: (r.opening_as_of as string | null) ?? null, marketValue: num(r.market_value), marketValueAsOf: (r.market_value_as_of as string | null) ?? null, note: (r.note as string | null) ?? null, active: r.active as boolean });
const toContribution = (r: Row): PensionContribution => ({ id: r.id as string, employeeId: r.employee_id as string, month: r.month as string, wageTotal: Number(r.wage_total), amount: Number(r.amount), source: r.source as 'PAYROLL' | 'MANUAL', runId: (r.run_id as string | null) ?? null, paidOn: (r.paid_on as string | null) ?? null, note: (r.note as string | null) ?? null });

export async function loadPension(isTest: boolean): Promise<{ members: PensionMember[]; contributions: PensionContribution[] }> {
  const [{ data: m, error: e1 }, { data: c, error: e2 }] = await Promise.all([
    db().from('payroll_pension_members').select('*').eq('is_test', isTest).eq('active', true),
    db().from('payroll_pension_contributions').select('*').eq('is_test', isTest).order('month'),
  ]);
  if (e1 || e2) throw new Error(`loadPension: ${(e1 ?? e2)!.code}`);
  return { members: ((m ?? []) as Row[]).map(toMember), contributions: ((c ?? []) as Row[]).map(toContribution) };
}

/** 가입 넣기 · 고치기 (직원마다 켜진 가입은 하나) */
export async function saveMember(args: { employeeId: string; input: MemberInput; isTest: boolean; me: Me }): Promise<void> {
  const c = db();
  // 평가금액 칸(DB 묶음 36)이 아직 없는 DB에서는 값이 있을 때만 막고, 비어 있으면 예전처럼 저장한다
  const valueReady = !(await c.from('payroll_pension_members').select('market_value').limit(1)).error;
  if (!valueReady && args.input.marketValue !== null) throw new Error('saveMember: db_update_required');
  const row = { ...(valueReady ? { market_value: args.input.marketValue, market_value_as_of: args.input.marketValueAsOf } : {}), plan_kind: args.input.planKind, joined_on: args.input.joinedOn, ended_on: args.input.endedOn, institution: args.input.institution, opening_balance: args.input.openingBalance, opening_as_of: args.input.openingAsOf, note: args.input.note, updated_by: args.me.id, updated_at: new Date().toISOString() };
  const { data: cur } = await c.from('payroll_pension_members').select('id').eq('employee_id', args.employeeId).eq('is_test', args.isTest).eq('active', true).maybeSingle();
  const { error } = cur
    ? await c.from('payroll_pension_members').update(row).eq('id', cur.id)
    : await c.from('payroll_pension_members').insert({ ...row, employee_id: args.employeeId, is_test: args.isTest, created_by: args.me.id });
  if (error) throw new Error(`saveMember: ${error.code}`);
}
export async function removeMember(args: { employeeId: string; isTest: boolean; me: Me }): Promise<void> {
  const { error } = await db().from('payroll_pension_members').update({ active: false, updated_by: args.me.id, updated_at: new Date().toISOString() }).eq('employee_id', args.employeeId).eq('is_test', args.isTest).eq('active', true);
  if (error) throw new Error(`removeMember: ${error.code}`);
}

/** 그 달 부담금을 확정한 급여대장에서 다시 만든다. 은행에 낸 달 · 손으로 넣은 달은 건드리지 않는다. 대장을 확정할 때 · 화면에서 부른다 */
export async function syncMonth(args: { month: string; isTest: boolean; me: Me }): Promise<{ made: number; skipped: number }> {
  const c = db();
  const month = `${args.month.slice(0, 7)}-01`;
  const { data: runs } = await c.from('payroll_runs').select('id, run_kind, sequence, revision, current_generation_id').eq('period_from', month).eq('is_test', args.isTest).eq('status', 'FINALIZED').in('run_kind', ['REGULAR', 'BONUS']);
  // 같은 종류 · 차수는 마지막 정정본만
  const latest = new Map<string, Row>();
  for (const r of (runs ?? []) as Row[]) {
    const k = `${r.run_kind}:${r.sequence}`;
    if (!latest.has(k) || (latest.get(k)!.revision as number) < (r.revision as number)) latest.set(k, r);
  }
  const gens = [...latest.values()].map((r) => r.current_generation_id as string).filter(Boolean);
  const wage = new Map<string, { total: number; runId: string }>();
  if (gens.length) {
    const { data: sts } = await c.from('payroll_statements').select('employee_id, pay_total, run_id').in('generation_id', gens).eq('state', 'OK');
    for (const s of (sts ?? []) as Row[]) {
      const id = s.employee_id as string;
      const prev = wage.get(id);
      wage.set(id, { total: (prev?.total ?? 0) + Number(s.pay_total ?? 0), runId: (prev?.runId ?? s.run_id) as string });
    }
  }
  const { members, contributions } = await loadPension(args.isTest);
  let made = 0, skipped = 0;
  for (const m of members.filter((x) => inDcPlan(x, month))) {
    const w = wage.get(m.employeeId);
    if (!w) continue;
    const cur = contributions.find((x) => x.employeeId === m.employeeId && x.month === month);
    if (cur && (cur.paidOn || cur.source === 'MANUAL')) {
      skipped++;
      continue;
    }
    const row = { wage_total: w.total, amount: contributionOf(w.total), source: 'PAYROLL', run_id: w.runId, updated_by: args.me.id, updated_at: new Date().toISOString() };
    const { error } = cur
      ? await c.from('payroll_pension_contributions').update(row).eq('id', cur.id)
      : await c.from('payroll_pension_contributions').insert({ ...row, employee_id: m.employeeId, month, is_test: args.isTest, created_by: args.me.id });
    if (error) throw new Error(`syncMonth: ${error.code}`);
    made++;
  }
  return { made, skipped };
}

/** 손으로 넣기 (앱을 쓰기 전 달 등) — 임금총액을 넣으면 ÷ 12 */
export async function saveManualContribution(args: { employeeId: string; month: string; wageTotal: number; note: string | null; isTest: boolean; me: Me }): Promise<void> {
  const c = db();
  const month = `${args.month.slice(0, 7)}-01`;
  const { data: cur } = await c.from('payroll_pension_contributions').select('id, paid_on').eq('employee_id', args.employeeId).eq('month', month).eq('is_test', args.isTest).maybeSingle();
  if (cur?.paid_on) throw new ApiError(409, 'pension_paid');
  const row = { wage_total: args.wageTotal, amount: contributionOf(args.wageTotal), source: 'MANUAL', run_id: null, note: args.note, updated_by: args.me.id, updated_at: new Date().toISOString() };
  const { error } = cur
    ? await c.from('payroll_pension_contributions').update(row).eq('id', cur.id)
    : await c.from('payroll_pension_contributions').insert({ ...row, employee_id: args.employeeId, month, is_test: args.isTest, created_by: args.me.id });
  if (error) throw new Error(`saveManualContribution: ${error.code}`);
}

/** 은행에 낸 날 표시 (그 달 · 고른 사람들). 날짜를 비우면 표시를 지운다 */
export async function markPaid(args: { month: string; employeeIds: string[]; paidOn: string | null; isTest: boolean; me: Me }): Promise<number> {
  const { data, error } = await db()
    .from('payroll_pension_contributions')
    .update({ paid_on: args.paidOn, updated_by: args.me.id, updated_at: new Date().toISOString() })
    .eq('month', `${args.month.slice(0, 7)}-01`)
    .eq('is_test', args.isTest)
    .in('employee_id', args.employeeIds)
    .select('id');
  if (error) throw new Error(`markPaid: ${error.code}`);
  return data?.length ?? 0;
}
