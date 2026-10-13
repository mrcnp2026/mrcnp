// 급여대장 — 만들기 · 계산 · 검토 · 확정 · 조정 (PRD v1.3 8 · 18.3 · 19장). 서버 전용 — 부르는 쪽이 먼저 급여 담당자인지 확인한다(requirePayroll).
// 계산은 순수 계산 모듈(engine)이 한다. 여기는 근태 마감 · 계약 · 세무 · 개인 항목 · 회사 정책 · 승인된 기준 자료를 읽어 입력으로 만들고, 결과를 계산 세대로 쌓는다.
// ★ 근태는 읽기만 한다(연장 요청을 맞추는 쓰기를 하지 않는다). 마감된 달만 계산에 쓴다 — 마감하지 않은 직원은 「차단」이다.
// ★ 다시 계산하면 새 계산 세대가 생긴다. 실패한 계산은 앞의 성공한 결과를 덮지 않는다. 확정한 대장은 DB가 바꾸지 못하게 막는다(0037).
// ★ 검토 · 확정할 때 입력을 다시 읽어, 계산한 뒤에 바뀐 것이 있으면(오래됨) 막는다.
import 'server-only';
import { OFFICE } from '@/config/office';
import { ApiError } from '@/lib/api';
import type { Me } from '@/lib/auth';
import { loadConfirms } from '@/lib/confirm-data';
import { summarizeMonth } from '@/lib/monthly';
import { daysFor, leaveDaysFor, loadPeriod, workDaysFor } from '@/lib/period-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';
import { versionAt } from './contract';
import { loadItems, loadPolicies, loadReferences, loadSettingHistory, sha } from './data';
import { timeFromAttendance } from './engine/attendance';
import { calculateStatement, ENGINE_VERSION, type Blocker, type EngineInput, type EngineItem, type EngineOverride, type EngineResult, type Withholding } from './engine/engine';
import { makeWithholding, referenceFrom, TEMP_INSURANCE_ROUNDING } from './engine/inputs';
import { asChildRule, asTaxRules, pickAt, type ReferenceKind, type TaxBand } from './reference';
import { DEFAULT_LEDGER, payDateFor, type AllowancePolicy, type Ledger } from './settings';
import { loadStaffPay, payrollAudit, type ContractRow, type TaxRow } from './staff-data';

const db = () => createAdminClient();
type Row = Record<string, unknown>;
const fail = (where: string, e: { code?: string } | null): never => {
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
  const { data, error } = await db().from('payroll_runs').select('*').eq('is_test', practice).order('period_from', { ascending: false }).order('revision', { ascending: false }).limit(60);
  if (error) fail('loadRuns', error);
  // 검사가 만든 대장(제목이 e2e-로 시작)은 목록에 보이지 않는다 — 검사 전용 계정을 숨기는 것과 같은 규칙
  return (data ?? []).map(toRun).filter((r) => !r.title?.startsWith('e2e-'));
}
export async function loadRun(id: string): Promise<RunRow | null> {
  const { data, error } = await db().from('payroll_runs').select('*').eq('id', id).maybeSingle();
  if (error) fail('loadRun', error);
  return data ? toRun(data) : null;
}

async function ledger(): Promise<Ledger> {
  return ((await loadSettingHistory('ledger'))[0]?.payload as Ledger | undefined) ?? DEFAULT_LEDGER;
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
  const l = await ledger();
  const [{ data: people }, { data: cons }] = await Promise.all([
    c.from('profiles').select('id, employee_no, active'),
    c.from('payroll_contract_versions').select('employee_id, valid_from, valid_to').eq('status', 'active').lt('valid_from', to),
  ]);
  const contracted = new Set((cons ?? []).filter((x) => x.valid_to === null || (x.valid_to as string) > from).map((x) => x.employee_id as string));
  const members = (people ?? []).filter((p) => contracted.has(p.id as string) || (p.active && !(p.employee_no as string | null)?.startsWith('e2e-'))).map((p) => p.id as string);
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
type MemberInput = { employeeId: string; input: Omit<EngineInput, 'withholding'>; pre: Blocker[]; closeId: string | null; contractId: string | null; taxId: string | null; snapshot: Row };
type Built = { members: MemberInput[]; withholding: Withholding | null; bundle: Record<string, { id: string; hash: string }>; missing: ReferenceKind[]; inputHash: string };
const REF_KINDS: ReferenceKind[] = ['pension.rate', 'pension.limit', 'health.rate', 'ltc.rate', 'employment.rate', 'income-tax.table', 'income-tax.child-adjust'];

async function loadBands(referenceId: string): Promise<TaxBand[]> {
  const by = new Map<number, TaxBand>();
  for (let page = 0; page < 40; page++) {
    const { data, error } = await db().from('payroll_tax_rows').select('wage_from, wage_to, family_count, base_tax').eq('reference_version_id', referenceId).order('wage_from').order('family_count').range(page * 1000, page * 1000 + 999);
    if (error) fail('loadBands', error);
    for (const r of data ?? []) {
      const from = Number(r.wage_from);
      const b = by.get(from) ?? { wageFrom: from, wageTo: r.wage_to === null ? null : Number(r.wage_to), taxes: [] };
      b.taxes[(r.family_count as number) - 1] = Number(r.base_tax);
      by.set(from, b);
    }
    if ((data ?? []).length < 1000) break;
  }
  return [...by.values()].filter((b) => b.taxes.length === 11 && b.taxes.every((t) => typeof t === 'number')).sort((a, b) => a.wageFrom - b.wageFrom);
}

/** 그 날에 적용되는 회사 정책 · 승인된 기준 자료 · 지급/공제 항목 — 대장 계산과 예상 미리 보기가 같이 쓴다 */
export async function loadCalcBasis(last: string) {
  const [items, policies, refs, l] = await Promise.all([loadItems(), loadPolicies('allowance.'), loadReferences(REF_KINDS, ['APPROVED']), ledger()]);
  // 회사 정책 · 기준 자료 (귀속 기간의 마지막 날에 적용되는 것)
  const premium = (kind: string, key: keyof AllowancePolicy = 'premium') => {
    const p = policies.find((x) => x.kind === `allowance.${kind}` && x.inUse);
    const v = (p?.payload as AllowancePolicy | undefined)?.[key];
    return typeof v === 'string' ? v : null;
  };
  const policy: EngineInput['policy'] = { overtimePremium: premium('overtime'), nightPremium: premium('night'), holidayPremium: premium('holiday'), holidayOver8Premium: premium('holiday', 'premiumOver8h'), rounding: { pay: { mode: 'HALF_UP', unit: 1 }, insurance: TEMP_INSURANCE_ROUNDING.contribution } };
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
  const table = refAt('income-tax.table');
  const rules = asTaxRules(table?.payload);
  const withholding = table && rules ? makeWithholding({ bands: await loadBands(table.id), rules, childRule: asChildRule(refAt('income-tax.child-adjust')?.payload) }) : null;
  const insuranceBasis = l.insuranceBasis === 'REPORTED_BASE' ? 'REPORTED' : l.insuranceBasis;
  return { items, policy, reference, missing, bundle, withholding, insuranceBasis: insuranceBasis as EngineInput['insuranceBasis'] };
}

async function buildInputs(run: RunRow): Promise<Built> {
  const c = db();
  const from = run.periodFrom, last = prevDay(run.periodTo), ym = from.slice(0, 7);
  const [{ data: mem }, { data: cons }, { data: taxes }, { data: assigns }, { data: closes }, { data: ovs }, { data: people }, { data: emps }, basis, period, confirms] = await Promise.all([
    c.from('payroll_run_members').select('employee_id, inclusion_state').eq('run_id', run.id),
    c.from('payroll_contract_versions').select('*').eq('status', 'active'),
    c.from('payroll_employee_tax_versions').select('*').eq('status', 'active'),
    c.from('payroll_employee_items').select('*').eq('active', true),
    c.from('attendance_closes').select('id, employee_id, input_hash').eq('state', 'CLOSED').eq('is_test', run.isTest).eq('period_from', from).eq('period_to', run.periodTo),
    c.from('payroll_statement_overrides').select('id, employee_id, item_code, kind, proposed_amount').eq('run_id', run.id).eq('active', true),
    c.from('profiles').select('id, name, employee_no, joined_on'),
    c.from('staff_employment_periods').select('employee_id, starts_on, ends_on').eq('active', true),
    loadCalcBasis(last),
    loadPeriod(from, last, run.isTest),
    loadConfirms(from, last, run.isTest),
  ]);
  const { items, policy, reference, missing, bundle, withholding, insuranceBasis } = basis;

  const bonus = run.kind === 'BONUS';
  const priorOf = bonus ? await loadPrior(run) : null;

  const contracts = (cons ?? []) as Row[];
  const taxRows = (taxes ?? []) as Row[];
  const itemAt = (code: string) => items.find((x) => x.code === code && x.inUse && x.validFrom <= last) ?? null;
  const now = new Date();
  const today = toKstDate(now);
  const members: MemberInput[] = [];
  for (const m of (mem ?? []).filter((x) => x.inclusion_state === 'INCLUDED').sort((a, b) => String(a.employee_id).localeCompare(String(b.employee_id)))) {
    const id = m.employee_id as string;
    const pre: Blocker[] = [];
    const person = (people ?? []).find((p) => p.id === id);
    const conRows = contracts.filter((x) => x.employee_id === id).map((x) => ({ ...x, validFrom: x.valid_from as string, validTo: x.valid_to as string | null }));
    const con = versionAt(conRows, last) as (Row & { validFrom: string }) | null;
    const taxRow = versionAt(taxRows.filter((x) => x.employee_id === id).map((x) => ({ ...x, validFrom: x.valid_from as string, validTo: x.valid_to as string | null })), last) as Row | null;
    const inc = ((con?.included ?? {}) as Row) ?? {};
    const contract: EngineInput['contract'] = con ? { payType: con.pay_type as ContractRow['payType'], amount: Number(con.amount), monthlyHours: con.monthly_hours === null ? null : Number(con.monthly_hours), annualDivisor: con.annual_divisor === null ? null : Number(con.annual_divisor), included: { overtimeHours: inc.overtimeHours == null ? null : Number(inc.overtimeHours), holidayHours: inc.holidayHours == null ? null : Number(inc.holidayHours) } } : null;
    const ins = ((taxRow?.insurance ?? {}) as Record<string, { state?: string; reportedWage?: number | null }>) ?? {};
    const one = (k: string) => ({ state: (ins[k]?.state ?? 'UNKNOWN') as TaxRow['insurance']['pension']['state'], reportedWage: ins[k]?.reportedWage ?? null });
    const loan = (taxRow?.student_loan ?? {}) as { state?: string; monthlyAmount?: number | null };
    const tax: EngineInput['tax'] = taxRow ? { withholdingRatio: taxRow.withholding_ratio as 80 | 100 | 120, familyCount: taxRow.family_count as number, childCount: taxRow.child_count as number, insurance: { pension: one('pension'), health: one('health'), employment: one('employment'), accident: one('accident') }, studentLoan: { state: (loan.state ?? 'UNKNOWN') as 'YES' | 'NO' | 'UNKNOWN', monthlyAmount: loan.monthlyAmount ?? null } } : null;
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
          pendingMinutes: num('pending_overtime_minutes') + num('pending_night_minutes') + num('pending_holiday_minutes') + num('unreviewed_overtime_minutes'),
          paidLeaveDays: s.paidLeaveDays, flags: String(s.row.flags ?? '').split(';').map((x) => x.trim()).filter(Boolean), unconfirmedDays: s.unconfirmedDates.length,
        };
        facts = att;
        const t = timeFromAttendance(att, (con!.time_basis as 'ACTUAL' | 'ROUNDED' | 'SCHEDULE') ?? 'ACTUAL', contract.payType);
        time = t.time;
        pre.push(...t.blockers);
      }
    }
    // 개인 항목 (그 달 마지막 날에 붙어 있는 것)
    const engineItems: EngineItem[] = [];
    // 상여 대장에는 매달 붙는 개인 항목을 넣지 않는다 — 상여 금액은 조정(직접 넣는 지급)으로만 들어온다
    for (const a of bonus ? [] : ((assigns ?? []) as Row[]).filter((x) => x.employee_id === id && (x.valid_from as string) <= last && (x.valid_to === null || (x.valid_to as string) > last))) {
      const it = itemAt(a.item_code as string);
      if (!it) { pre.push({ code: 'item_missing', detail: a.item_code as string }); continue; }
      const amount = a.amount === null ? it.defaultAmount : Number(a.amount);
      if (amount === null) { pre.push({ code: 'item_amount_missing', detail: it.code }); continue; }
      const taxable = it.taxTreatment === 'EXEMPT' ? 'EXEMPT' : it.taxTreatment === 'PARTIAL' ? 'PARTIAL' : 'TAXABLE';
      engineItems.push({ code: it.code, kind: it.kind, label: it.koName, amount, taxable, exemptLimit: it.taxExemptLimit, insurable: taxable !== 'EXEMPT', itemVersionId: it.id });
    }
    const overrides: EngineOverride[] = ((ovs ?? []) as Row[]).filter((o) => o.employee_id === id).map((o) => ({ id: o.id as string, itemCode: o.item_code as string, kind: o.kind as 'PAYMENT' | 'DEDUCTION', amount: Number(o.proposed_amount), label: itemAt(o.item_code as string)?.koName }));
    // 상여: 같은 달에 앞서 확정한 명세(정규 + 앞 차수 상여)의 과세 합계와 세액을 넘긴다 → 세금은 차액만. 4대보험은 상여 대장에서 계산하지 않는다(경고로 알린다)
    const prior = bonus ? (priorOf!.get(id) ?? (priorOf!.has('*') ? { taxable: 0, incomeTax: 0, localTax: 0 } : null)) : null;
    const input: MemberInput['input'] = { runKind: bonus ? 'BONUS' : 'REGULAR', contract, tax, time, partialMonth, items: engineItems, policy, reference, insuranceBasis, overrides, prior, skipInsurance: bonus };
    members.push({ employeeId: id, input, pre, closeId: (close?.id as string | undefined) ?? null, contractId: (con?.id as string | undefined) ?? null, taxId: (taxRow?.id as string | undefined) ?? null, snapshot: { contract, tax, time, attendance: facts, items: engineItems, overrides, partialMonth, prior, closeHash: close?.input_hash ?? null } });
  }
  const inputHash = sha({ engine: ENGINE_VERSION, policy, insuranceBasis, bundle, members: members.map((x) => ({ id: x.employeeId, pre: x.pre, close: x.closeId, contract: x.contractId, tax: x.taxId, s: x.snapshot })) });
  return { members, withholding, bundle, missing, inputHash };
}

/**
 * 상여의 세금 차액 계산에 쓰는 「앞선 명세」: 같은 달 · 같은 모드에서 확정한 정규 대장(가장 새 확정 판)과 앞 차수 상여 대장의 과세 합계 · 소득세 · 지방소득세.
 * 확정한 정규 대장이 없으면 빈 Map(= 전원 차단: 앞선 명세를 모른다). 있으면 '*' 표시를 넣고, 그 대장에 명세가 없는 직원은 0으로 본다(그 달 정규 급여가 없던 사람).
 * 과세 합계는 명세서 스냅샷에 적혀 있어야 한다 — 없으면(예전 계산) 그 직원은 차단된다.
 */
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
  const r = calculateStatement({ ...m.input, withholding });
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
  if (!run) throw new ApiError(404, 'not_found');
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
  await setRun(run, { status: 'FINALIZED', finalized_by: args.me.id, finalized_at: new Date().toISOString() });
  await payrollAudit({ actorId: args.me.id, action: 'run.finalize', table: 'payroll_runs', subjectId: run.id, runId: run.id, requestId: args.requestId, detail: { generation: run.generationId } });
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
  const c = db();
  const run = await loadRun(args.id);
  if (!run) throw new ApiError(404, 'not_found');
  if (run.status === 'FINALIZED') throw new ApiError(409, 'payroll_finalized');
  const { data: mem } = await c.from('payroll_run_members').select('id').eq('run_id', run.id).eq('employee_id', args.employeeId).maybeSingle();
  if (!mem) throw new ApiError(404, 'not_found');
  let original: number | null = null;
  if (run.generationId) {
    const { data: st } = await c.from('payroll_statements').select('id').eq('generation_id', run.generationId).eq('employee_id', args.employeeId).maybeSingle();
    if (st) {
      const { data: line } = await c.from('payroll_statement_items').select('amount, source, calc_trace').eq('statement_id', st.id).eq('item_code', args.itemCode).eq('kind', args.kind).limit(1);
      const l = line?.[0];
      if (l) original = l.source === 'OVERRIDE' ? Number((l.calc_trace as { autoAmount?: number }).autoAmount ?? l.amount) : l.source === 'AUTO' ? Number(l.amount) : null;
    }
  }
  const off = await c.from('payroll_statement_overrides').update({ active: false, updated_by: args.me.id }).eq('run_id', run.id).eq('employee_id', args.employeeId).eq('item_code', args.itemCode).eq('active', true);
  if (off.error) fail('addOverride.off', off.error);
  const { data, error } = await c.from('payroll_statement_overrides').insert({ run_id: run.id, employee_id: args.employeeId, item_code: args.itemCode, kind: args.kind, original_amount: original, proposed_amount: args.amount, reason: args.reason, created_by: args.me.id }).select('id').single();
  if (error || !data) fail('addOverride', error);
  await payrollAudit({ actorId: args.me.id, action: 'override.add', table: 'payroll_statement_overrides', subjectId: data!.id as string, runId: run.id, employeeId: args.employeeId, requestId: args.requestId, detail: { itemCode: args.itemCode, kind: args.kind } });
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

// ── 예상 지급 · 공제 (대장을 만들지 않는다) ──
/**
 * 그 날의 계약 · 세무 · 개인 항목 · 승인된 기준 자료만으로 한 달 치를 계산해 본다. 근태는 넣지 않는다(연장 · 야간 · 휴일 0, 결근 없음으로 본 값).
 * 아무것도 저장하지 않고, 정식 대장을 만들거나 확정하지 않는다.
 */
export async function previewPay(employeeId: string, date: string): Promise<EngineResult> {
  const [pay, basis] = await Promise.all([loadStaffPay(employeeId), loadCalcBasis(date)]);
  const con = versionAt(pay.contracts, date);
  const tax = versionAt(pay.taxes, date);
  const pre: Blocker[] = [];
  const items: EngineItem[] = [];
  for (const a of pay.items.filter((x) => x.validFrom <= date && (x.validTo === null || x.validTo > date))) {
    const it = basis.items.find((x) => x.code === a.itemCode && x.inUse && x.validFrom <= date);
    const amount = a.amount ?? it?.defaultAmount ?? null;
    if (!it) pre.push({ code: 'item_missing', detail: a.itemCode });
    else if (amount === null) pre.push({ code: 'item_amount_missing', detail: it.code });
    else items.push({ code: it.code, kind: it.kind, label: it.koName, amount, taxable: it.taxTreatment === 'EXEMPT' ? 'EXEMPT' : it.taxTreatment === 'PARTIAL' ? 'PARTIAL' : 'TAXABLE', exemptLimit: it.taxExemptLimit, insurable: it.taxTreatment !== 'EXEMPT', itemVersionId: it.id });
  }
  const one = (k: 'pension' | 'health' | 'employment' | 'accident') => ({ state: tax!.insurance[k].state, reportedWage: tax!.insurance[k].reportedWage });
  const r = calculateStatement({
    runKind: 'REGULAR',
    contract: con ? { payType: con.payType, amount: con.amount, monthlyHours: con.monthlyHours, annualDivisor: con.annualDivisor, included: { overtimeHours: con.included.overtimeHours, holidayHours: con.included.holidayHours } } : null,
    tax: tax ? { withholdingRatio: tax.withholdingRatio, familyCount: tax.familyCount, childCount: tax.childCount, insurance: { pension: one('pension'), health: one('health'), employment: one('employment'), accident: one('accident') }, studentLoan: tax.studentLoan } : null,
    // 시급제는 일한 시간을 모르면 예상할 수 없다 → 근태 없음으로 차단된다. 월급 · 연봉제는 시간 0으로 본다
    time: con && con.payType !== 'HOURLY' ? { workedMinutes: 0, overtimeMinutes: 0, nightMinutes: 0, holidayMinutes: 0, holidayOver8Minutes: 0, paidLeaveMinutes: 0 } : null,
    partialMonth: false, items, policy: basis.policy, reference: basis.reference, insuranceBasis: basis.insuranceBasis, withholding: basis.withholding, overrides: [], prior: null,
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
  const lines = (mem ?? []).map((m) => {
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
