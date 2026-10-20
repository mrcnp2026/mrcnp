// 퇴직급여 건 — 추계 / 퇴직 정산 / 중간정산의 저장 · 확정 · 거두기 (PRD v1.3 9장 · 18.6 W08, DB 0039). 서버 전용, 급여 담당 관리자만 부른다.
// ★ 수동 검산이다. 프로그램은 넣은 값과 계산 과정을 남길 뿐 법정 정산이 맞다고 하지 않는다.
// ★ 필수 입력이 빠진 건은 금액이 비어 있고 확정되지 않는다(DB도 막는다). 「추계」는 확정할 수 없다.
// ★ 확정한 정산 · 중간정산의 기간은 한 직원 안에서 겹치지 못한다(DB가 막는다). 확정본은 고치지 못하고, 사유를 적어 거둔 뒤 새 판을 만든다.
// ★ 퇴직소득세는 계산하지 않는다. 확인된 값과 그 근거를 손으로 넣는다.
import 'server-only';
import { ApiError } from '@/lib/api';
import type { Me } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { sha } from './data';
import { pickRevisions } from './labor-cost';
import { loadMySlips } from './publish-data';
import { calcRetirement, daysBetween, last3Months, RETIREMENT_RULE, toRetirementInput, type RetirementInput, type RetirementResult } from './retirement';
import { payrollAudit } from './staff-data';

const db = () => createAdminClient();
type Row = Record<string, unknown>;
const isTestNo = (no: string | null | undefined) => !!no?.startsWith('e2e-');
const boom = (where: string, e: { code?: string; message?: string } | null): never => {
  if (e?.code === '23P01') throw new ApiError(409, 'retirement_overlap'); // 확정한 기간과 겹친다
  if (e?.code === 'PX002') throw new ApiError(409, 'retirement_locked');
  if (e?.code === '23514') throw new ApiError(409, 'retirement_incomplete');
  throw new Error(`${where}: ${e?.code ?? 'unknown'}`);
};

export type CaseKind = 'ESTIMATE' | 'FINAL' | 'INTERIM';
export type Sources = { joinedFrom: 'employment' | 'profile' | 'after_interim' | null; wageMonths: string[]; wageComplete: boolean; bonusCount: number };
export type RetirementCase = {
  id: string; employeeId: string; kind: CaseKind; periodFrom: string; periodTo: string; baseOn: string; input: RetirementInput; result: RetirementResult; sources: Sources | null;
  amount: number | null; taxAmount: number | null; taxBasis: string | null; state: 'DRAFT' | 'FINALIZED' | 'WITHDRAWN'; revision: number; supersedesId: string | null; reason: string | null; isTest: boolean;
  createdBy: string; createdAt: string; finalizedBy: string | null; finalizedAt: string | null;
};
const toCase = (r: Row): RetirementCase => {
  const snap = (r.input_snapshot ?? {}) as { input?: unknown; sources?: Sources };
  const input = toRetirementInput(snap.input);
  return {
    id: r.id as string, employeeId: r.employee_id as string, kind: r.case_kind as CaseKind, periodFrom: r.period_from as string, periodTo: r.period_to as string, baseOn: r.base_on as string, input, result: calcRetirement(input), sources: snap.sources ?? null,
    amount: r.amount === null ? null : Number(r.amount), taxAmount: r.tax_amount === null ? null : Number(r.tax_amount), taxBasis: r.tax_basis as string | null, state: r.state as RetirementCase['state'], revision: r.revision as number, supersedesId: r.supersedes_id as string | null, reason: r.reason as string | null, isTest: r.is_test as boolean,
    createdBy: r.created_by as string, createdAt: r.created_at as string, finalizedBy: r.finalized_by as string | null, finalizedAt: r.finalized_at as string | null,
  };
};

/**
 * 프로그램에 있는 자료로 입력을 미리 채운다 — 참고용이다. 담당자가 확인하고 고친다.
 *  · 계속근로 시작일: 재직 기간(없으면 직원 정보의 입사일). 확정한 중간정산이 있으면 그 다음날.
 *  · 3개월 임금: 마지막 근무일이 월말일 때만, 그 석 달의 확정한 정규 급여 지급 합계. 석 달이 다 있지 않으면 비워 둔다(추정하지 않는다).
 *  · 상여: 직전 1년에 확정한 상여 대장의 지급 합계. 연차수당 · 통상임금 · 제외 기간은 채우지 않는다.
 */
export async function suggestInput(args: { employeeId: string; lastDay: string; practice: boolean }): Promise<{ input: RetirementInput; sources: Sources }> {
  const c = db();
  const win = last3Months(args.lastDay);
  const yearAgo = new Date(Date.parse(`${args.lastDay}T00:00:00Z`) - 364 * 86400000).toISOString().slice(0, 10);
  const [{ data: emps }, { data: p }, { data: done }, { data: runs }] = await Promise.all([
    c.from('staff_employment_periods').select('starts_on, ends_on').eq('employee_id', args.employeeId).eq('active', true).order('starts_on', { ascending: false }),
    c.from('profiles').select('joined_on').eq('id', args.employeeId).maybeSingle(),
    c.from('payroll_retirement_cases').select('period_to').eq('employee_id', args.employeeId).eq('state', 'FINALIZED').eq('is_test', args.practice).lte('period_to', args.lastDay).order('period_to', { ascending: false }).limit(1),
    c.from('payroll_runs').select('id, run_kind, period_from, period_to, sequence, revision, current_generation_id').eq('is_test', args.practice).eq('status', 'FINALIZED').gte('period_from', yearAgo.slice(0, 8) + '01').lte('period_from', args.lastDay),
  ]);
  const emp = (emps ?? []).find((e) => (e.starts_on as string) <= args.lastDay) ?? null;
  let periodFrom = (emp?.starts_on as string | undefined) ?? (p?.joined_on as string | null) ?? null;
  let joinedFrom: Sources['joinedFrom'] = emp ? 'employment' : periodFrom ? 'profile' : null;
  const lastDone = done?.[0]?.period_to as string | undefined;
  if (lastDone && (!periodFrom || lastDone >= periodFrom)) {
    periodFrom = new Date(Date.parse(`${lastDone}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
    joinedFrom = 'after_interim';
  }
  const picked = pickRevisions((runs ?? []).map((r) => ({ kind: r.run_kind as string, periodFrom: r.period_from as string, periodTo: r.period_to as string, sequence: r.sequence as number, revision: r.revision as number, generationId: r.current_generation_id as string | null }))).filter((r) => r.generationId);
  const { data: sts } = picked.length ? await c.from('payroll_statements').select('generation_id, pay_total, state').eq('employee_id', args.employeeId).in('generation_id', picked.map((r) => r.generationId as string)) : { data: [] as Row[] };
  const payOf = (g: string | null) => {
    const s = (sts ?? []).find((x) => x.generation_id === g && x.state === 'OK');
    return s ? Number(s.pay_total) : null;
  };
  // 석 달이 달력의 달과 딱 맞을 때만(월말 퇴직) 급여대장으로 채운다
  const monthEnd = new Date(Date.parse(`${args.lastDay}T00:00:00Z`) + 86400000).getUTCDate() === 1;
  const months = monthEnd ? [0, 1, 2].map((i) => new Date(Date.UTC(Number(win.from.slice(0, 4)), Number(win.from.slice(5, 7)) - 1 + i, 1)).toISOString().slice(0, 7)) : [];
  const wages = months.map((m) => payOf(picked.find((r) => r.kind === 'REGULAR' && r.periodFrom.slice(0, 7) === m)?.generationId ?? null));
  const wageComplete = months.length === 3 && wages.every((v) => v !== null);
  const bonus = picked.filter((r) => r.kind === 'BONUS' && r.periodFrom >= yearAgo.slice(0, 8) + '01').map((r) => payOf(r.generationId)).filter((v): v is number => v !== null);
  return {
    input: { periodFrom, periodTo: args.lastDay, excludedDays: 0, wage3m: wageComplete ? wages.reduce<number>((a, v) => a + (v ?? 0), 0) : null, days3m: win.days, bonus1y: bonus.reduce((a, v) => a + v, 0), leavePay1y: 0, ordinaryDaily: null },
    sources: { joinedFrom, wageMonths: months.filter((_, i) => wages[i] !== null), wageComplete, bonusCount: bonus.length },
  };
}

export async function loadCases(args: { practice: boolean; testViewer: boolean }): Promise<(RetirementCase & { name: string; employeeNo: string | null })[]> {
  const c = db();
  const [{ data, error }, { data: people }] = await Promise.all([
    c.from('payroll_retirement_cases').select('*').eq('is_test', args.practice).order('created_at', { ascending: false }).limit(5000), // 검사 건이 쌓여도 실제 건이 밀려나지 않게 넉넉히(뒤에서 검사 · 실제를 나눈다)
    c.from('profiles').select('id, name, employee_no'),
  ]);
  if (error) boom('loadCases', error);
  const who = new Map((people ?? []).map((p) => [p.id as string, p]));
  // 검사 계정의 건은 검사 계정에게만, 실제 직원의 건은 실제 관리자에게만 보인다
  return ((data ?? []) as Row[]).map(toCase).map((k) => ({ ...k, name: (who.get(k.employeeId)?.name as string) ?? '', employeeNo: (who.get(k.employeeId)?.employee_no as string | null) ?? null })).filter((k) => isTestNo(k.employeeNo) === args.testViewer);
}
export async function loadCase(id: string): Promise<RetirementCase | null> {
  const { data, error } = await db().from('payroll_retirement_cases').select('*').eq('id', id).maybeSingle();
  if (error) boom('loadCase', error);
  return data ? toCase(data as Row) : null;
}
const must = async (id: string): Promise<RetirementCase> => {
  const k = await loadCase(id);
  if (!k) throw new ApiError(404, 'not_found');
  return k;
};

const fields = (input: RetirementInput, sources: Sources | null) => {
  const result = calcRetirement(input);
  return { input_snapshot: { input, sources }, policy_refs: { rule: RETIREMENT_RULE, rounding: 'FLOOR_1' }, missing: result.missing, amount: result.amount, departure_insurance_amount: input.departureInsurance ?? null };
};

export async function createCase(args: { employeeId: string; kind: CaseKind; input: RetirementInput; sources: Sources | null; practice: boolean; me: Me; requestId?: string }): Promise<{ id: string }> {
  const { input } = args;
  if (!input.periodFrom || !input.periodTo || input.periodTo < input.periodFrom) throw new ApiError(400, 'retirement_period');
  const { data: p } = await db().from('profiles').select('employee_no').eq('id', args.employeeId).maybeSingle();
  if (!p || isTestNo(p.employee_no as string | null) !== isTestNo(args.me.employeeNo)) throw new ApiError(404, 'not_found');
  const { data, error } = await db().from('payroll_retirement_cases').insert({ employee_id: args.employeeId, case_kind: args.kind, period_from: input.periodFrom, period_to: input.periodTo, base_on: input.periodTo, ...fields(input, args.sources), is_test: args.practice, created_by: args.me.id }).select('id').single();
  if (error || !data) boom('createCase', error);
  await payrollAudit({ actorId: args.me.id, action: 'retirement.create', table: 'payroll_retirement_cases', subjectId: data!.id as string, employeeId: args.employeeId, requestId: args.requestId, detail: { kind: args.kind } });
  return { id: data!.id as string };
}

/** 초안 고치기 — 넣은 값 · 세액. 기간(정산 구간)은 건을 만들 때 정한 대로다(바꾸려면 새로 만든다) */
export async function updateCase(args: { id: string; input: RetirementInput; taxAmount: number | null; taxBasis: string | null; me: Me; requestId?: string }): Promise<void> {
  const k = await must(args.id);
  if (k.state !== 'DRAFT') throw new ApiError(409, 'retirement_locked');
  if (args.taxAmount !== null && !args.taxBasis) throw new ApiError(400, 'retirement_tax_basis'); // 세액을 넣으면 근거도 적는다
  const input = { ...args.input, periodFrom: k.periodFrom, periodTo: k.periodTo };
  const { error } = await db().from('payroll_retirement_cases').update({ ...fields(input, k.sources), tax_amount: args.taxAmount, tax_basis: args.taxBasis }).eq('id', k.id).eq('state', 'DRAFT');
  if (error) boom('updateCase', error);
  await payrollAudit({ actorId: args.me.id, action: 'retirement.update', table: 'payroll_retirement_cases', subjectId: k.id, employeeId: k.employeeId, requestId: args.requestId });
}

export async function finalizeCase(args: { id: string; me: Me; requestId?: string }): Promise<void> {
  const k = await must(args.id);
  if (k.state !== 'DRAFT') throw new ApiError(409, 'retirement_locked');
  if (k.kind === 'ESTIMATE') throw new ApiError(409, 'retirement_estimate'); // 추계는 확정하는 것이 아니다
  if (k.result.missing.length > 0 || k.result.amount === null || k.amount !== k.result.amount) throw new ApiError(409, 'retirement_incomplete');
  // 같은 기간을 두 번 정산하지 않는다 — 운영 자료는 DB도 막지만, 연습 자료도 같은 규칙으로 여기서 막는다
  const { data: clash, error: e0 } = await db().from('payroll_retirement_cases').select('id').eq('employee_id', k.employeeId).eq('state', 'FINALIZED').eq('is_test', k.isTest).lte('period_from', k.periodTo).gte('period_to', k.periodFrom).limit(1);
  if (e0) boom('finalizeCase.clash', e0);
  if (clash?.length) throw new ApiError(409, 'retirement_overlap');
  const { data, error } = await db().from('payroll_retirement_cases').update({ state: 'FINALIZED', finalized_by: args.me.id, finalized_at: new Date().toISOString(), result_hash: sha({ input: k.input, amount: k.amount, tax: k.taxAmount, rule: RETIREMENT_RULE }) }).eq('id', k.id).eq('state', 'DRAFT').select('id');
  if (error) boom('finalizeCase', error);
  if (!data?.length) throw new ApiError(409, 'retirement_locked');
  await payrollAudit({ actorId: args.me.id, action: 'retirement.finalize', table: 'payroll_retirement_cases', subjectId: k.id, employeeId: k.employeeId, requestId: args.requestId, detail: { kind: k.kind, revision: k.revision } });
}

/** 거두기 — 초안은 그냥, 확정본은 사유를 적어야 한다. 거둔 건은 되살리지 못한다 */
export async function withdrawCase(args: { id: string; reason: string; me: Me; requestId?: string }): Promise<void> {
  const k = await must(args.id);
  if (k.state === 'WITHDRAWN') throw new ApiError(409, 'retirement_locked');
  const { error } = await db().from('payroll_retirement_cases').update({ state: 'WITHDRAWN', reason: args.reason }).eq('id', k.id).eq('state', k.state);
  if (error) boom('withdrawCase', error);
  await payrollAudit({ actorId: args.me.id, action: 'retirement.withdraw', table: 'payroll_retirement_cases', subjectId: k.id, employeeId: k.employeeId, requestId: args.requestId, detail: { from: k.state } });
}

/** 거둔 확정본에서 새 판(초안)을 만든다 — 넣은 값은 그대로 가져온다 */
export async function reviseCase(args: { id: string; me: Me; requestId?: string }): Promise<{ id: string }> {
  const k = await must(args.id);
  if (k.state !== 'WITHDRAWN' || k.kind === 'ESTIMATE') throw new ApiError(409, 'retirement_locked');
  const { data, error } = await db().from('payroll_retirement_cases').insert({ employee_id: k.employeeId, case_kind: k.kind, period_from: k.periodFrom, period_to: k.periodTo, base_on: k.baseOn, ...fields(k.input, k.sources), tax_amount: k.taxAmount, tax_basis: k.taxBasis, is_test: k.isTest, revision: k.revision + 1, supersedes_id: k.id, created_by: args.me.id }).select('id').single();
  if (error || !data) boom('reviseCase', error);
  await payrollAudit({ actorId: args.me.id, action: 'retirement.revise', table: 'payroll_retirement_cases', subjectId: data!.id as string, employeeId: k.employeeId, requestId: args.requestId, detail: { from: k.id } });
  return { id: data!.id as string };
}

export type MyEstimate = { asOf: string; periodFrom: string | null; months: string[]; wageComplete: boolean; result: RetirementResult; input: RetirementInput };
/**
 * 직원 본인의 예상 퇴직금 (E02) — 「오늘 그만둔다면」의 어림값. 저장하지 않는다.
 * 자료: 입사일(재직 기간), 나에게 공개된 최근 석 달의 급여 명세서 지급 합계(공개되지 않은 금액은 쓰지 않는다), 직전 1년 공개된 상여.
 * 연차수당 · 통상임금 비교 · 제외 기간 · 세금은 들어 있지 않다 — 화면에 그렇게 적는다.
 */
export async function myEstimate(employeeId: string, practice: boolean, today: string): Promise<MyEstimate> {
  const c = db();
  const [{ data: emps }, { data: p }, { data: done }, slips] = await Promise.all([
    c.from('staff_employment_periods').select('starts_on').eq('employee_id', employeeId).eq('active', true).lte('starts_on', today).order('starts_on', { ascending: false }).limit(1),
    c.from('profiles').select('joined_on').eq('id', employeeId).maybeSingle(),
    c.from('payroll_retirement_cases').select('period_to').eq('employee_id', employeeId).eq('state', 'FINALIZED').eq('is_test', practice).order('period_to', { ascending: false }).limit(1),
    loadMySlips(employeeId, practice),
  ]);
  let periodFrom = (emps?.[0]?.starts_on as string | undefined) ?? (p?.joined_on as string | null) ?? null;
  const lastDone = done?.[0]?.period_to as string | undefined;
  if (lastDone && (!periodFrom || lastDone >= periodFrom)) periodFrom = new Date(Date.parse(`${lastDone}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  // 지난 석 달(이번 달 제외)의 공개된 정규 급여
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  const months = [3, 2, 1].map((i) => new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7));
  const current = slips.filter((s) => s.current);
  const wages = months.map((mm) => current.find((s) => s.kind === 'REGULAR' && s.month === mm)?.pay ?? null);
  const wageComplete = wages.every((v) => v !== null);
  const from3 = `${months[0]}-01`, to3 = new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10);
  const yearAgo = new Date(Date.UTC(y - 1, m - 1, 1)).toISOString().slice(0, 7);
  const input: RetirementInput = {
    periodFrom, periodTo: today, excludedDays: 0, wage3m: wageComplete ? wages.reduce<number>((a, v) => a + (v ?? 0), 0) : null, days3m: daysBetween(from3, to3),
    bonus1y: current.filter((s) => s.kind === 'BONUS' && s.month >= yearAgo).reduce((a, s) => a + s.pay, 0), leavePay1y: 0, ordinaryDaily: null,
  };
  return { asOf: today, periodFrom, months: months.filter((_, i) => wages[i] !== null), wageComplete, result: calcRetirement(input), input };
}
