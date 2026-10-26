// 직원별 계약 · 세무 · 개인 항목 읽기 · 쓰기 (PRD v1.3 5 · 18.1 · 21장). 서버 전용 — 부르는 쪽이 먼저 급여 담당자인지 확인한다(requirePayroll).
// 계약 · 세무는 고치지 않고 판을 쌓는다: 새 판을 넣기 전에 앞 판의 끝나는 날을 새 판의 시작일로 닫는다.
// ★ 금액은 공용 변경 기록(audit_logs)에 넣지 않는다. 급여 전용 기록(payroll_audit_events)에 "누가 · 무엇을 · 언제"만 남긴다.
import { loadTaxDefaults } from './data';
import { OFFICE } from '@/config/office';
import 'server-only';
import { atomicRpc } from '@/lib/atomic-rpc';
import { AUTO_PAYMENT_CODES } from './engine/reserved-items';
import { ApiError } from '@/lib/api';
import type { Me } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { INSURERS, setupGaps, UNKNOWN_RELIEFS, UNKNOWN_TAX, versionAt, type ContractInput, type InsuranceState, type Insurer, type ItemAssign, type Reliefs, type SetupGap, type TaxInput } from './contract';

const db = () => createAdminClient();
type Row = Record<string, unknown>;
const fail = (where: string, e: { code?: string } | null): never => {
  if (e?.code === '23P01' || e?.code === '23505') throw new ApiError(409, 'payroll_version_conflict'); // 기간이 겹침 · 같은 판 번호 — 다른 담당자가 먼저 저장했다
  throw new Error(`${where}: ${e?.code ?? 'unknown'}`);
};

/** 급여 전용 기록 한 줄. 실패해도 하던 일을 막지 않는다(서버 기록에만 남긴다) */
export async function payrollAudit(args: { actorId: string; action: string; table: string; subjectId?: string | null; employeeId?: string | null; runId?: string | null; requestId?: string; detail?: Record<string, unknown> }): Promise<void> {
  const { error } = await db().from('payroll_audit_events').insert({ actor_id: args.actorId, action: args.action, subject_table: args.table, subject_id: args.subjectId ?? null, employee_id: args.employeeId ?? null, run_id: args.runId ?? null, request_id: args.requestId ?? null, detail: args.detail ?? {} });
  if (error) console.error(JSON.stringify({ route: 'payroll-audit', code: 'insert_failed', detail: error.code }));
}

export type ContractRow = ContractInput & { id: string; employeeId: string; validFrom: string; validTo: string | null; version: number; reason: string | null; createdBy: string; createdAt: string };
const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const toContract = (r: Row): ContractRow => {
  const inc = (r.included ?? {}) as Row;
  return {
    id: r.id as string, employeeId: r.employee_id as string, payType: r.pay_type as ContractRow['payType'], amount: Number(r.amount), timeBasis: r.time_basis as ContractRow['timeBasis'], monthlyHours: n(r.monthly_hours), annualDivisor: n(r.annual_divisor),
    included: { overtimeHours: n(inc.overtimeHours), holidayHours: n(inc.holidayHours), note: (inc.note as string | null) ?? null },
    validFrom: r.valid_from as string, validTo: r.valid_to as string | null, version: r.version as number, reason: r.reason as string | null, createdBy: r.created_by as string, createdAt: r.created_at as string,
  };
};
export type TaxRow = TaxInput & { id: string; employeeId: string; validFrom: string; validTo: string | null; version: number; reason: string | null; createdBy: string; createdAt: string };
const toTax = (r: Row): TaxRow => {
  const src = (r.insurance ?? {}) as Record<string, Partial<InsuranceState>>;
  const insurance = Object.fromEntries(INSURERS.map((k) => [k, { state: src[k]?.state ?? 'UNKNOWN', reportedWage: n(src[k]?.reportedWage), note: src[k]?.note ?? null }])) as Record<Insurer, InsuranceState>;
  const loan = (r.student_loan ?? {}) as Partial<TaxInput['studentLoan']>;
  const rel = (r.reliefs ?? {}) as Partial<Reliefs>;
  return {
    id: r.id as string, employeeId: r.employee_id as string, withholdingRatio: r.withholding_ratio as TaxRow['withholdingRatio'], familyCount: r.family_count as number, childCount: r.child_count as number, insurance,
    studentLoan: { state: loan.state ?? UNKNOWN_TAX.studentLoan.state, monthlyAmount: n(loan.monthlyAmount), from: loan.from ?? null, to: loan.to ?? null },
    reliefs: { sme: { ...UNKNOWN_RELIEFS.sme, ...(rel.sme ?? {}) }, durunuri: { ...UNKNOWN_RELIEFS.durunuri, ...(rel.durunuri ?? {}) }, ...(rel.flat19 ? { flat19: rel.flat19 } : {}) }, // 외국인 단일세율 19%도 이어 받는다(예전에는 빠져서, 고칠 때마다 「아니오」로 돌아갔다)
    validFrom: r.valid_from as string, validTo: r.valid_to as string | null, version: r.version as number, reason: r.reason as string | null, createdBy: r.created_by as string, createdAt: r.created_at as string,
  };
};
export type AssignRow = { id: string; employeeId: string; itemCode: string; amount: number | null; note: string | null; validFrom: string; validTo: string | null };
const toAssign = (r: Row): AssignRow => ({ id: r.id as string, employeeId: r.employee_id as string, itemCode: r.item_code as string, amount: n(r.amount), note: r.note as string | null, validFrom: r.valid_from as string, validTo: r.valid_to as string | null });

const at = versionAt;

export type StaffPayLine = { employeeId: string; name: string; employeeNo: string | null; groupId: string | null; joinedOn: string | null; active: boolean; contract: ContractRow | null; upcoming: ContractRow | null; tax: TaxRow | null; items: number; gaps: SetupGap[] };
/** 사원별 급여 목록 — 켜져 있는 직원 + 꺼져 있어도 계약이 있는 직원. 검사 전용 계정은 뺀다 */
export async function loadStaffPayBoard(today: string): Promise<StaffPayLine[]> {
  const c = db();
  const [{ data: people, error }, { data: cons }, { data: taxes }, { data: items }] = await Promise.all([
    c.from('profiles').select('id, name, employee_no, group_id, joined_on, active').order('name'),
    c.from('payroll_contract_versions').select('*').eq('status', 'active'),
    c.from('payroll_employee_tax_versions').select('*').eq('status', 'active'),
    c.from('payroll_employee_items').select('employee_id, valid_from, valid_to').eq('active', true),
  ]);
  if (error) fail('loadStaffPayBoard', error);
  const contracts = (cons ?? []).map(toContract), taxRows = (taxes ?? []).map(toTax);
  const hasTaxDefaults = !!(await loadTaxDefaults(today));
  return (people ?? [])
    // 시스템관리자(admin)는 직원이 아니다 — 계약이 있어도 급여 대상이 아니다 (2026-10-17 디자인 · 2026-10-26 의뢰인: 「급여 대상에서 빼줘」)
    .filter((p) => !(p.employee_no as string | null)?.startsWith('e2e-') && (p.active || contracts.some((x) => x.employeeId === p.id)) && p.employee_no !== OFFICE.ownerEmployeeNo)
    .map((p) => {
      const mine = contracts.filter((x) => x.employeeId === p.id);
      const contract = at(mine, today);
      const tax = at(taxRows.filter((x) => x.employeeId === p.id), today);
      return {
        employeeId: p.id as string, name: p.name as string, employeeNo: p.employee_no as string | null, groupId: p.group_id as string | null, joinedOn: p.joined_on as string | null, active: p.active as boolean,
        contract, upcoming: mine.filter((x) => x.validFrom > today).sort((a, b) => a.validFrom.localeCompare(b.validFrom))[0] ?? null, tax,
        items: (items ?? []).filter((i) => i.employee_id === p.id && (i.valid_from as string) <= today && (i.valid_to === null || today < (i.valid_to as string))).length,
        gaps: setupGaps({ contract, tax, joinedOn: p.joined_on as string | null, taxDefaults: hasTaxDefaults }),
      };
    });
}

export type StaffPay = { contracts: ContractRow[]; taxes: TaxRow[]; items: AssignRow[] };
/** 한 직원의 계약 · 세무 판 전부(새 것부터)와 개인 항목 */
export async function loadStaffPay(employeeId: string): Promise<StaffPay> {
  const c = db();
  const [a, b, i] = await Promise.all([
    c.from('payroll_contract_versions').select('*').eq('employee_id', employeeId).eq('status', 'active').order('version', { ascending: false }),
    c.from('payroll_employee_tax_versions').select('*').eq('employee_id', employeeId).eq('status', 'active').order('version', { ascending: false }),
    c.from('payroll_employee_items').select('*').eq('employee_id', employeeId).eq('active', true).order('valid_from', { ascending: false }),
  ]);
  if (a.error || b.error || i.error) fail('loadStaffPay', a.error ?? b.error ?? i.error);
  return { contracts: (a.data ?? []).map(toContract), taxes: (b.data ?? []).map(toTax), items: (i.data ?? []).map(toAssign) };
}

/**
 * 새 판 넣기의 공통 길. expectedVersion = 화면이 보던 마지막 판(없었으면 0). 새 시작일은 앞 판의 시작일보다 뒤여야 하고, 고칠 때는 사유가 있어야 한다.
 * 앞 판이 새 시작일 뒤까지 이어지면 새 시작일로 닫는다. 새 판이 못 들어가면 닫았던 앞 판을 다시 연다.
 */
async function appendVersion(table: 'payroll_contract_versions' | 'payroll_employee_tax_versions', employeeId: string, values: Row, args: { validFrom: string; reason: string | null; expectedVersion: number; me: Me }): Promise<Row> {
  // 같은 날 다시 고치기 (2026-10-25 의뢰인: 「오늘 고친 걸 또 고치려면 내일 날짜로 새 판을 만들어야 해서 이상하다」).
  // 가장 최근 변경의 적용 시작일이 지금 고르는 날짜와 같으면, 그 변경을 「정정」한다: 앞의 것은 취소(withdrawn)로 남기고 같은 날짜로 새로 넣는다 — 이력은 그대로 남는다.
  // 이미 급여 명세서 계산에 쓰인 변경은 정정하지 못한다(그날 이후 날짜로 새로 넣는다).
  const c = db();
  const fk = table === 'payroll_contract_versions' ? 'contract_id' : 'tax_id';
  const { data: act } = await c.from(table).select('id, version, valid_from').eq('employee_id', employeeId).eq('status', 'active').order('version', { ascending: false });
  const rows = act ?? [];
  const latest = rows[0];
  let expected = args.expectedVersion;
  let reason = args.reason;
  let withdrawn: string | null = null;
  if (latest && (latest.valid_from as string) === args.validFrom) {
    if ((latest.version as number) !== args.expectedVersion) throw new ApiError(409, 'payroll_version_conflict');
    const { data: used } = await c.from('payroll_statements').select('id').eq(fk, latest.id as string).limit(1);
    if (used?.length) throw new ApiError(409, 'payroll_version_in_use');
    const { error } = await c.from(table).update({ status: 'withdrawn' }).eq('id', latest.id as string).eq('status', 'active');
    if (error) fail('appendVersion.withdraw', error);
    withdrawn = latest.id as string;
    expected = (rows[1]?.version as number | undefined) ?? 0;
    reason = reason && reason.trim() ? reason : '같은 날 정정';
  }
  try {
    return await atomicRpc<Row>('append_payroll_version_atomic', { p_table: table, p_identity: employeeId, p_values: values, p_valid_from: args.validFrom, p_reason: reason, p_expected_version: expected, p_actor: args.me.id });
  } catch (e) {
    if (withdrawn) await c.from(table).update({ status: 'active' }).eq('id', withdrawn); // 새로 못 넣었으면 앞의 것을 되살린다
    throw e;
  }
}

/**
 * 아직 시작하지 않은(예약된) 변경 취소 (2026-10-25 의뢰인). 오늘 이전에 시작했거나 이미 명세서에 쓰인 것은 취소하지 못한다.
 * 취소하면 그 바로 앞 변경이 다시 끝없이 이어진다(끝 날짜를 지운다). 뒤에 더 늦게 시작하는 변경이 있으면 그것부터 취소해야 한다.
 */
export async function cancelScheduledVersion(args: { kind: 'contract' | 'tax'; id: string; employeeId: string; today: string; me: Me; requestId?: string }): Promise<void> {
  const c = db();
  const table = args.kind === 'contract' ? 'payroll_contract_versions' : 'payroll_employee_tax_versions';
  const fk = args.kind === 'contract' ? 'contract_id' : 'tax_id';
  const { data: v } = await c.from(table).select('id, version, valid_from, status').eq('id', args.id).eq('employee_id', args.employeeId).maybeSingle();
  if (!v || v.status !== 'active') throw new ApiError(404, 'not_found');
  if ((v.valid_from as string) <= args.today) throw new ApiError(409, 'payroll_version_started');
  const [{ data: later }, { data: used }] = await Promise.all([
    c.from(table).select('id').eq('employee_id', args.employeeId).eq('status', 'active').gt('valid_from', v.valid_from as string).limit(1),
    c.from('payroll_statements').select('id').eq(fk, args.id).limit(1),
  ]);
  if (later?.length) throw new ApiError(409, 'payroll_cancel_latest_first');
  if (used?.length) throw new ApiError(409, 'payroll_version_in_use');
  const { error } = await c.from(table).update({ status: 'withdrawn' }).eq('id', args.id).eq('status', 'active');
  if (error) fail('cancelScheduledVersion', error);
  const { data: prev } = await c.from(table).select('id, valid_to').eq('employee_id', args.employeeId).eq('status', 'active').order('version', { ascending: false }).limit(1);
  if (prev?.[0] && prev[0].valid_to !== null) await c.from(table).update({ valid_to: null }).eq('id', prev[0].id as string);
  await payrollAudit({ actorId: args.me.id, action: `${args.kind}.cancel`, table, subjectId: args.id, employeeId: args.employeeId, requestId: args.requestId, detail: { version: v.version, validFrom: v.valid_from } });
}

async function employmentAt(employeeId: string, d: string): Promise<string | null> {
  const { data } = await db().from('staff_employment_periods').select('id, starts_on, ends_on').eq('employee_id', employeeId).eq('active', true);
  return ((data ?? []).find((p) => (p.starts_on as string) <= d && (p.ends_on === null || d <= (p.ends_on as string)))?.id as string | undefined) ?? null;
}

export async function saveContract(args: { employeeId: string; input: ContractInput; validFrom: string; reason: string | null; expectedVersion: number; me: Me; requestId?: string }): Promise<ContractRow> {
  const i = args.input;
  const row = await appendVersion('payroll_contract_versions', args.employeeId, {
    employment_id: await employmentAt(args.employeeId, args.validFrom), pay_type: i.payType, amount: i.amount, time_basis: i.timeBasis, monthly_hours: i.monthlyHours, annual_divisor: i.annualDivisor, included: i.included,
  }, args);
  await payrollAudit({ actorId: args.me.id, action: 'contract.save', table: 'payroll_contract_versions', subjectId: row.id as string, employeeId: args.employeeId, requestId: args.requestId, detail: { version: row.version, validFrom: args.validFrom, payType: i.payType } });
  return toContract(row);
}

export async function saveTax(args: { employeeId: string; input: TaxInput; validFrom: string; reason: string | null; expectedVersion: number; me: Me; requestId?: string }): Promise<TaxRow> {
  const i = args.input;
  const row = await appendVersion('payroll_employee_tax_versions', args.employeeId, { withholding_ratio: i.withholdingRatio, family_count: i.familyCount, child_count: i.childCount, insurance: i.insurance, student_loan: i.studentLoan, reliefs: i.reliefs }, args);
  await payrollAudit({ actorId: args.me.id, action: 'tax.save', table: 'payroll_employee_tax_versions', subjectId: row.id as string, employeeId: args.employeeId, requestId: args.requestId, detail: { version: row.version, validFrom: args.validFrom } });
  return toTax(row);
}

/** 개인 항목 붙이기 — 같은 항목이 그 기간에 이미 붙어 있으면 409(먼저 끝내고 다시 넣는다) */
export async function addStaffItem(args: { employeeId: string; input: ItemAssign; validFrom: string; me: Me; requestId?: string }): Promise<void> {
  const c = db();
  if (AUTO_PAYMENT_CODES.has(args.input.itemCode)) throw new ApiError(422, 'payroll_auto_item');
  const { data: item } = await c.from('payroll_item_versions').select('code').eq('code', args.input.itemCode).eq('status', 'active').eq('in_use', true).limit(1);
  if (!item?.length) throw new ApiError(404, 'payroll_item_missing');
  const { data, error } = await c.from('payroll_employee_items').insert({ employee_id: args.employeeId, item_code: args.input.itemCode, amount: args.input.amount, note: args.input.note, valid_from: args.validFrom, created_by: args.me.id }).select('id').single();
  if (error?.code === '23P01') throw new ApiError(409, 'payroll_item_overlap');
  if (error || !data) fail('addStaffItem', error);
  await payrollAudit({ actorId: args.me.id, action: 'item.add', table: 'payroll_employee_items', subjectId: data!.id as string, employeeId: args.employeeId, requestId: args.requestId, detail: { itemCode: args.input.itemCode, validFrom: args.validFrom } });
}

/** 개인 항목 끝내기 — 끝나는 날을 적는다(그 날 전날까지 적용). 시작일과 같거나 앞이면 아예 끈다(잘못 넣은 것) */
export async function endStaffItem(args: { id: string; employeeId: string; endOn: string; me: Me; requestId?: string }): Promise<void> {
  const c = db();
  const { data: row } = await c.from('payroll_employee_items').select('id, valid_from').eq('id', args.id).eq('employee_id', args.employeeId).eq('active', true).maybeSingle();
  if (!row) throw new ApiError(404, 'not_found');
  const patch = args.endOn <= (row.valid_from as string) ? { active: false, updated_by: args.me.id } : { valid_to: args.endOn, updated_by: args.me.id };
  const { error } = await c.from('payroll_employee_items').update(patch).eq('id', args.id);
  if (error) fail('endStaffItem', error);
  await payrollAudit({ actorId: args.me.id, action: 'item.end', table: 'payroll_employee_items', subjectId: args.id, employeeId: args.employeeId, requestId: args.requestId, detail: { endOn: args.endOn } });
}
