// 일용직 — 지급 대상자 · 고용 기간 · 근무 입력 · 일용 대장(계산 → 검토 → 확정) (PRD v1.3 9장 · 18.5 W07, DB 0039). 서버 전용, 급여 담당 관리자만 부른다.
// ★ 지급 대상자는 로그인 계정과 따로다(계정을 만들지 않는다). 이름이 같아도 내부번호가 다르면 다른 사람이다.
// ★ 같은 사람 · 날짜 · 현장 · 구간의 근무는 한 번만 들어간다(DB가 막는다). 확정한 줄은 금액을 고치지 못하고 무효로 한 뒤 새로 넣는다.
// ★ 일용 대장은 급여대장 표(payroll_runs, 종류 DAILY)를 같이 쓰되 명세는 일용 명세 표에 쌓는다. 한 근무 줄은 확정한 대장 하나에만 들어간다.
// ★ 세금은 일용근로소득 임시 규칙(daily.ts), 4대보험료는 계산하지 않는다. 적용 상태가 「모름」이면 그 사람은 계산하지 않는다(0원 아님).
// ★ 신고용 파일(지급명세서 제출)과 이체는 없다.
import 'server-only';
import { ApiError } from '@/lib/api';
import type { Me } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { calcDaily, DAILY_RULE, toDailyItems, type DailyItem, type DailyResult, type DailyTerms, type DailyWork } from './daily';
import { sha } from './data';
import { loadRun, type RunRow } from './run-data';
import { payrollAudit } from './staff-data';

const db = () => createAdminClient();
type Row = Record<string, unknown>;
const isTestNo = (no: string | null | undefined) => !!no?.startsWith('e2e-');
const boom = (where: string, e: { code?: string } | null): never => {
  if (e?.code === 'PX001') throw new ApiError(409, 'daily_work_locked');
  if (e?.code === 'PX003') throw new ApiError(409, 'version_conflict');
  if (e?.code === 'PR001') throw new ApiError(409, 'payroll_finalized');
  if (e?.code === 'PR003') throw new ApiError(409, 'payroll_run_conflict');
  throw new Error(`${where}: ${e?.code ?? 'unknown'}`);
};

// ── 대상자 · 고용 기간 ──
export type Payee = { id: string; internalNo: string; name: string; profileId: string | null; phone: string | null; note: string | null; active: boolean; isTest: boolean };
export type Engagement = DailyTerms & { id: string; payeeId: string; startsOn: string; endsOn: string | null; project: string; dayRate: number | null; basisNote: string | null; active: boolean };
const toPayee = (r: Row): Payee => ({ id: r.id as string, internalNo: r.internal_no as string, name: r.name as string, profileId: r.profile_id as string | null, phone: r.phone as string | null, note: r.note as string | null, active: r.active as boolean, isTest: r.is_test as boolean });
const toEngagement = (r: Row): Engagement => ({ id: r.id as string, payeeId: r.payee_id as string, startsOn: r.starts_on as string, endsOn: r.ends_on as string | null, project: r.project as string, dayRate: r.day_rate === null ? null : Number(r.day_rate), taxState: r.tax_state as DailyTerms['taxState'], ei: r.ei_state as DailyTerms['ei'], np: r.np_state as DailyTerms['np'], hi: r.hi_state as DailyTerms['hi'], basisNote: r.basis_note as string | null, active: r.active as boolean });

/** 검사 계정이 만든 대상자(is_test)는 검사 계정에게만, 실제 대상자는 실제 관리자에게만 보인다 */
export async function loadPayees(testViewer: boolean): Promise<{ payees: Payee[]; engagements: Engagement[] }> {
  const c = db();
  const { data, error } = await c.from('payroll_payees').select('*').eq('is_test', testViewer).order('name').limit(2000);
  if (error) boom('loadPayees', error);
  const payees = ((data ?? []) as Row[]).map(toPayee);
  const ids = payees.map((p) => p.id);
  const { data: es } = ids.length ? await c.from('payroll_payee_engagements').select('*').in('payee_id', ids).eq('active', true).order('starts_on', { ascending: false }) : { data: [] as Row[] };
  return { payees, engagements: ((es ?? []) as Row[]).map(toEngagement) };
}
const myPayee = async (id: string, me: Me): Promise<Payee> => {
  const { data } = await db().from('payroll_payees').select('*').eq('id', id).maybeSingle();
  if (!data || (data.is_test as boolean) !== isTestNo(me.employeeNo)) throw new ApiError(404, 'not_found');
  return toPayee(data as Row);
};

export async function addPayee(args: { internalNo: string; name: string; phone: string | null; note: string | null; profileId: string | null; me: Me; requestId?: string }): Promise<{ id: string }> {
  const test = isTestNo(args.me.employeeNo);
  if (args.internalNo.toLowerCase().startsWith('e2e-') !== test) throw new ApiError(400, 'daily_internal_no'); // e2e- 로 시작하는 번호는 검사용으로 남겨 둔다
  const { data, error } = await db().from('payroll_payees').insert({ internal_no: args.internalNo, name: args.name, phone: args.phone, note: args.note, profile_id: args.profileId, is_test: test, created_by: args.me.id }).select('id').single();
  if (error?.code === '23505') throw new ApiError(409, 'daily_payee_exists'); // 내부번호가 겹치거나, 그 직원에 이미 이어진 대상자가 있다
  if (error || !data) boom('addPayee', error);
  await payrollAudit({ actorId: args.me.id, action: 'daily.payee.add', table: 'payroll_payees', subjectId: data!.id as string, requestId: args.requestId });
  return { id: data!.id as string };
}
export async function setPayeeActive(args: { id: string; active: boolean; me: Me; requestId?: string }): Promise<void> {
  const p = await myPayee(args.id, args.me);
  const { error } = await db().from('payroll_payees').update({ active: args.active, updated_by: args.me.id }).eq('id', p.id);
  if (error) boom('setPayeeActive', error);
  await payrollAudit({ actorId: args.me.id, action: 'daily.payee.active', table: 'payroll_payees', subjectId: p.id, requestId: args.requestId, detail: { active: args.active } });
}

export async function addEngagement(args: { payeeId: string; startsOn: string; endsOn: string | null; project: string; dayRate: number | null; terms: DailyTerms; basisNote: string | null; me: Me; requestId?: string }): Promise<{ id: string }> {
  const p = await myPayee(args.payeeId, args.me);
  if (args.endsOn && args.endsOn < args.startsOn) throw new ApiError(400, 'daily_period');
  const { data, error } = await db().from('payroll_payee_engagements').insert({ payee_id: p.id, starts_on: args.startsOn, ends_on: args.endsOn, project: args.project, day_rate: args.dayRate, tax_state: args.terms.taxState, ei_state: args.terms.ei, np_state: args.terms.np, hi_state: args.terms.hi, basis_note: args.basisNote, created_by: args.me.id }).select('id').single();
  if (error?.code === '23P01') throw new ApiError(409, 'daily_engagement_overlap'); // 같은 현장의 기간이 겹친다
  if (error || !data) boom('addEngagement', error);
  await payrollAudit({ actorId: args.me.id, action: 'daily.engagement.add', table: 'payroll_payee_engagements', subjectId: data!.id as string, requestId: args.requestId });
  return { id: data!.id as string };
}
/** 적용 상태 · 일단가 · 끝나는 날 고치기, 끄기. 시작일 · 현장은 바꾸지 못한다(새로 넣는다) */
export async function setEngagement(args: { id: string; endsOn?: string | null; dayRate?: number | null; terms?: DailyTerms; basisNote?: string | null; disable?: boolean; me: Me; requestId?: string }): Promise<void> {
  const c = db();
  const { data: e } = await c.from('payroll_payee_engagements').select('id, payee_id, starts_on').eq('id', args.id).maybeSingle();
  if (!e) throw new ApiError(404, 'not_found');
  await myPayee(e.payee_id as string, args.me);
  const patch: Row = { updated_by: args.me.id };
  if (args.disable) patch.active = false;
  else {
    if (args.endsOn !== undefined) {
      if (args.endsOn && args.endsOn < (e.starts_on as string)) throw new ApiError(400, 'daily_period');
      patch.ends_on = args.endsOn;
    }
    if (args.dayRate !== undefined) patch.day_rate = args.dayRate;
    if (args.terms) Object.assign(patch, { tax_state: args.terms.taxState, ei_state: args.terms.ei, np_state: args.terms.np, hi_state: args.terms.hi });
    if (args.basisNote !== undefined) patch.basis_note = args.basisNote;
  }
  const { error } = await c.from('payroll_payee_engagements').update(patch).eq('id', args.id);
  if (error?.code === '23P01') throw new ApiError(409, 'daily_engagement_overlap');
  if (error) boom('setEngagement', error);
  await payrollAudit({ actorId: args.me.id, action: args.disable ? 'daily.engagement.disable' : 'daily.engagement.set', table: 'payroll_payee_engagements', subjectId: args.id, requestId: args.requestId });
}

// ── 근무 입력 ──
export type WorkRow = DailyWork & { payeeId: string; engagementId: string; segmentKey: string; basisNote: string | null; version: number; isTest: boolean };
const toWork = (r: Row): WorkRow => ({ id: r.id as string, payeeId: r.payee_id as string, engagementId: r.engagement_id as string, workDate: r.work_date as string, project: r.project as string, segmentKey: r.segment_key as string, quantity: Number(r.quantity), dayRate: Number(r.day_rate), items: toDailyItems(r.items) ?? [], basisNote: r.basis_note as string | null, status: r.status as WorkRow['status'], version: r.version as number, isTest: r.is_test as boolean });

export async function loadWork(args: { month: string; practice: boolean; payeeIds: string[] }): Promise<WorkRow[]> {
  if (args.payeeIds.length === 0) return [];
  const [y, m] = args.month.split('-').map(Number);
  const to = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const { data, error } = await db().from('payroll_daily_work').select('*').eq('is_test', args.practice).in('payee_id', args.payeeIds).gte('work_date', `${args.month}-01`).lt('work_date', to).order('work_date').order('created_at').limit(5000);
  if (error) boom('loadWork', error);
  return ((data ?? []) as Row[]).map(toWork);
}

/** 근무 한 줄 넣기 — 그 날짜 · 현장에 걸친 고용 기간이 있어야 한다. 일단가를 비우면 고용 기간의 일단가를 쓴다 */
export async function addWork(args: { payeeId: string; workDate: string; project: string; segmentKey: string; quantity: number; dayRate: number | null; items: DailyItem[]; basisNote: string | null; practice: boolean; me: Me; requestId?: string }): Promise<{ id: string }> {
  const c = db();
  const p = await myPayee(args.payeeId, args.me);
  const { data: es } = await c.from('payroll_payee_engagements').select('*').eq('payee_id', p.id).eq('active', true).eq('project', args.project).lte('starts_on', args.workDate);
  const e = ((es ?? []) as Row[]).map(toEngagement).find((x) => x.endsOn === null || x.endsOn >= args.workDate);
  if (!e) throw new ApiError(409, 'daily_no_engagement'); // 그 날짜 · 현장의 고용 기간이 없다
  const rate = args.dayRate ?? e.dayRate;
  if (!rate) throw new ApiError(400, 'daily_no_rate');
  const { data, error } = await c.from('payroll_daily_work').insert({ payee_id: p.id, engagement_id: e.id, work_date: args.workDate, project: args.project, segment_key: args.segmentKey, quantity: args.quantity, day_rate: rate, items: args.items, basis_note: args.basisNote, is_test: args.practice, created_by: args.me.id }).select('id').single();
  if (error?.code === '23505') throw new ApiError(409, 'daily_work_exists'); // 같은 사람 · 날짜 · 현장 · 구간
  if (error || !data) boom('addWork', error);
  await payrollAudit({ actorId: args.me.id, action: 'daily.work.add', table: 'payroll_daily_work', subjectId: data!.id as string, requestId: args.requestId, detail: { date: args.workDate } });
  return { id: data!.id as string };
}

/** 확정 / 무효. 확정한 대장에 들어간 줄은 무효로 하지 못한다(대장이 먼저다) */
export async function setWorkStatus(args: { id: string; expectedVersion: number; status: 'CONFIRMED' | 'VOID'; me: Me; requestId?: string }): Promise<void> {
  const c = db();
  const { data: w } = await c.from('payroll_daily_work').select('id, payee_id, version, status').eq('id', args.id).maybeSingle();
  if (!w) throw new ApiError(404, 'not_found');
  await myPayee(w.payee_id as string, args.me);
  if (w.version !== args.expectedVersion) throw new ApiError(409, 'version_conflict');
  if (args.status === 'VOID' && (await finalizedWorkIds([w.payee_id as string])).has(w.id as string)) throw new ApiError(409, 'daily_work_in_run');
  const { data, error } = await c.from('payroll_daily_work').update({ status: args.status, version: args.expectedVersion + 1, updated_by: args.me.id }).eq('id', args.id).eq('version', args.expectedVersion).select('id');
  if (error) boom('setWorkStatus', error);
  if (!data?.length) throw new ApiError(409, 'version_conflict');
  await payrollAudit({ actorId: args.me.id, action: args.status === 'VOID' ? 'daily.work.void' : 'daily.work.confirm', table: 'payroll_daily_work', subjectId: args.id, requestId: args.requestId });
}

/** 확정한 일용 대장에 이미 들어간 근무 줄 (두 대장에 들어가지 않게) */
async function finalizedWorkIds(payeeIds: string[], exceptRunId?: string): Promise<Set<string>> {
  if (payeeIds.length === 0) return new Set();
  const c = db();
  const { data: sts } = await c.from('payroll_daily_statements').select('run_id, generation_id, snapshot').in('payee_id', payeeIds).eq('state', 'OK').limit(5000);
  const runIds = [...new Set((sts ?? []).map((s) => s.run_id as string))].filter((id) => id !== exceptRunId);
  if (runIds.length === 0) return new Set();
  const { data: runs } = await c.from('payroll_runs').select('id, current_generation_id').in('id', runIds).eq('status', 'FINALIZED');
  const live = new Set((runs ?? []).map((r) => r.current_generation_id as string));
  const out = new Set<string>();
  for (const s of sts ?? []) if (live.has(s.generation_id as string)) for (const id of ((s.snapshot as { workIds?: string[] } | null)?.workIds ?? [])) out.add(id);
  return out;
}

// ── 일용 대장 ──
export async function loadDailyRuns(args: { practice: boolean; testViewer: boolean }): Promise<RunRow[]> {
  const { data, error } = await db().from('payroll_runs').select('id').eq('run_kind', 'DAILY').eq('is_test', args.practice).order('period_from', { ascending: false }).order('sequence', { ascending: false }).limit(60);
  if (error) boom('loadDailyRuns', error);
  const runs = (await Promise.all((data ?? []).map((r) => loadRun(r.id as string)))).filter((r): r is RunRow => !!r);
  return runs.filter((r) => !!r.title?.startsWith('e2e-') === args.testViewer);
}

/** 일용 대장 만들기 — 근무월 · 지급일. 한 달에 여러 번 만들 수 있다(차수) */
export async function createDailyRun(args: { month: string; payDate: string; practice: boolean; me: Me; requestId?: string }): Promise<{ id: string }> {
  const c = db();
  const from = `${args.month}-01`;
  const [y, m] = args.month.split('-').map(Number);
  const to = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const { data: prev } = await c.from('payroll_runs').select('sequence').eq('run_kind', 'DAILY').eq('period_from', from).eq('period_to', to).eq('is_test', args.practice).order('sequence', { ascending: false }).limit(1);
  const sequence = ((prev?.[0]?.sequence as number | undefined) ?? 0) + 1;
  // 검사 계정이 만든 대장은 제목으로 구분해 실제 목록에서 숨긴다(정규 대장과 같은 규칙)
  const { data, error } = await c.from('payroll_runs').insert({ run_kind: 'DAILY', title: isTestNo(args.me.employeeNo) ? 'e2e-일용' : null, period_from: from, period_to: to, pay_date: args.payDate, sequence, is_test: args.practice, created_by: args.me.id }).select('id').single();
  if (error?.code === '23505') throw new ApiError(409, 'payroll_run_exists');
  if (error || !data) boom('createDailyRun', error);
  await payrollAudit({ actorId: args.me.id, action: 'daily.run.create', table: 'payroll_runs', subjectId: data!.id as string, runId: data!.id as string, requestId: args.requestId, detail: { month: args.month, sequence } });
  return { id: data!.id as string };
}

const mustRun = async (id: string, expectedVersion: number, me: Me): Promise<RunRow> => {
  const run = await loadRun(id);
  if (!run || run.kind !== 'DAILY' || !!run.title?.startsWith('e2e-') !== isTestNo(me.employeeNo)) throw new ApiError(404, 'not_found');
  if (run.status === 'FINALIZED') throw new ApiError(409, 'payroll_finalized');
  if (run.version !== expectedVersion) throw new ApiError(409, 'payroll_run_conflict');
  return run;
};
const setRun = async (run: RunRow, patch: Row) => {
  const { data, error } = await db().from('payroll_runs').update({ ...patch, version: run.version + 1 }).eq('id', run.id).eq('version', run.version).select('id');
  if (error) boom('daily.setRun', error);
  if (!data?.length) throw new ApiError(409, 'payroll_run_conflict');
};

type Built = { payee: Payee; works: WorkRow[]; terms: DailyTerms | null; result: DailyResult }[];
/** 그 달의 근무 줄(무효 · 다른 확정 대장에 든 것 제외)을 대상자마다 묶어 계산한다 */
async function build(run: RunRow, me: Me): Promise<{ built: Built; inputHash: string }> {
  const { payees, engagements } = await loadPayees(isTestNo(me.employeeNo));
  const all = await loadWork({ month: run.periodFrom.slice(0, 7), practice: run.isTest, payeeIds: payees.map((p) => p.id) });
  const used = await finalizedWorkIds(payees.map((p) => p.id), run.id);
  const built: Built = [];
  for (const p of payees) {
    const works = all.filter((w) => w.payeeId === p.id && w.status !== 'VOID' && !used.has(w.id));
    if (works.length === 0) continue;
    // 적용 상태는 근무 줄이 가리키는 고용 기간에서. 줄마다 다른 기간이면 하나라도 「모름」이면 막는다
    const es = [...new Set(works.map((w) => w.engagementId))].map((id) => engagements.find((e) => e.id === id) ?? null);
    const pick = <K extends 'ei' | 'np' | 'hi'>(k: K): DailyTerms[K] => (es.some((e) => !e || e[k] === 'UNKNOWN') ? 'UNKNOWN' : es.some((e) => e![k] === 'YES') ? 'YES' : 'NO') as DailyTerms[K];
    const taxes = new Set(es.map((e) => e?.taxState ?? 'UNKNOWN'));
    const terms: DailyTerms = { taxState: taxes.size === 1 ? [...taxes][0] : 'UNKNOWN', ei: pick('ei'), np: pick('np'), hi: pick('hi') }; // 세금 적용이 줄마다 다르면 한 명세로 계산하지 않는다
    built.push({ payee: p, works, terms, result: calcDaily(works, terms) });
  }
  const inputHash = sha({ rule: DAILY_RULE, rows: built.map((b) => ({ p: b.payee.id, t: b.terms, w: b.works.map((w) => [w.id, w.version, w.status, w.quantity, w.dayRate, w.items]) })) });
  return { built, inputHash };
}

export async function calculateDaily(args: { id: string; expectedVersion: number; me: Me; requestId?: string }): Promise<{ ok: number; blocked: number }> {
  const c = db();
  const run = await mustRun(args.id, args.expectedVersion, args.me);
  const { built, inputHash } = await build(run, args.me);
  if (built.length === 0) throw new ApiError(409, 'daily_no_work');
  const { data: last } = await c.from('payroll_calculation_generations').select('seq').eq('run_id', run.id).order('seq', { ascending: false }).limit(1);
  const { data: gen, error: e1 } = await c.from('payroll_calculation_generations').insert({ run_id: run.id, seq: ((last?.[0]?.seq as number | undefined) ?? 0) + 1, input_hash: inputHash, engine_version: DAILY_RULE, created_by: args.me.id }).select('id').single();
  if (e1 || !gen) boom('calculateDaily.gen', e1);
  const rows = built.map(({ payee, works, terms, result: r }) => {
    const snapshot = { workIds: works.map((w) => w.id), terms, days: r.state === 'OK' ? r.days : [], warnings: r.warnings, rule: DAILY_RULE };
    return {
      generation_id: gen!.id, run_id: run.id, payee_id: payee.id, work_month: run.periodFrom, state: r.state, blockers: r.blockers.map((code) => ({ code })), snapshot,
      ...(r.state === 'OK' ? { work_days: r.workDays, gross_total: r.gross, taxable_total: r.taxable, nontax_total: r.nontax, income_tax: r.incomeTax, local_tax: r.localTax, other_deduction: r.otherDeduction, net_total: r.net } : {}),
      result_hash: sha({ payee: payee.id, r }),
    };
  });
  const ins = await c.from('payroll_daily_statements').insert(rows);
  const ok = built.filter((b) => b.result.state === 'OK').length;
  if (ins.error) {
    await c.from('payroll_calculation_generations').update({ state: 'FAILED', error_code: ins.error.code ?? 'insert', ended_at: new Date().toISOString() }).eq('id', gen!.id);
    boom('calculateDaily.statements', ins.error);
  }
  const sum = (k: 'gross' | 'net' | 'incomeTax' | 'localTax' | 'otherDeduction') => built.reduce((a, b) => a + (b.result.state === 'OK' ? b.result[k] : 0), 0);
  const fin = await c.from('payroll_calculation_generations').update({ state: 'SUCCEEDED', result_hash: sha(rows.map((r) => r.result_hash)), summary: { ok, blocked: built.length - ok }, ended_at: new Date().toISOString() }).eq('id', gen!.id);
  if (fin.error) boom('calculateDaily.done', fin.error);
  await setRun(run, { status: 'CALCULATED', current_generation_id: gen!.id, totals: { members: built.length, ok, blocked: built.length - ok, pay: String(sum('gross')), deduction: String(sum('incomeTax') + sum('localTax') + sum('otherDeduction')), net: String(sum('net')) } });
  await payrollAudit({ actorId: args.me.id, action: 'daily.run.calculate', table: 'payroll_runs', subjectId: run.id, runId: run.id, requestId: args.requestId, detail: { ok, blocked: built.length - ok } });
  return { ok, blocked: built.length - ok };
}

/** 검토 · 확정 전에: 계산돼 있고, 막힌 사람이 없고, 계산한 뒤 근무 줄이 바뀌지 않았어야 한다 */
async function ready(run: RunRow, me: Me): Promise<void> {
  if (!run.generationId) throw new ApiError(409, 'payroll_not_calculated');
  const c = db();
  const [{ count }, { data: gen }, { inputHash }] = await Promise.all([
    c.from('payroll_daily_statements').select('id', { count: 'exact', head: true }).eq('generation_id', run.generationId).eq('state', 'BLOCKED'),
    c.from('payroll_calculation_generations').select('input_hash').eq('id', run.generationId).maybeSingle(),
    build(run, me),
  ]);
  if ((count ?? 0) > 0) throw new ApiError(409, 'payroll_has_blocked');
  if (!gen || gen.input_hash !== inputHash) throw new ApiError(409, 'payroll_stale');
}
export async function reviewDaily(args: { id: string; expectedVersion: number; me: Me; requestId?: string }): Promise<void> {
  const run = await mustRun(args.id, args.expectedVersion, args.me);
  if (run.status !== 'CALCULATED') throw new ApiError(409, 'payroll_wrong_status');
  await ready(run, args.me);
  await setRun(run, { status: 'REVIEWED', reviewed_by: args.me.id, reviewed_at: new Date().toISOString() });
  await payrollAudit({ actorId: args.me.id, action: 'daily.run.review', table: 'payroll_runs', subjectId: run.id, runId: run.id, requestId: args.requestId });
}
export async function finalizeDaily(args: { id: string; expectedVersion: number; me: Me; requestId?: string }): Promise<void> {
  const run = await mustRun(args.id, args.expectedVersion, args.me);
  if (run.status !== 'REVIEWED') throw new ApiError(409, 'payroll_wrong_status');
  await ready(run, args.me);
  await setRun(run, { status: 'FINALIZED', finalized_by: args.me.id, finalized_at: new Date().toISOString() });
  await payrollAudit({ actorId: args.me.id, action: 'daily.run.finalize', table: 'payroll_runs', subjectId: run.id, runId: run.id, requestId: args.requestId });
}

export type DailyLine = { payeeId: string; name: string; internalNo: string; state: 'OK' | 'BLOCKED'; blockers: string[]; warnings: string[]; workDays: number | null; gross: number | null; taxable: number | null; nontax: number | null; incomeTax: number | null; localTax: number | null; otherDeduction: number | null; net: number | null; days: { workDate: string; gross: number; incomeTax: number; localTax: number; deduction: number }[] };
export async function loadDailyBoard(id: string, me: Me): Promise<{ run: RunRow; lines: DailyLine[]; stale: boolean } | null> {
  const run = await loadRun(id);
  if (!run || run.kind !== 'DAILY' || !!run.title?.startsWith('e2e-') !== isTestNo(me.employeeNo)) return null;
  if (!run.generationId) return { run, lines: [], stale: false };
  const c = db();
  const [{ data: sts }, { data: payees }, { data: gen }] = await Promise.all([
    c.from('payroll_daily_statements').select('*').eq('generation_id', run.generationId),
    c.from('payroll_payees').select('id, name, internal_no'),
    c.from('payroll_calculation_generations').select('input_hash').eq('id', run.generationId).maybeSingle(),
  ]);
  const who = new Map((payees ?? []).map((p) => [p.id as string, p]));
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  const lines = ((sts ?? []) as Row[]).map((s): DailyLine => {
    const snap = (s.snapshot ?? {}) as { days?: DailyLine['days']; warnings?: string[] };
    return {
      payeeId: s.payee_id as string, name: (who.get(s.payee_id as string)?.name as string) ?? '', internalNo: (who.get(s.payee_id as string)?.internal_no as string) ?? '', state: s.state as DailyLine['state'], blockers: ((s.blockers ?? []) as { code: string }[]).map((b) => b.code), warnings: snap.warnings ?? [],
      workDays: n(s.work_days), gross: n(s.gross_total), taxable: n(s.taxable_total), nontax: n(s.nontax_total), incomeTax: n(s.income_tax), localTax: n(s.local_tax), otherDeduction: n(s.other_deduction), net: n(s.net_total), days: snap.days ?? [],
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
  // 확정한 대장은 그대로다. 그 전에는 계산한 뒤 근무 줄이 바뀌었는지 본다
  const stale = run.status === 'FINALIZED' ? false : (await build(run, me)).inputHash !== gen?.input_hash;
  return { run, lines, stale };
}
