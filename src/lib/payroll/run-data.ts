// 급여대장 — 만들기 · 계산 · 검토 · 확정 · 조정 (PRD v1.3 8 · 18.3 · 19장). 서버 전용 — 부르는 쪽이 먼저 급여 담당자인지 확인한다(requirePayroll).
// 계산은 순수 계산 모듈(engine)이 한다. 여기는 근태 마감 · 계약 · 세무 · 개인 항목 · 회사 정책 · 승인된 기준 자료를 읽어 입력으로 만들고, 결과를 계산 세대로 쌓는다.
// ★ 근태는 읽기만 한다(연장 요청을 맞추는 쓰기를 하지 않는다). 마감된 달만 계산에 쓴다 — 마감하지 않은 직원은 「차단」이다.
// ★ 다시 계산하면 새 계산 세대가 생긴다. 실패한 계산은 앞의 성공한 결과를 덮지 않는다. 확정한 대장은 DB가 바꾸지 못하게 막는다(0037).
// ★ 검토 · 확정할 때 입력을 다시 읽어, 계산한 뒤에 바뀐 것이 있으면(오래됨) 막는다.
import { fillState, NO_RELIEFS, synthTax } from './tax-defaults';
import { applyCompMinutes } from './comp-time';
import { compMinutesFor } from './overtime-comp';
import 'server-only';
import { readAll } from '@/lib/read-all';
import { atomicRpc } from '@/lib/atomic-rpc';
import { addDays, weekStartOf } from '@/lib/calendar';
import { approvedMinutes } from '@/lib/overtime';
import { OFFICE } from '@/config/office';
import { ApiError } from '@/lib/api';
import type { Me } from '@/lib/auth';
import { confirmKey, loadConfirms } from '@/lib/confirm-data';
import { summarizeMonth } from '@/lib/monthly';
import { daysFor, leaveDaysFor, loadPeriod, workDaysFor } from '@/lib/period-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';
import { INSURERS, reliefCovers, reliefsForMonth, versionAt } from './contract';
import { mergeAssigned } from './common-items';
import { loadCommonItems, loadItems, loadTaxDefaults, loadPolicies, loadReferences, loadSettingHistory, reliefSwitches, sha } from './data';
import { canonicalItemCode } from './engine/reserved-items';
import { leaveDurationMismatch, scheduledMinutes } from './engine/scheduled-attendance';
import { roundedAttendance } from './engine/rounded-attendance';
import { timeFromAttendance } from './engine/attendance';
import { restAndHolidayMinutes } from './engine/weekly-rest';
import { calculateStatement, ENGINE_VERSION, type Blocker, type EngineInput, type EngineItem, type EngineOverride, type EngineResult, type Withholding } from './engine/engine';
import { makeWithholding, referenceFrom, TEMP_INSURANCE_ROUNDING } from './engine/inputs';
import { asChildRule, asTaxRules, pickAt, type ReferenceKind, type TaxBand } from './reference';
import { DEFAULT_LEDGER, INSURER_KEYS, payDateFor, type AllowancePolicy, type InsurerKey, type Ledger } from './settings';
import { loadStaffPay, payrollAudit, type ContractRow, type TaxRow } from './staff-data';
import { syncMonth } from './pension-data';

const db = () => createAdminClient();
type Row = Record<string, unknown>;
const fail = (where: string, e: { code?: string; message?: string } | null): never => {
  if (e?.code === 'P0001' && ['payroll_duplicate_payment','payroll_stale','payroll_has_blocked','payroll_not_calculated'].includes(e.message ?? '')) throw new ApiError(409, e.message!);
  if (e?.code === 'PR001') throw new ApiError(409, 'payroll_finalized');
  if (e?.code === 'PR002' || e?.code === 'PR003' || e?.code === '23505') throw new ApiError(409, 'payroll_run_conflict'); // 다른 담당자가 먼저 바꿨다
  throw new Error(`${where}: ${e?.code ?? 'unknown'}`);
};
const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
const prevDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);

export type RunStatus = 'DRAFT' | 'CALCULATED' | 'REVIEWED' | 'FINALIZED';
export type RunRow = { id: string; kind: 'REGULAR' | 'BONUS' | 'DAILY'; title: string | null; periodFrom: string; periodTo: string; payDate: string; sequence: number; isTest: boolean; revision: number; status: RunStatus; version: number; generationId: string | null; totals: Record<string, string | number>; createdBy: string; createdAt: string; reviewedBy: string | null; reviewedAt: string | null; finalizedBy: string | null; finalizedAt: string | null; supersedesId: string | null; correctionReason: string | null };
const toRun = (r: Row): RunRow => ({
  id: r.id as string, kind: r.run_kind as RunRow['kind'], title: r.title as string | null, periodFrom: r.period_from as string, periodTo: r.period_to as string, payDate: r.pay_date as string, sequence: r.sequence as number, isTest: r.is_test as boolean, revision: r.revision as number,
  status: r.status as RunStatus, version: r.version as number, generationId: r.current_generation_id as string | null, totals: (r.totals ?? {}) as RunRow['totals'], createdBy: r.created_by as string, createdAt: r.created_at as string,
  reviewedBy: r.reviewed_by as string | null, reviewedAt: r.reviewed_at as string | null, finalizedBy: r.finalized_by as string | null, finalizedAt: r.finalized_at as string | null, supersedesId: r.supersedes_id as string | null, correctionReason: r.correction_reason as string | null,
});

export async function loadRuns(practice: boolean): Promise<RunRow[]> {
  // 검사가 만든 대장(제목 e2e-)은 읽을 때부터 뺀다 — 뒤에서 거르면 검사 대장이 60개 자리를 차지해 실제 대장이 목록에서 사라졌다 (2026-10-14)
  const { data, error } = await db().from('payroll_runs').select('*').eq('is_test', practice).neq('run_kind', 'DAILY').or('title.is.null,title.not.like.e2e-%').order('period_from', { ascending: false }).order('revision', { ascending: false }).limit(60); // 일용 대장은 일용직 화면에서 따로 본다
  if (error) fail('loadRuns', error);
  // 검사가 만든 대장(제목이 e2e-로 시작)은 목록에 보이지 않는다 — 검사 전용 계정을 숨기는 것과 같은 규칙
  return (data ?? []).map(toRun).filter((r) => !r.title?.startsWith('e2e-'));
}
/** 한 직원의 지급 이력 — 확정된 대장(정정되어 대체된 판은 빼고)마다 지급 · 공제 · 실수령. 새 달부터 (미팅 2026-10-15 「급여 히스토리」) */
export type PayHistoryRow = { runId: string; kind: RunRow['kind']; title: string | null; periodFrom: string; payDate: string; revision: number; pay: number; deduction: number; net: number };
export async function loadPayHistory(employeeId: string, practice: boolean, limit = 24): Promise<PayHistoryRow[]> {
  const c = db();
  const { data: runs, error } = await c.from('payroll_runs').select('*').eq('is_test', practice).eq('status', 'FINALIZED').or('title.is.null,title.not.like.e2e-%').order('period_from', { ascending: false }).limit(200);
  if (error) fail('loadPayHistory.runs', error);
  const all = (runs ?? []).map(toRun);
  const replaced = new Set(all.map((r) => r.supersedesId).filter(Boolean));
  const live = all.filter((r) => !replaced.has(r.id) && r.generationId);
  if (live.length === 0) return [];
  const { data: sts, error: e2 } = await c.from('payroll_statements').select('generation_id, pay_total, deduction_total, net_total').eq('employee_id', employeeId).in('generation_id', live.map((r) => r.generationId!));
  if (e2) fail('loadPayHistory.statements', e2);
  const byGen = new Map((sts ?? []).map((x) => [x.generation_id as string, x]));
  return live.flatMap((r) => {
    const x = byGen.get(r.generationId!);
    if (!x) return [];
    return [{ runId: r.id, kind: r.kind, title: r.title, periodFrom: r.periodFrom, payDate: r.payDate, revision: r.revision, pay: Number(x.pay_total ?? 0), deduction: Number(x.deduction_total ?? 0), net: Number(x.net_total ?? 0) }];
  }).slice(0, limit);
}
/** 그 달 · 그 종류 대장의 가장 새 판 id — 「이미 있는 대장 열기」. 실제 관리자에게는 검사 대장(제목 e2e-)을 열어 주지 않는다 */
export async function findRun(args: { practice: boolean; kind: 'REGULAR' | 'BONUS'; from: string; test: boolean }): Promise<string | null> {
  let q = db().from('payroll_runs').select('id, title').eq('is_test', args.practice).eq('run_kind', args.kind).eq('period_from', args.from);
  if (!args.test) q = q.or('title.is.null,title.not.like.e2e-%');
  const { data, error } = await q.order('revision', { ascending: false }).order('created_at', { ascending: false }).limit(1);
  if (error) fail('findRun', error);
  return (data?.[0]?.id as string | undefined) ?? null;
}
export async function loadRun(id: string): Promise<RunRow | null> {
  const { data, error } = await db().from('payroll_runs').select('*').eq('id', id).maybeSingle();
  if (error) fail('loadRun', error);
  return data ? toRun(data) : null;
}

async function ledger(asOf: string): Promise<Ledger> {
  return ((await loadSettingHistory('ledger')).find((x) => x.validFrom <= asOf && (x.validTo === null || asOf < x.validTo))?.payload as Ledger | undefined) ?? DEFAULT_LEDGER;
}

/**
 * 그 달의 정규 대장을 만든다(초안). 연습/운영은 서버가 정한다.
 * 대상: 켜져 있는 직원 + 그 달에 걸친 계약이 있는 직원(퇴사자 포함). 기록이 없다는 이유로 빼지 않는다. 뺄 때는 사유를 적어 따로 뺀다.
 */
export async function createRun(args: { ym: string; kind?: 'REGULAR' | 'BONUS'; payDate?: string; title?: string | null; practice: boolean; me: Me; requestId?: string }): Promise<RunRow> {
  const c = db();
  const from = `${args.ym}-01`;
  const [y, m] = args.ym.split('-').map(Number);
  const to = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const l = await ledger(prevDay(to));
  const [{ data: people }, { data: cons }] = await Promise.all([
    c.from('profiles').select('id, employee_no, active'),
    c.from('payroll_contract_versions').select('employee_id, valid_from, valid_to').eq('status', 'active').lt('valid_from', to),
  ]);
  const contracted = new Set((cons ?? []).filter((x) => x.valid_to === null || (x.valid_to as string) > from).map((x) => x.employee_id as string));
  // 시스템관리자는 직원이 아니라 급여 대상이 아니다 (2026-10-26 의뢰인)
  const members = (people ?? []).filter((p) => p.employee_no !== OFFICE.ownerEmployeeNo && (contracted.has(p.id as string) || (p.active && !(p.employee_no as string | null)?.startsWith('e2e-')))).map((p) => p.id as string);
  if (members.length === 0) throw new ApiError(409, 'payroll_no_members');
  const kind = args.kind ?? 'REGULAR';
  // 상여는 한 달에 여러 번 줄 수 있다 — 차수를 올린다. 정규 대장은 한 달에 하나(정정은 판 번호로)
  let sequence = 1;
  if (kind === 'BONUS') {
    const { data: prev } = await c.from('payroll_runs').select('sequence').eq('run_kind', 'BONUS').eq('period_from', from).eq('period_to', to).eq('is_test', args.practice).order('sequence', { ascending: false }).limit(1);
    sequence = ((prev?.[0]?.sequence as number | undefined) ?? 0) + 1;
  }
  const { data, error } = await c.from('payroll_runs').insert({ run_kind: kind, title: args.title ?? null, period_from: from, period_to: to, pay_date: args.payDate ?? payDateFor(args.ym, l), sequence, is_test: args.practice, created_by: args.me.id }).select('*').single();
  if (error?.code === '23505') throw new ApiError(409, 'payroll_run_exists');
  if (error || !data) fail('createRun', error);
  const ins = await c.from('payroll_run_members').insert(members.map((id) => ({ run_id: data!.id, employee_id: id })));
  if (ins.error) fail('createRun.members', ins.error);
  await payrollAudit({ actorId: args.me.id, action: 'run.create', table: 'payroll_runs', subjectId: data!.id as string, runId: data!.id as string, requestId: args.requestId, detail: { month: args.ym, kind, sequence, members: members.length, practice: args.practice } });
  return toRun(data!);
}

// ── 계산 입력 만들기 ──
type MemberInput = { employeeId: string; input: Omit<EngineInput, 'withholding'>; pre: Blocker[]; notes: Blocker[]; closeId: string | null; contractId: string | null; taxId: string | null; snapshot: Row };
type Built = { unverified: string[]; members: MemberInput[]; withholding: Withholding | null; bundle: Record<string, { id: string; hash: string }>; missing: ReferenceKind[]; inputHash: string };
const REF_KINDS: ReferenceKind[] = ['pension.rate', 'pension.limit', 'health.rate', 'health.limit', 'ltc.rate', 'employment.rate', 'income-tax.table', 'income-tax.child-adjust'];

async function loadBands(referenceId: string): Promise<TaxBand[]> {
  const { data } = await readAll((a,b) => db().from('payroll_tax_rows').select('wage_from, wage_to, family_count, base_tax').eq('reference_version_id', referenceId).order('wage_from').order('family_count').range(a,b));
  const by = new Map<number, TaxBand>();
  for (const row of data) {
    const from = Number(row.wage_from);
    const band = by.get(from) ?? { wageFrom: from, wageTo: row.wage_to === null ? null : Number(row.wage_to), taxes: [] };
    band.taxes[(row.family_count as number)-1] = Number(row.base_tax);
    by.set(from,band);
  }
  const bands = [...by.values()].sort((a,b) => a.wageFrom-b.wageFrom);
  if (bands.some((b) => b.taxes.length!==11 || Array.from({length:11},(_,i)=>b.taxes[i]).some((t)=>!Number.isFinite(t)))) throw new ApiError(409,'payroll_reference_incomplete');
  return bands;
}

/** 그 날에 적용되는 회사 정책 · 승인된 기준 자료 · 지급/공제 항목 — 대장 계산과 예상 미리 보기가 같이 쓴다 */
export async function loadCalcBasis(last: string) {
  const ledgerRow = (await loadSettingHistory('ledger')).find((x) => x.validFrom <= last && (x.validTo === null || last < x.validTo));
  const [items, policies, refs, l, mins] = await Promise.all([loadItems(undefined, last), loadPolicies('allowance.', last), loadReferences(REF_KINDS, ['APPROVED']), ledger(last), loadReferences(['minimum-wage'], ['APPROVED'])]);
  const minRef = pickAt(mins, last);
  const minimumHourly = typeof (minRef?.payload as { hourly?: unknown } | undefined)?.hourly === 'number' ? ((minRef!.payload as { hourly: number }).hourly) : null;
  // 회사 정책 · 기준 자료 (귀속 기간의 마지막 날에 적용되는 것)
  const premium = (kind: string, key: keyof AllowancePolicy = 'premium') => {
    const p = policies.find((x) => x.kind === `allowance.${kind}` && x.inUse);
    const v = (p?.payload as AllowancePolicy | undefined)?.[key];
    return typeof v === 'string' ? v : null;
  };
  const policy: EngineInput['policy'] = { deductUnpaidLeave: l.deductUnpaidLeave ?? false, deductLateness: l.deductLateness ?? false, overtimePremium: premium('overtime'), nightPremium: premium('night'), holidayPremium: premium('holiday'), holidayOver8Premium: premium('holiday', 'premiumOver8h'), rounding: { pay: { mode: 'HALF_UP', unit: 1 }, insurance: TEMP_INSURANCE_ROUNDING.contribution } };
  const refAt = (kind: ReferenceKind) => pickAt(refs.filter((r) => r.kind === kind), last);
  const bundle: Record<string, { id: string; hash: string }> = {};
  const payloads: Parameters<typeof referenceFrom>[0] = {};
  for (const k of REF_KINDS) {
    const r = refAt(k);
    if (r) {
      bundle[k] = { id: r.id, hash: r.payloadHash };
      payloads[k] = r.payload;
    }
  }
  const { reference, missing } = referenceFrom(payloads);
  // 사원급여 기본 설정의 「두루누리 · 중소기업 감면 사용」 (그 날 적용되는 판). 꺼져 있으면 직원별 감면을 보지 않는다
  const reliefOn = await reliefSwitches(last);
  const table = refAt('income-tax.table');
  const rules = asTaxRules(table?.payload);
  const withholding = table && rules ? makeWithholding({ bands: await loadBands(table.id), rules, childRule: asChildRule(refAt('income-tax.child-adjust')?.payload) }) : null;
  const toEngine = (v: Ledger['insuranceBasis']) => (v === 'REPORTED_BASE' ? 'REPORTED' : v) as EngineInput['insuranceBasis'];
  const insuranceBasis = toEngine(l.insuranceBasis);
  // 보험마다 따로 고른 기준 (2026-10-20). 비어 있으면 모든 보험이 기본 기준
  const insuranceBasisOf: NonNullable<EngineInput['insuranceBasisOf']> = {};
  for (const [k, v] of Object.entries(l.insuranceBasisOf ?? {})) if (v) insuranceBasisOf[k as InsurerKey] = toEngine(v);
  const taxDefaults = await loadTaxDefaults(last); // 4대보험 · 세무 회사 기본값 (2026-10-25)
  const defaultRatio = (l.withholdingRatio ?? 100) as 80 | 100 | 120;
  return { taxDefaults, defaultRatio, ledgerRow, policies, refs, premiumTimeBasis: l.premiumTimeBasis ?? 'ACTUAL', items, policy, reference, missing, bundle, withholding, insuranceBasis, insuranceBasisOf, reliefOn, minimumHourly };
}

async function buildInputs(run: RunRow): Promise<Built> {
  const c = db();
  const from = run.periodFrom, last = prevDay(run.periodTo), ym = from.slice(0, 7);
  const [{ data: mem }, { data: cons }, { data: taxes }, { data: assigns }, { data: closes }, { data: ovs }, { data: people }, { data: emps }, basis, period, confirms] = await Promise.all([
    readAll((a,b) => c.from('payroll_run_members').select('employee_id, inclusion_state').eq('run_id', run.id).order('id').range(a,b)),
    readAll((a,b) => c.from('payroll_contract_versions').select('*').eq('status', 'active').order('id').range(a,b)),
    readAll((a,b) => c.from('payroll_employee_tax_versions').select('*').eq('status', 'active').order('id').range(a,b)),
    readAll((a,b) => c.from('payroll_employee_items').select('*').eq('active', true).order('id').range(a,b)),
    readAll((a,b) => c.from('attendance_closes').select('id, employee_id, input_hash').eq('state', 'CLOSED').eq('is_test', run.isTest).eq('period_from', from).eq('period_to', run.periodTo).order('id').range(a,b)),
    readAll((a,b) => c.from('payroll_statement_overrides').select('id, employee_id, item_code, kind, proposed_amount').eq('run_id', run.id).eq('active', true).order('id').range(a,b)),
    readAll((a,b) => c.from('profiles').select('id, name, employee_no, joined_on').order('id').range(a,b)),
    readAll((a,b) => c.from('staff_employment_periods').select('employee_id, starts_on, ends_on').eq('active', true).order('id').range(a,b)),
    loadCalcBasis(last),
    loadPeriod(from, last, run.isTest),
    loadConfirms(from, last, run.isTest),
  ]);
  const { items, policy, reference, missing, bundle, withholding, insuranceBasis, insuranceBasisOf, reliefOn, minimumHourly } = basis;
  const common = await loadCommonItems(last); // 회사 공통 고정 수당 · 공제 (2026-10-25)
  const basisOf = (k: InsurerKey) => insuranceBasisOf[k] ?? insuranceBasis;
  const anyNotice = insuranceBasis === 'NOTICE' || INSURER_KEYS.some((k) => basisOf(k) === 'NOTICE');

  const noticeInputs = anyNotice ? await loadNoticeInputs(run) : new Map<string, { notices: EngineInput['notices']; blockers: Blocker[] }>();
  const bonus = run.kind === 'BONUS';
  const priorOf = bonus ? await loadPrior(run) : null;
  const exemptYtd = await loadExemptYtd(run); // 같은 해 앞서 확정한 명세의 항목별 비과세 합계 (2026-10-19)
  const comp = bonus ? new Map<string, number>() : await compMinutesFor(ym, run.isTest); // 보상휴가로 돌린 연장(분) — 연장수당에서 뺀다 (2026-10-19, 묶음 29)

  const contracts = (cons ?? []) as Row[];
  const taxRows = (taxes ?? []) as Row[];
  const itemAt = (code: string) => items.find((x) => x.code === code && x.inUse && x.validFrom <= last) ?? null;
  const now = new Date();
  const today = toKstDate(now);
  const members: MemberInput[] = [];
  const ownerId = (people ?? []).find((p) => p.employee_no === OFFICE.ownerEmployeeNo)?.id; // 시스템관리자는 이미 만든 대장에 들어 있어도 계산하지 않는다 (2026-10-26)
  for (const m of (mem ?? []).filter((x) => x.inclusion_state === 'INCLUDED' && x.employee_id !== ownerId).sort((a, b) => String(a.employee_id).localeCompare(String(b.employee_id)))) {
    const id = m.employee_id as string;
    const pre: Blocker[] = [];
    const notes: Blocker[] = []; // 계산은 되지만 담당자가 알아야 하는 것
    const person = (people ?? []).find((p) => p.id === id);
    const conRows = contracts.filter((x) => x.employee_id === id).map((x) => ({ ...x, validFrom: x.valid_from as string, validTo: x.valid_to as string | null }));
    const con = versionAt(conRows, last) as (Row & { validFrom: string }) | null;
    const taxRow = versionAt(taxRows.filter((x) => x.employee_id === id).map((x) => ({ ...x, validFrom: x.valid_from as string, validTo: x.valid_to as string | null })), last) as Row | null;
    const inc = ((con?.included ?? {}) as Row) ?? {};
    const contract: EngineInput['contract'] = con ? { payType: con.pay_type as ContractRow['payType'], amount: Number(con.amount), monthlyHours: con.monthly_hours === null ? null : Number(con.monthly_hours), annualDivisor: con.annual_divisor === null ? null : Number(con.annual_divisor), included: { overtimeHours: inc.overtimeHours == null ? null : Number(inc.overtimeHours), holidayHours: inc.holidayHours == null ? null : Number(inc.holidayHours) } } : null;
    const ins = ((taxRow?.insurance ?? {}) as Record<string, { state?: string; reportedWage?: number | null }>) ?? {};
    const dd = basis.taxDefaults?.defaults ?? null;
    const one = (k: string) => ({ state: fillState((ins[k]?.state ?? 'UNKNOWN') as TaxRow['insurance']['pension']['state'], k as 'pension' | 'health' | 'employment' | 'accident', dd), reportedWage: ins[k]?.reportedWage ?? null });
    const loan = (taxRow?.student_loan ?? {}) as { state?: string; monthlyAmount?: number | null; from?: string | null; to?: string | null };
    // 감면 · 지원: 회사가 켠 것만, 그 달에 걸치는 기간만. 상여 대장은 소득세 감면만 본다(보험은 상여에서 계산하지 않는다)
    const rel = taxRow ? reliefsForMonth(taxRow.reliefs, reliefOn, from, last) : dd ? reliefsForMonth(NO_RELIEFS, reliefOn, from, last) : null;
    if (rel) pre.push(...rel.blockers);
    const tax: EngineInput['tax'] = taxRow ? { withholdingRatio: taxRow.withholding_ratio as 80 | 100 | 120, familyCount: taxRow.family_count as number, childCount: taxRow.child_count as number, insurance: { pension: one('pension'), health: one('health'), employment: one('employment'), accident: one('accident') }, studentLoan: loanForMonth(loan, from, last), reliefs: rel!.reliefs } : dd ? { ...synthTax(dd, basis.defaultRatio), reliefs: rel!.reliefs } : null;
    // 달 중간에 입사 · 퇴사했거나 계약이 달 중간에 시작됐으면 일할 계산이 필요하다 — 자동으로 나누지 않는다
    const joined = (person?.joined_on as string | null) ?? null;
    const left = (emps ?? []).filter((e) => e.employee_id === id && e.ends_on !== null && (e.ends_on as string) >= from && (e.ends_on as string) < last);
    const partialMonth = !bonus && ((!!joined && joined > from && joined <= last) || left.length > 0 || (!!con && con.validFrom > from));
    // 근태: 마감한 달만
    const close = (closes ?? []).find((x) => x.employee_id === id);
    let time: EngineInput['time'] = null;
    let facts: Row | null = null;
    if (close && contract && !bonus) {
      if (!period.rule) pre.push({ code: 'no_work_rule' });
      else {
        const p = period.people.find((x) => x.id === id);
        const s = summarizeMonth({
          employeeNo: (person?.employee_no as string | null) ?? null, name: (person?.name as string) ?? '', yearMonth: ym, days: daysFor(period, id, from, last),
          requests: period.overtime.filter((o) => o.employeeId === id).map((o) => ({ ...o })),
          pendingCorrections: period.corrections.filter((x) => x.employeeId === id && x.status === 'pending' && x.workDate >= from && x.workDate <= last).length,
          rule: period.ruleFor(id, last) ?? period.rule, ruleAt: (d) => period.ruleFor(id, d), joinedOn: p?.startsOn ?? null, now, today, thresholdMinutes: OFFICE.overtimeReviewThresholdMin,
          leave: leaveDaysFor(period, id), work: workDaysFor(period, id),
          confirmed: new Set([...confirms.values()].filter((x) => x.employeeId === id).map((x) => x.workDate)),
        });
        const num = (k: keyof typeof s.row) => Number(s.row[k] ?? 0);
        const att = {
          regularMinutes: num('regular_minutes'), netMinutes: s.netMinutes, payableMinutes: s.payableMinutes,
          approved: { overtime: num('approved_overtime_minutes'), night: num('approved_night_minutes'), holidayWithin8: num('approved_holiday_within8_minutes'), holidayOver8: num('approved_holiday_over8_minutes') },
          // 확인 기준(30분) 미만이라 승인 대기에 오르지 않은 연장은 막지 않는다 — 승인할 길이 없어 영영 계산이 막혔다 (2026-10-14 모의 운영 검사에서 발견).
          // 인정하지 않은 시간이라 연장 수당에 넣지 않고, 명세에 「참고」로 남긴다 (결정 사항 개발-31, 임시)
          pendingMinutes: num('pending_overtime_minutes') + num('pending_night_minutes') + num('pending_holiday_minutes'),
          pendingDates: s.pendingDays.map((d) => d.date.slice(5)),
          unreviewedMinutes: num('unreviewed_overtime_minutes'),
          unpaidLeaveDays: num('unpaid_leave_days'), lateMinutes: num('late_minutes'), paidLeaveDays: s.paidLeaveDays, flags: String(s.row.flags ?? '').split(';').map((x) => x.trim()).filter(Boolean), unconfirmedDays: s.unconfirmedDates.length,
        };
        const rounded = roundedAttendance(daysFor(period, id, weekStartOf(from), last), (d) => period.ruleFor(id, d) ?? period.rule!);
        const roundedFacts = { regularMinutes: 0, approved: { overtime: 0, night: 0, holidayWithin8: 0, holidayOver8: 0 } };
        for (const [date, day] of rounded) {
          if (date < from || date > last || !confirms.has(confirmKey(id, date))) continue;
          roundedFacts.regularMinutes += day.regularMinutes;
          const request = period.overtime.find((o) => o.employeeId === id && o.workDate === date);
          const allowed = request ? approvedMinutes(request) : { overtime: 0, night: 0, holidayWithin8: 0, holidayOver8: 0 };
          roundedFacts.approved.overtime += Math.min(allowed.overtime, day.overtimeMinutes);
          roundedFacts.approved.night += Math.min(allowed.night, day.nightMinutes);
          roundedFacts.approved.holidayWithin8 += Math.min(allowed.holidayWithin8, day.holidayWithin8Minutes);
          roundedFacts.approved.holidayOver8 += Math.min(allowed.holidayOver8, day.holidayOver8Minutes);
        }
        const leaveDays = leaveDaysFor(period, id);
        let scheduleMinutes = 0;
        const unconfirmedSchedule = new Set(s.unconfirmedDates);
        for (let date = from; date <= last; date = addDays(date, 1)) {
          const minutes = scheduledMinutes(period.planFor(id, date), date, leaveDays.get(date));
          scheduleMinutes += minutes;
          // 일정 기준 지급(SCHEDULE)에서만 휴가 시간이 지급 시간에 바로 쓰인다 — 그 밖의 계약은 막지 않는다 (2026-10-15)
          if (con!.time_basis === 'SCHEDULE' && leaveDurationMismatch(period.planFor(id, date), date, leaveDays.get(date) ?? [])) pre.push({ code: 'leave_duration_mismatch', detail: date });
          if (con!.time_basis === 'SCHEDULE' && minutes > 0 && !confirms.has(confirmKey(id, date))) unconfirmedSchedule.add(date);
        }
        const attendance = { ...att, rounded: roundedFacts, scheduleMinutes, unconfirmedDays: unconfirmedSchedule.size };
        facts = attendance;
        const t = timeFromAttendance(attendance, (con!.time_basis as 'ACTUAL' | 'ROUNDED' | 'SCHEDULE') ?? 'ACTUAL', contract.payType, 480, basis.premiumTimeBasis);
        time = t.time;
        // 보상휴가로 돌린 연장은 돈으로 주지 않는다 — 인정 연장과 일한 시간에서 같이 뺀다(정규 시간은 그대로). 돌린 분이 인정 연장보다 많으면 막는다
        const converted = comp.get(id) ?? 0;
        if (time && converted > 0) {
          const c2 = applyCompMinutes(time, converted);
          if (c2.exceeds) pre.push({ code: 'comp_exceeds_overtime', detail: `${converted} > ${time.overtimeMinutes}` });
          else {
            time = c2.time;
            notes.push({ code: 'overtime_comp_leave', detail: String(Math.round((converted / 60) * 100) / 100) });
          }
        }
        // 명세서의 근로일수: 확정한 날 가운데 일한 시간이 있는 날
        const workDays = daysFor(period, id, from, last).filter((d) => d.netMinutes > 0 && confirms.has(confirmKey(id, d.workDate))).length;
        if (time) time = { ...time, workDays };
        // 시급제의 주휴 · 유급휴일 (2026-10-16 의뢰인 — 회사 대장의 「주차」 · 「유휴」). 재직 기간만 센다
        if (time && contract.payType === 'HOURLY') {
          const leftOn = left.map((e) => e.ends_on as string).sort()[0] ?? null;
          const r = restAndHolidayMinutes({ from, last, startsOn: p?.startsOn ?? joined, endsOn: leftOn, ruleAt: (d) => period.ruleFor(id, d) ?? period.rule, holidays: period.holidays });
          time = { ...time, weeklyRestMinutes: r.weeklyRestMinutes, paidHolidayMinutes: r.paidHolidayMinutes };
          // 결근한 주의 주휴를 뺄지는 아직 정하지 않았다(결정 사항 급여-41) — 빼지 않고 담당자가 보게 남긴다
          if (s.absentDates.length) notes.push({ code: 'weekly_rest_with_absence', detail: s.absentDates.join(', ') });
        }
        pre.push(...t.blockers);
        if (att.unreviewedMinutes > 0) notes.push({ code: 'overtime_unreviewed', detail: String(att.unreviewedMinutes) });
      }
    }
    // 개인 항목 (그 달 마지막 날에 붙어 있는 것)
    const engineItems: EngineItem[] = [];
    // 상여 대장에는 매달 붙는 개인 항목을 넣지 않는다 — 상여 금액은 조정(직접 넣는 지급)으로만 들어온다
    const personalNow = ((assigns ?? []) as Row[]).filter((x) => x.employee_id === id && (x.valid_from as string) <= last && (x.valid_to === null || (x.valid_to as string) > last)).map((x) => ({ itemCode: x.item_code as string, amount: x.amount === null ? null : Number(x.amount) }));
    for (const a of bonus ? [] : mergeAssigned(personalNow, common, id, contract?.payType)) {
      const it = itemAt(a.itemCode);
      if (!it) { pre.push({ code: 'item_missing', detail: a.itemCode }); continue; }
      const amount = a.amount === null ? it.defaultAmount : a.amount;
      if (amount === null) { pre.push({ code: 'item_amount_missing', detail: it.code }); continue; }
      const taxable = it.taxTreatment === 'EXEMPT' ? 'EXEMPT' : it.taxTreatment === 'PARTIAL' ? 'PARTIAL' : 'TAXABLE';
      engineItems.push({ code: it.code, kind: it.kind, label: it.koName, amount, taxable, exemptLimit: it.taxExemptLimit, exemptAnnualLimit: it.taxExemptAnnualLimit ?? null, insurable: taxable !== 'EXEMPT', ordinaryWage: it.ordinaryWage, itemVersionId: it.id });
    }
    const overrides: EngineOverride[] = ((ovs ?? []) as Row[]).filter((o) => o.employee_id === id).map((o) => ({ id: o.id as string, itemCode: o.item_code as string, kind: o.kind as 'PAYMENT' | 'DEDUCTION', amount: Number(o.proposed_amount), label: itemAt(o.item_code as string)?.koName }));
    // 상여: 같은 달에 앞서 확정한 명세(정규 + 앞 차수 상여)의 과세 합계와 세액을 넘긴다 → 세금은 차액만. 4대보험은 상여 대장에서 계산하지 않는다(경고로 알린다)
    const prior = bonus ? (priorOf!.get(id) ?? (priorOf!.has('*') ? { taxable: 0, incomeTax: 0, localTax: 0 } : null)) : null;
    const notice = noticeInputs.get(id);
    // 고지 기준으로 고른 보험의 고지 문제만 막는다 (산재는 기본 기준을 따른다)
    if (!bonus && notice) pre.push(...notice.blockers.filter((x) => (x.detail === 'accident' ? insuranceBasis === 'NOTICE' : basisOf(x.detail as InsurerKey) === 'NOTICE')));
    if (!bonus && overrides.some((o) => (o.itemCode === 'PENSION_SETTLE' && basisOf('pension') === 'NOTICE') || (o.itemCode === 'HEALTH_SETTLE' && basisOf('health') === 'NOTICE') || (o.itemCode === 'EMPLOYMENT_SETTLE' && basisOf('employment') === 'NOTICE'))) pre.push({ code: 'notice_settlement_duplicate' });
    const input: MemberInput['input'] = { runKind: bonus ? 'BONUS' : 'REGULAR', contract, tax, time, partialMonth, items: engineItems, policy, reference, insuranceBasis, insuranceBasisOf, notices: notice?.notices, overrides, prior, skipInsurance: bonus, minimumHourly: bonus ? null : minimumHourly, exemptYtd: exemptYtd.get(id) ?? {} };
    members.push({ employeeId: id, input, pre, notes, closeId: (close?.id as string | undefined) ?? null, contractId: (con?.id as string | undefined) ?? null, taxId: (taxRow?.id as string | undefined) ?? null, snapshot: { contract, tax, time, attendance: facts, items: engineItems, notices: notice?.notices ?? null, overrides, partialMonth, prior, closeHash: close?.input_hash ?? null } });
  }
  const usedItems = items.filter((it) => members.some((m) => m.input.items.some((x) => x.itemVersionId === it.id)));
  const usedRefs = Object.values(bundle).map((b) => basis.refs.find((r) => r.id === b.id)).filter((r) => !!r);
  const unverified = [
    ...(!basis.ledgerRow || basis.ledgerRow.verification !== 'VERIFIED' ? ['ledger'] : []),
    ...(basis.taxDefaults && !basis.taxDefaults.verified ? ['employee-defaults'] : []), // 보험 · 세무 회사 기본값이 아직 임시
    ...basis.policies.filter((p) => p.inUse && p.verification !== 'VERIFIED').map((p) => p.kind),
    ...usedItems.filter((i) => i.verification !== 'VERIFIED').map((i) => i.code),
    ...usedRefs.filter((r) => r.verification !== 'VERIFIED').map((r) => r.kind),
  ];
  for (const member of members) {
    if (unverified.length) member.notes.push({ code: 'basis_unverified', detail: unverified.join(', ') });
    // 기간 중에 「앞 판을 바꾼」 판만 변경으로 본다 — 처음 만든 판(판 번호 1)이 기간 중 시작돼도 막지 않는다 (2026-10-15: 처음 저장한 급여대장 설정 때문에 그달 급여 전원이 막히던 회귀)
    const changed = [...(basis.ledgerRow && basis.ledgerRow.version > 1 && basis.ledgerRow.validFrom > from ? ['ledger'] : []), ...basis.policies.filter((p) => p.inUse && p.version > 1 && p.validFrom > from).map((p) => p.kind), ...usedItems.filter((i) => i.version > 1 && i.validFrom > from && member.input.items.some((x) => x.itemVersionId === i.id)).map((i) => i.code)];
    if (!bonus && changed.length) member.pre.push({ code: 'policy_changed_in_period', detail: changed.join(', ') });
  }
  const inputHash = sha({ unverified, premiumTimeBasis: basis.premiumTimeBasis, engine: ENGINE_VERSION, policy, insuranceBasis, insuranceBasisOf, bundle, members: members.map((x) => ({ id: x.employeeId, pre: x.pre, close: x.closeId, contract: x.contractId, tax: x.taxId, s: x.snapshot })) });
  return { unverified, members, withholding, bundle, missing, inputHash };
}

/**
 * 상여의 세금 차액 계산에 쓰는 「앞선 명세」: 같은 달 · 같은 모드에서 확정한 정규 대장(가장 새 확정 판)과 앞 차수 상여 대장의 과세 합계 · 소득세 · 지방소득세.
 * 확정한 정규 대장이 없으면 빈 Map(= 전원 차단: 앞선 명세를 모른다). 있으면 '*' 표시를 넣고, 그 대장에 명세가 없는 직원은 0으로 본다(그 달 정규 급여가 없던 사람).
 * 과세 합계는 명세서 스냅샷에 적혀 있어야 한다 — 없으면(예전 계산) 그 직원은 차단된다.
 */
/**
 * 같은 해(귀속 기간 시작일의 연도)에 이 대장보다 앞서 확정한 명세에서, 직원 · 항목마다 이미 비과세로 뺀 합계 (2026-10-19 비과세 연간 누적).
 * 앞선 달의 정규 · 상여 + 같은 달의 정규(상여 대장일 때) · 앞 차수 상여. 대장(종류 · 기간 · 차수)마다 가장 새 확정 판만 센다(정정 전 판을 두 번 세지 않는다).
 * 줄마다 계산 때 남긴 calc_trace.exempt를 더한다 — 엔진 1.3 전에 계산한 줄은 비과세 금액이 없어 0으로 본다.
 */
export async function loadExemptYtd(run: Pick<RunRow, 'id' | 'kind' | 'periodFrom' | 'periodTo' | 'sequence' | 'isTest'>, employeeIds?: string[]): Promise<Map<string, Record<string, number>>> {
  const c = db();
  const out = new Map<string, Record<string, number>>();
  const yearStart = `${run.periodFrom.slice(0, 4)}-01-01`;
  const { data: runs, error } = await c.from('payroll_runs').select('id, run_kind, period_from, period_to, sequence, revision, current_generation_id').eq('is_test', run.isTest).eq('status', 'FINALIZED').in('run_kind', ['REGULAR', 'BONUS']).gte('period_from', yearStart).lte('period_from', run.periodFrom);
  if (error) fail('loadExemptYtd', error);
  const earlier = (r: Row) => {
    if ((r.period_from as string) < run.periodFrom) return true;
    if ((r.period_to as string) !== run.periodTo) return false;
    if (run.kind === 'REGULAR') return false; // 같은 달 정규 대장 자신(다른 판)은 빼고, 같은 달 상여는 정규 뒤에 계산한다
    return r.run_kind === 'REGULAR' || (r.sequence as number) < run.sequence;
  };
  const latest = new Map<string, Row>();
  for (const r of ((runs ?? []) as Row[]).filter((x) => x.id !== run.id && earlier(x))) {
    const k = `${r.run_kind}:${r.period_from}:${r.period_to}:${r.sequence}`;
    if (!latest.has(k) || (latest.get(k)!.revision as number) < (r.revision as number)) latest.set(k, r);
  }
  const gens = [...latest.values()].map((r) => r.current_generation_id as string).filter(Boolean);
  if (gens.length === 0) return out;
  let sq = c.from('payroll_statements').select('id, employee_id').in('generation_id', gens).eq('state', 'OK');
  if (employeeIds) sq = sq.in('employee_id', employeeIds);
  const { data: sts, error: e2 } = await sq;
  if (e2) fail('loadExemptYtd.statements', e2);
  const who = new Map((sts ?? []).map((s) => [s.id as string, s.employee_id as string]));
  if (who.size === 0) return out;
  const { data: lines, error: e3 } = await c.from('payroll_statement_items').select('statement_id, item_code, calc_trace').in('statement_id', [...who.keys()]).eq('kind', 'PAYMENT');
  if (e3) fail('loadExemptYtd.lines', e3);
  for (const l of (lines ?? []) as Row[]) {
    const ex = Number((l.calc_trace as Row | null)?.exempt ?? 0);
    if (!Number.isFinite(ex) || ex === 0) continue;
    const emp = who.get(l.statement_id as string)!;
    const cur = out.get(emp) ?? {};
    cur[l.item_code as string] = (cur[l.item_code as string] ?? 0) + ex;
    out.set(emp, cur);
  }
  return out;
}

/** 그 해에 확정한 급여 전부의 항목별 비과세 합계 — 사원별 급여 화면의 「올해 비과세 누적」 */
export async function exemptYtdForYear(employeeId: string, year: string, practice: boolean): Promise<Record<string, number>> {
  // 그 해 12월 31일에 시작하는 가상의 상여 대장 「앞」에 있는 것 = 그 해 확정한 정규 · 상여 전부
  const all = await loadExemptYtd({ id: '', kind: 'BONUS', periodFrom: `${year}-12-31`, periodTo: '9999-12-31', sequence: 9999, isTest: practice }, [employeeId]);
  return all.get(employeeId) ?? {};
}

async function loadPrior(run: RunRow): Promise<Map<string, { taxable: number; incomeTax: number; localTax: number }>> {
  const c = db();
  const out = new Map<string, { taxable: number; incomeTax: number; localTax: number }>();
  const { data: runs, error } = await c.from('payroll_runs').select('id, run_kind, sequence, revision, current_generation_id').eq('period_from', run.periodFrom).eq('period_to', run.periodTo).eq('is_test', run.isTest).eq('status', 'FINALIZED').in('run_kind', ['REGULAR', 'BONUS']);
  if (error) fail('loadPrior', error);
  // 대장(종류 · 차수)마다 가장 새 확정 판만
  const latest = new Map<string, Row>();
  for (const r of (runs ?? []) as Row[]) {
    if (r.run_kind === 'BONUS' && (r.sequence as number) >= run.sequence) continue;
    const k = `${r.run_kind}:${r.sequence}`;
    if (!latest.has(k) || (latest.get(k)!.revision as number) < (r.revision as number)) latest.set(k, r);
  }
  if (![...latest.values()].some((r) => r.run_kind === 'REGULAR')) return out;
  out.set('*', { taxable: 0, incomeTax: 0, localTax: 0 });
  const gens = [...latest.values()].map((r) => r.current_generation_id as string).filter(Boolean);
  const { data: sts } = await c.from('payroll_statements').select('id, employee_id, snapshot').in('generation_id', gens).eq('state', 'OK');
  const ids = (sts ?? []).map((s) => s.id as string);
  const { data: lines } = ids.length ? await c.from('payroll_statement_items').select('statement_id, item_code, amount').in('statement_id', ids).in('item_code', ['INCOME_TAX', 'LOCAL_TAX']).eq('kind', 'DEDUCTION') : { data: [] as Row[] };
  const missing = new Set<string>();
  for (const s of sts ?? []) {
    const id = s.employee_id as string;
    const taxable = ((s.snapshot as Row | null)?.totals as { taxable?: number } | null | undefined)?.taxable;
    if (typeof taxable !== 'number') { missing.add(id); continue; }
    const cur = out.get(id) ?? { taxable: 0, incomeTax: 0, localTax: 0 };
    const of = (code: string) => ((lines ?? []) as Row[]).filter((l) => l.statement_id === s.id && l.item_code === code).reduce((a, l) => a + Number(l.amount), 0);
    out.set(id, { taxable: cur.taxable + taxable, incomeTax: cur.incomeTax + of('INCOME_TAX'), localTax: cur.localTax + of('LOCAL_TAX') });
  }
  for (const id of missing) out.delete(id);
  if (missing.size > 0) out.delete('*'); // 과세 합계를 모르는 명세가 섞여 있으면 「없던 사람은 0」으로 보지 않는다
  return out;
}

/** 한 사람 계산. 근태 쪽에서 이미 막힌 것이 있으면 계산 모듈의 차단 사유와 합친다 */
function compute(m: MemberInput, withholding: Withholding | null): EngineResult {
  const r0 = calculateStatement({ ...m.input, withholding });
  const r = { ...r0, warnings: [...r0.warnings, ...m.notes] } as EngineResult;
  if (m.pre.length === 0) return r;
  const blockers = [...m.pre, ...r.blockers].filter((b, i, all) => all.findIndex((x) => x.code === b.code && x.detail === b.detail) === i && !(b.code === 'no_attendance' && m.pre.length > 0 && m.closeId));
  return { state: 'BLOCKED', lines: [], totals: null, blockers, warnings: r.warnings, engineVersion: r.engineVersion };
}

async function setRun(run: RunRow, patch: Row): Promise<void> {
  const { data, error } = await db().from('payroll_runs').update({ ...patch, version: run.version + 1 }).eq('id', run.id).eq('version', run.version).select('id');
  if (error) fail('payroll_runs.update', error);
  if (!data?.length) throw new ApiError(409, 'payroll_run_conflict');
}
const must = async (id: string, expectedVersion: number): Promise<RunRow> => {
  const run = await loadRun(id);
  if (!run || run.kind === 'DAILY') throw new ApiError(404, 'not_found');
  if (run.status === 'FINALIZED') throw new ApiError(409, 'payroll_finalized');
  if (run.version !== expectedVersion) throw new ApiError(409, 'payroll_run_conflict');
  return run;
};

/** 계산 — 새 계산 세대를 만들고 대상자마다 명세서를 쌓는다. 끝까지 성공해야 대장이 새 세대를 가리킨다 */
export async function calculateRun(args: { id: string; expectedVersion: number; me: Me; requestId?: string }): Promise<{ ok: number; blocked: number }> {
  const c = db();
  const run = await must(args.id, args.expectedVersion);
  const built = await buildInputs(run);
  if (built.members.length === 0) throw new ApiError(409, 'payroll_no_members');
  const { data: lastGen } = await c.from('payroll_calculation_generations').select('seq').eq('run_id', run.id).order('seq', { ascending: false }).limit(1);
  const { data: gen, error: e1 } = await c.from('payroll_calculation_generations').insert({ run_id: run.id, seq: ((lastGen?.[0]?.seq as number | undefined) ?? 0) + 1, input_hash: built.inputHash, engine_version: ENGINE_VERSION, created_by: args.me.id }).select('id').single();
  if (e1 || !gen) fail('calculateRun.generation', e1);
  const genId = gen!.id as string;
  try {
    const sums = { pay: 0, deduction: 0, net: 0, employer: 0, ok: 0, blocked: 0 };
    const hashes: string[] = [];
    for (const m of built.members) {
      const r = compute(m, built.withholding);
      const resultHash = sha({ state: r.state, lines: r.lines, totals: r.totals, blockers: r.blockers });
      hashes.push(resultHash);
      const { data: st, error } = await c.from('payroll_statements').insert({
        generation_id: genId, run_id: run.id, employee_id: m.employeeId, close_id: m.closeId, contract_id: m.contractId, tax_id: m.taxId, state: r.state, blockers: [...r.blockers, ...r.warnings.map((w) => ({ ...w, warning: true }))],
        snapshot: { ...m.snapshot, totals: r.totals ? { taxable: r.totals.taxable, insuranceBase: r.totals.insuranceBase } : null }, reference_bundle: built.bundle, pay_total: r.totals?.pay ?? null, deduction_total: r.totals?.deduction ?? null, net_total: r.totals?.net ?? null, employer_total: r.totals?.employer ?? null, result_hash: resultHash,
      }).select('id').single();
      if (error || !st) fail('calculateRun.statement', error);
      if (r.state === 'OK') {
        const count = new Map<string, number>();
        const rows = r.lines.map((l) => {
          const no = (count.get(l.code) ?? 0) + 1;
          count.set(l.code, no);
          return { statement_id: st!.id, line_no: no, item_code: l.code, item_version_id: l.itemVersionId ?? null, kind: l.kind, label_ko: l.label, quantity: l.quantity, unit_price: l.unitPrice, factor: l.factor, raw_value: l.rawValue, amount: l.amount, source: l.source, calc_trace: l.trace, override_id: l.overrideId ?? null };
        });
        const ins = await c.from('payroll_statement_items').insert(rows);
        if (ins.error) fail('calculateRun.items', ins.error);
        sums.pay += r.totals.pay; sums.deduction += r.totals.deduction; sums.net += r.totals.net; sums.employer += r.totals.employer; sums.ok++;
      } else sums.blocked++;
    }
    const totals = { members: built.members.length, ok: sums.ok, blocked: sums.blocked, pay: String(sums.pay), deduction: String(sums.deduction), net: String(sums.net), employer: String(sums.employer), missing: built.missing };
    const done = await c.from('payroll_calculation_generations').update({ state: 'SUCCEEDED', result_hash: sha(hashes), summary: totals, ended_at: new Date().toISOString() }).eq('id', genId);
    if (done.error) fail('calculateRun.finish', done.error);
    await setRun(run, { status: 'CALCULATED', current_generation_id: genId, totals });
    await payrollAudit({ actorId: args.me.id, action: 'run.calculate', table: 'payroll_runs', subjectId: run.id, runId: run.id, requestId: args.requestId, detail: { generation: genId, ok: sums.ok, blocked: sums.blocked } });
    return { ok: sums.ok, blocked: sums.blocked };
  } catch (e) {
    await c.from('payroll_calculation_generations').update({ state: 'FAILED', error_code: e instanceof ApiError ? e.code : 'unhandled', ended_at: new Date().toISOString() }).eq('id', genId).eq('state', 'RUNNING');
    throw e;
  }
}

/** 지금 가리키는 계산 세대가 지금 입력과 같은가. 다르면 「오래됨」 — 다시 계산해야 검토 · 확정할 수 있다 */
export async function isStale(run: RunRow): Promise<boolean> {
  if (!run.generationId) return false;
  const [{ data: gen }, built] = await Promise.all([db().from('payroll_calculation_generations').select('input_hash, engine_version').eq('id', run.generationId).maybeSingle(), buildInputs(run)]);
  return !gen || gen.input_hash !== built.inputHash || gen.engine_version !== ENGINE_VERSION;
}

async function ready(run: RunRow): Promise<void> {
  if (!run.generationId) throw new ApiError(409, 'payroll_not_calculated');
  const { count, error } = await db().from('payroll_statements').select('id', { count: 'exact', head: true }).eq('generation_id', run.generationId).eq('state', 'BLOCKED');
  if (error) fail('ready', error);
  if ((count ?? 0) > 0) throw new ApiError(409, 'payroll_has_blocked'); // 차단된 직원을 해결하거나 사유를 적어 대상에서 뺀 뒤 다시 계산한다
  if (await isStale(run)) throw new ApiError(409, 'payroll_stale');
}

export async function reviewRun(args: { id: string; expectedVersion: number; me: Me; requestId?: string }): Promise<void> {
  const run = await must(args.id, args.expectedVersion);
  if (run.status !== 'CALCULATED') throw new ApiError(409, 'payroll_wrong_status');
  await ready(run);
  await setRun(run, { status: 'REVIEWED', reviewed_by: args.me.id, reviewed_at: new Date().toISOString() });
  await payrollAudit({ actorId: args.me.id, action: 'run.review', table: 'payroll_runs', subjectId: run.id, runId: run.id, requestId: args.requestId, detail: { generation: run.generationId } });
}

/** 확정 — 검토한 뒤에 바뀐 것이 없을 때만. 대장 한 줄을 바꾸는 한 번의 쓰기라 일부만 확정되는 일이 없다. 그 뒤로는 DB가 아무것도 바꾸지 못하게 막는다 */
export async function finalizeRun(args: { id: string; expectedVersion: number; me: Me; requestId?: string }): Promise<void> {
  const run = await must(args.id, args.expectedVersion);
  if (run.status !== 'REVIEWED') throw new ApiError(409, 'payroll_wrong_status');
  await ready(run);
  // 운영 대장만 막는다 — 연습 대장은 미검증 기준으로도 확정해 흐름을 시험할 수 있다(명세에는 「미검증」 경고가 남는다) (2026-10-15)
  if (!run.isTest && (await buildInputs(run)).unverified.length) throw new ApiError(409, 'payroll_basis_unverified');
  await setRun(run, { status: 'FINALIZED', finalized_by: args.me.id, finalized_at: new Date().toISOString() });
  await payrollAudit({ actorId: args.me.id, action: 'run.finalize', table: 'payroll_runs', subjectId: run.id, runId: run.id, requestId: args.requestId, detail: { generation: run.generationId } });
  // 퇴직연금 DC 부담금 (묶음 32, 2026-10-20): 그 달 확정한 대장으로 다시 만든다. 실패해도 확정은 그대로 — 퇴직연금 화면에서 「다시 만들기」
  if (run.kind !== 'DAILY') await syncMonth({ month: run.periodFrom, isTest: run.isTest, me: args.me }).catch((e) => console.error(JSON.stringify({ route: 'payroll.finalize.pension', detail: String((e as Error)?.message ?? e).slice(0, 200) })));
}

/** 대상에서 빼기(사유 필수) · 다시 넣기. 계산 결과는 오래된 것이 된다 → 다시 계산한다 */
export async function setMember(args: { id: string; employeeId: string; include: boolean; reason: string | null; me: Me; requestId?: string }): Promise<void> {
  const run = await loadRun(args.id);
  if (!run) throw new ApiError(404, 'not_found');
  if (run.status === 'FINALIZED') throw new ApiError(409, 'payroll_finalized');
  const { data, error } = await db().from('payroll_run_members').update({ inclusion_state: args.include ? 'INCLUDED' : 'EXCLUDED', exclusion_reason: args.include ? null : args.reason, updated_by: args.me.id }).eq('run_id', run.id).eq('employee_id', args.employeeId).select('id');
  if (error) fail('setMember', error);
  if (!data?.length) throw new ApiError(404, 'not_found');
  await payrollAudit({ actorId: args.me.id, action: args.include ? 'member.include' : 'member.exclude', table: 'payroll_run_members', subjectId: data[0].id as string, runId: run.id, employeeId: args.employeeId, requestId: args.requestId });
}

/** 금액 조정 — 자동 계산 금액을 직접 고치지 않고 따로 남긴다. 같은 항목의 앞 조정은 끈다. 다음 계산부터 반영된다 */
export async function addOverride(args: { id: string; employeeId: string; itemCode: string; kind: 'PAYMENT' | 'DEDUCTION'; amount: number; reason: string; me: Me; requestId?: string }): Promise<void> {
  await atomicRpc('replace_payroll_override_atomic', { p_run: args.id, p_employee: args.employeeId, p_item: canonicalItemCode(args.itemCode), p_kind: args.kind, p_amount: args.amount, p_reason: args.reason, p_actor: args.me.id, p_request_id: args.requestId ?? null });
}
export async function withdrawOverride(args: { id: string; overrideId: string; me: Me; requestId?: string }): Promise<void> {
  const run = await loadRun(args.id);
  if (!run) throw new ApiError(404, 'not_found');
  if (run.status === 'FINALIZED') throw new ApiError(409, 'payroll_finalized');
  const { data, error } = await db().from('payroll_statement_overrides').update({ active: false, updated_by: args.me.id }).eq('id', args.overrideId).eq('run_id', run.id).eq('active', true).select('id, employee_id');
  if (error) fail('withdrawOverride', error);
  if (!data?.length) throw new ApiError(404, 'not_found');
  await payrollAudit({ actorId: args.me.id, action: 'override.withdraw', table: 'payroll_statement_overrides', subjectId: args.overrideId, runId: run.id, employeeId: data[0].employee_id as string, requestId: args.requestId });
}

/** 학자금 상환: 상환 기간을 적었으면 그 달에 걸칠 때만 뗀다(기간이 없으면 예전처럼 매달) */
function loanForMonth(loan: { state?: string; monthlyAmount?: number | null; from?: string | null; to?: string | null }, from: string, last: string): { state: 'YES' | 'NO' | 'UNKNOWN'; monthlyAmount: number | null } {
  const state = (loan.state ?? 'UNKNOWN') as 'YES' | 'NO' | 'UNKNOWN';
  if (state === 'YES' && loan.from && !reliefCovers({ from: loan.from, to: loan.to ?? null }, from, last)) return { state: 'NO', monthlyAmount: null };
  return { state, monthlyAmount: loan.monthlyAmount ?? null };
}

// ── 예상 지급 · 공제 (대장을 만들지 않는다) ──
/**
 * 그 날의 계약 · 세무 · 개인 항목 · 승인된 기준 자료만으로 한 달 치를 계산해 본다. 근태는 넣지 않는다(연장 · 야간 · 휴일 0, 결근 없음으로 본 값).
 * 아무것도 저장하지 않고, 정식 대장을 만들거나 확정하지 않는다.
 */
export async function previewPay(employeeId: string, date: string): Promise<EngineResult> {
  const [pay, basis] = await Promise.all([loadStaffPay(employeeId), loadCalcBasis(date)]);
  const con = versionAt(pay.contracts, date);
  const taxRaw = versionAt(pay.taxes, date);
  const dd = basis.taxDefaults?.defaults ?? null;
  // 회사 기본값 (2026-10-25): 세무 판이 없으면 기본값으로, 보험이 「모름」이면 그 보험만 기본값으로
  const tax = taxRaw ? (dd ? { ...taxRaw, insurance: Object.fromEntries(INSURERS.map((k) => [k, { ...taxRaw.insurance[k], state: fillState(taxRaw.insurance[k].state, k, dd) }])) as typeof taxRaw.insurance } : taxRaw) : dd ? { ...synthTax(dd, basis.defaultRatio), reliefs: NO_RELIEFS as unknown as TaxRow['reliefs'] } : null;
  const pre: Blocker[] = [];
  const items: EngineItem[] = [];
  const personalNow = pay.items.filter((x) => x.validFrom <= date && (x.validTo === null || x.validTo > date)).map((x) => ({ itemCode: x.itemCode, amount: x.amount }));
  for (const a of mergeAssigned(personalNow, await loadCommonItems(date), employeeId, con?.payType)) {
    const it = basis.items.find((x) => x.code === a.itemCode && x.inUse && x.validFrom <= date);
    const amount = a.amount ?? it?.defaultAmount ?? null;
    if (!it) pre.push({ code: 'item_missing', detail: a.itemCode });
    else if (amount === null) pre.push({ code: 'item_amount_missing', detail: it.code });
    else items.push({ code: it.code, kind: it.kind, label: it.koName, amount, taxable: it.taxTreatment === 'EXEMPT' ? 'EXEMPT' : it.taxTreatment === 'PARTIAL' ? 'PARTIAL' : 'TAXABLE', exemptLimit: it.taxExemptLimit, insurable: it.taxTreatment !== 'EXEMPT', ordinaryWage: it.ordinaryWage, itemVersionId: it.id });
  }
  const one = (k: 'pension' | 'health' | 'employment' | 'accident') => ({ state: tax!.insurance[k].state, reportedWage: tax!.insurance[k].reportedWage });
  const rel = tax ? reliefsForMonth(tax.reliefs, basis.reliefOn, `${date.slice(0, 7)}-01`, date) : null;
  if (rel) pre.push(...rel.blockers);
  const r = calculateStatement({
    runKind: 'REGULAR',
    contract: con ? { payType: con.payType, amount: con.amount, monthlyHours: con.monthlyHours, annualDivisor: con.annualDivisor, included: { overtimeHours: con.included.overtimeHours, holidayHours: con.included.holidayHours } } : null,
    tax: tax ? { withholdingRatio: tax.withholdingRatio, familyCount: tax.familyCount, childCount: tax.childCount, insurance: { pension: one('pension'), health: one('health'), employment: one('employment'), accident: one('accident') }, studentLoan: loanForMonth(tax.studentLoan, `${date.slice(0, 7)}-01`, date), reliefs: rel?.reliefs } : null,
    // 시급제는 일한 시간을 모르면 예상할 수 없다 → 근태 없음으로 차단된다. 월급 · 연봉제는 시간 0으로 본다
    time: con && con.payType !== 'HOURLY' ? { workedMinutes: 0, overtimeMinutes: 0, nightMinutes: 0, holidayMinutes: 0, holidayOver8Minutes: 0, paidLeaveMinutes: 0 } : null,
    partialMonth: false, items, policy: basis.policy, reference: basis.reference, insuranceBasis: basis.insuranceBasis, insuranceBasisOf: basis.insuranceBasisOf, withholding: basis.withholding, overrides: [], prior: null, minimumHourly: basis.minimumHourly,
  });
  if (pre.length === 0) return r;
  return { state: 'BLOCKED', lines: [], totals: null, blockers: [...pre, ...r.blockers], warnings: r.warnings, engineVersion: r.engineVersion };
}

// ── 정정 판 ──
/** 같은 대장(종류 · 기간 · 차수 · 연습/운영)의 판 전부 — 판 번호 순 */
export async function loadRevisions(run: RunRow): Promise<RunRow[]> {
  const { data, error } = await db().from('payroll_runs').select('*').eq('run_kind', run.kind).eq('period_from', run.periodFrom).eq('period_to', run.periodTo).eq('sequence', run.sequence).eq('is_test', run.isTest).order('revision');
  if (error) fail('loadRevisions', error);
  return (data ?? []).map(toRun);
}

/**
 * 정정 시작 — 확정한 대장은 그대로 두고, 판 번호를 올린 새 초안을 만든다(사유 필수).
 * 대상자(뺀 사람과 사유 포함)와 살아 있는 금액 조정을 그대로 옮겨 온다 → 아무것도 바꾸지 않고 계산하면 원본과 같은 결과에서 출발한다.
 * 가장 새 판에서만 시작할 수 있고, 진행 중인 정정이 있으면 또 만들 수 없다.
 */
export async function startCorrection(args: { id: string; reason: string; me: Me; requestId?: string }): Promise<RunRow> {
  const c = db();
  const run = await loadRun(args.id);
  if (!run) throw new ApiError(404, 'not_found');
  if (run.status !== 'FINALIZED') throw new ApiError(409, 'payroll_not_finalized');
  const revs = await loadRevisions(run);
  if (revs.some((r) => r.revision > run.revision)) throw new ApiError(409, 'payroll_correction_exists');
  const [{ data: mem }, { data: ovs }] = await Promise.all([
    c.from('payroll_run_members').select('employee_id, employment_id, inclusion_state, exclusion_reason').eq('run_id', run.id),
    c.from('payroll_statement_overrides').select('employee_id, item_code, kind, original_amount, proposed_amount, reason').eq('run_id', run.id).eq('active', true),
  ]);
  const { data, error } = await c.from('payroll_runs').insert({ run_kind: run.kind, title: run.title, period_from: run.periodFrom, period_to: run.periodTo, pay_date: run.payDate, sequence: run.sequence, is_test: run.isTest, revision: run.revision + 1, supersedes_id: run.id, correction_reason: args.reason, created_by: args.me.id }).select('*').single();
  if (error?.code === '23505') throw new ApiError(409, 'payroll_correction_exists');
  if (error || !data) fail('startCorrection', error);
  const m = await c.from('payroll_run_members').insert((mem ?? []).map((x) => ({ run_id: data!.id, employee_id: x.employee_id, employment_id: x.employment_id, inclusion_state: x.inclusion_state, exclusion_reason: x.exclusion_reason })));
  if (m.error) fail('startCorrection.members', m.error);
  if ((ovs ?? []).length > 0) {
    const o = await c.from('payroll_statement_overrides').insert((ovs ?? []).map((x) => ({ run_id: data!.id, employee_id: x.employee_id, item_code: x.item_code, kind: x.kind, original_amount: x.original_amount, proposed_amount: x.proposed_amount, reason: x.reason, created_by: args.me.id })));
    if (o.error) fail('startCorrection.overrides', o.error);
  }
  await payrollAudit({ actorId: args.me.id, action: 'run.correct', table: 'payroll_runs', subjectId: data!.id as string, runId: data!.id as string, requestId: args.requestId, detail: { from: run.id, revision: run.revision + 1 } });
  return toRun(data!);
}

// ── 화면용 읽기 ──
export type BoardLine = { employeeId: string; name: string; employeeNo: string | null; groupId: string | null; included: boolean; exclusionReason: string | null; closed: boolean; state: 'OK' | 'BLOCKED' | null; blockers: (Blocker & { warning?: boolean })[]; pay: number | null; deduction: number | null; net: number | null; employer: number | null };
export async function loadRunBoard(run: RunRow): Promise<{ lines: BoardLine[]; stale: boolean }> {
  const c = db();
  const [{ data: mem }, { data: people }, { data: sts }, { data: closes }, stale] = await Promise.all([
    c.from('payroll_run_members').select('employee_id, inclusion_state, exclusion_reason').eq('run_id', run.id),
    c.from('profiles').select('id, name, employee_no, group_id'),
    run.generationId ? c.from('payroll_statements').select('employee_id, state, blockers, pay_total, deduction_total, net_total, employer_total').eq('generation_id', run.generationId) : Promise.resolve({ data: [] as Row[] }),
    c.from('attendance_closes').select('employee_id').eq('state', 'CLOSED').eq('is_test', run.isTest).eq('period_from', run.periodFrom).eq('period_to', run.periodTo),
    run.status === 'FINALIZED' ? Promise.resolve(false) : isStale(run),
  ]);
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  const closed = new Set((closes ?? []).map((x) => x.employee_id as string));
  const ownerId = (people ?? []).find((p) => p.employee_no === OFFICE.ownerEmployeeNo)?.id;
  const lines = (mem ?? []).filter((m) => m.employee_id !== ownerId).map((m) => {
    const p = (people ?? []).find((x) => x.id === m.employee_id);
    const s = ((sts ?? []) as Row[]).find((x) => x.employee_id === m.employee_id);
    return {
      employeeId: m.employee_id as string, name: (p?.name as string) ?? '', employeeNo: (p?.employee_no as string | null) ?? null, groupId: (p?.group_id as string | null) ?? null, included: m.inclusion_state === 'INCLUDED', exclusionReason: m.exclusion_reason as string | null, closed: closed.has(m.employee_id as string),
      state: (s?.state as BoardLine['state']) ?? null, blockers: ((s?.blockers ?? []) as BoardLine['blockers']), pay: n(s?.pay_total), deduction: n(s?.deduction_total), net: n(s?.net_total), employer: n(s?.employer_total),
    };
  });
  return { lines: lines.sort((a, b) => a.name.localeCompare(b.name)), stale };
}

export type StatementLine = { code: string; kind: 'PAYMENT' | 'DEDUCTION' | 'EMPLOYER'; label: string; quantity: string | null; unitPrice: string | null; factor: string | null; rawValue: string | null; amount: number; source: 'AUTO' | 'MANUAL' | 'OVERRIDE'; trace: Row };
export type StatementView = { state: 'OK' | 'BLOCKED'; blockers: (Blocker & { warning?: boolean })[]; pay: number | null; deduction: number | null; net: number | null; employer: number | null; lines: StatementLine[]; snapshot: Row; bundle: Row; createdAt: string };
export async function loadStatement(run: RunRow, employeeId: string): Promise<{ statement: StatementView | null; overrides: { id: string; itemCode: string; kind: string; original: number | null; proposed: number; reason: string; createdBy: string; createdAt: string }[] }> {
  const c = db();
  const { data: ovs, error } = await c.from('payroll_statement_overrides').select('*').eq('run_id', run.id).eq('employee_id', employeeId).eq('active', true).order('created_at');
  if (error) fail('loadStatement.overrides', error);
  const overrides = (ovs ?? []).map((o) => ({ id: o.id as string, itemCode: o.item_code as string, kind: o.kind as string, original: o.original_amount === null ? null : Number(o.original_amount), proposed: Number(o.proposed_amount), reason: o.reason as string, createdBy: o.created_by as string, createdAt: o.created_at as string }));
  if (!run.generationId) return { statement: null, overrides };
  const { data: s } = await c.from('payroll_statements').select('*').eq('generation_id', run.generationId).eq('employee_id', employeeId).maybeSingle();
  if (!s) return { statement: null, overrides };
  const { data: items } = await c.from('payroll_statement_items').select('*').eq('statement_id', s.id).order('created_at').order('line_no');
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  const t = (v: unknown) => (v === null || v === undefined ? null : String(Number(v)));
  return {
    statement: {
      state: s.state as 'OK' | 'BLOCKED', blockers: (s.blockers ?? []) as StatementView['blockers'], pay: n(s.pay_total), deduction: n(s.deduction_total), net: n(s.net_total), employer: n(s.employer_total), snapshot: (s.snapshot ?? {}) as Row, bundle: (s.reference_bundle ?? {}) as Row, createdAt: s.created_at as string,
      lines: (items ?? []).map((i) => ({ code: i.item_code as string, kind: i.kind as StatementLine['kind'], label: i.label_ko as string, quantity: t(i.quantity), unitPrice: t(i.unit_price), factor: t(i.factor), rawValue: t(i.raw_value), amount: Number(i.amount), source: i.source as StatementLine['source'], trace: (i.calc_trace ?? {}) as Row })),
    },
    overrides,
  };
}
export { nextDay };

/** 같은 귀속월·연습 모드의 저장된 고지액. 중복·다른 대장 배정은 조용히 합산하지 않는다. */
async function loadNoticeInputs(run: RunRow) {
  const c = db();
  const { data: files, error } = await c.from('payroll_insurance_notice_files').select('id, insurer').eq('notice_month', run.periodFrom).eq('is_test', run.isTest).eq('state', 'SAVED');
  if (error) fail('noticeInputs.files', error);
  const result = new Map<string, { notices: NonNullable<EngineInput['notices']>; blockers: Blocker[] }>();
  if (!files?.length) return result;
  const { data: rows, error: rowError } = await c.from('payroll_insurance_notices').select('id, file_id, employee_id, mapping_state, components').in('file_id', files.map((f) => f.id)).eq('mapping_state', 'MAPPED');
  if (rowError) fail('noticeInputs.rows', rowError);
  const ids = (rows ?? []).map((r) => r.id);
  const allocations = ids.length ? await c.from('payroll_insurance_allocations').select('notice_id, run_id').in('notice_id', ids).eq('active', true) : { data: [], error: null };
  if (allocations.error) fail('noticeInputs.allocations', allocations.error);
  const keyOf: Record<string, 'pension' | 'health' | 'employment' | 'accident'> = { NP: 'pension', HI: 'health', EI: 'employment', IA: 'accident' };
  for (const row of rows ?? []) {
    if (!row.employee_id) continue;
    const value = result.get(row.employee_id) ?? { notices: {}, blockers: [] };
    result.set(row.employee_id, value);
    const key = keyOf[files.find((f) => f.id === row.file_id)!.insurer];
    if (!key) continue;
    const components = row.components as Record<string, string>;
    const employee = Number(components['employee.notice']);
    const employer = components['employer.notice'] == null ? null : Number(components['employer.notice']);
    if (!Number.isSafeInteger(employee) || employee < 0 || (employer !== null && (!Number.isSafeInteger(employer) || employer < 0))) { value.blockers.push({ code: 'notice_invalid', detail: key }); continue; }
    if (value.notices[key]) { value.blockers.push({ code: 'notice_duplicate', detail: key }); continue; }
    if (allocations.data?.some((a) => a.notice_id === row.id && a.run_id !== run.id)) { value.blockers.push({ code: 'notice_allocated_elsewhere', detail: key }); continue; }
    value.notices[key] = { employee, employer, id: row.id };
  }
  return result;
}
