// 급여 설정 읽기 · 쓰기. 서버 전용 — 부르는 쪽이 먼저 급여 담당자인지 확인한다(requirePayroll).
// 판 닫기와 새 판 삽입은 DB 함수의 같은 트랜잭션에서 처리한다.
import { cleanTaxDefaults, type TaxDefaults } from './tax-defaults';
import { cleanCommonItems, type CommonItem } from './common-items';
import 'server-only';
import { readAll } from '@/lib/read-all';
import { atomicRpc } from '@/lib/atomic-rpc';
import { createHash } from 'node:crypto';
import { ApiError } from '@/lib/api';
import { getMe, type Me } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { canonical, type Candidate, type Json, type ReferenceKind } from './reference';
import type { AllowancePolicy, ItemInput, Ledger, SettingPayload, SettingSection } from './settings';

/** 급여 담당 관리자만 (관리자 + 급여 열람 권한). 일반 관리자는 급여 설정을 보지도 바꾸지도 못한다 */
export async function requirePayroll(): Promise<Me> {
  const me = await getMe();
  if (!me || me.role !== 'admin' || !me.canViewPayroll) throw new ApiError(403, 'payroll_forbidden');
  return me;
}

export const sha = (v: unknown) => createHash('sha256').update(canonical(v)).digest('hex');
type Verify = 'TEMPORARY' | 'REVIEW_REQUIRED' | 'VERIFIED';
const db = () => createAdminClient();
const fail = (where: string, e: { code?: string; message?: string } | null) => {
  // 23P01 = 적용기간이 겹침(exclusion), 23505 = 같은 판 번호 — 다른 담당자가 먼저 저장한 경우
  if (e?.code === '23P01' || e?.code === '23505') throw new ApiError(409, 'payroll_version_conflict');
  throw new Error(`${where}: ${e?.code ?? 'unknown'}`);
};

// ── 회사 설정 ──
export type SettingRow = { id: string; section: SettingSection; payload: SettingPayload; validFrom: string; validTo: string | null; version: number; verification: Verify; verificationNote: string | null; reason: string | null; createdBy: string; createdAt: string };
const toSetting = (r: Record<string, unknown>): SettingRow => ({ id: r.id as string, section: r.section as SettingSection, payload: r.payload as SettingPayload, validFrom: r.valid_from as string, validTo: r.valid_to as string | null, version: r.version as number, verification: r.verification_state as Verify, verificationNote: r.verification_note as string | null, reason: r.reason as string | null, createdBy: r.created_by as string, createdAt: r.created_at as string });

/** 그 화면의 판 전부 (새 것부터) */
export async function loadSettingHistory(section: SettingSection): Promise<SettingRow[]> {
  const { data, error } = await db().from('payroll_company_setting_versions').select('*').eq('section', section).eq('status', 'active').order('version', { ascending: false });
  if (error) fail('loadSettingHistory', error);
  return (data ?? []).map(toSetting);
}

/** 그 날 적용되는 급여대장 설정(보험 기준 · 원천징수 비율 등) — 없으면 null */
export async function ledgerAt(day: string): Promise<Ledger | null> {
  const row = (await loadSettingHistory('ledger')).find((x) => x.validFrom <= day && (x.validTo === null || day < x.validTo));
  return (row?.payload as Ledger | undefined) ?? null;
}

/** 사원급여 기본 설정의 「중소기업 감면 사용」 — 그 날 적용되는 판. 꺼져 있으면 직원별 감면을 보지도 쓰지도 않는다.
 *  ★ 두루누리는 쓰지 않는다 (2026-10-22 의뢰인: 「두루누리는 사용 안 할 거니까 없애도 돼 — 직원 · 관리자 · 통합설정 전부」).
 *    저장된 설정 값과 상관없이 늘 꺼짐 → 계산 · 직원 급여 · 명세서 · 소득세 표 어디에도 나오지 않는다. 다시 쓰려면 여기만 되살린다 */
export async function reliefSwitches(date: string): Promise<{ sme: boolean; durunuri: boolean }> {
  const row = (await loadSettingHistory('employee-defaults')).find((x) => x.validFrom <= date && (x.validTo === null || date < x.validTo));
  const p = row?.payload as { smeTaxCut?: boolean } | undefined;
  return { sme: !!p?.smeTaxCut, durunuri: false };
}

/** 그 날 적용되는 회사 공통 고정 수당 · 공제 (사원급여 기본값 판의 commonItems) — 없으면 빈 목록 */
export async function loadCommonItems(date: string): Promise<CommonItem[]> {
  const row = (await loadSettingHistory('employee-defaults')).find((x) => x.validFrom <= date && (x.validTo === null || date < x.validTo));
  return cleanCommonItems((row?.payload as { commonItems?: unknown } | undefined)?.commonItems) ?? [];
}

/** 신규 직원 등록 양식의 급여 칸 기본값 — 회사 기본 급여 유형, 근로시간설정의 월 환산 시간(없으면 209) */
export async function loadNewStaffPayDefaults(date: string): Promise<{ payType: 'MONTHLY' | 'HOURLY' | 'ANNUAL' | null; monthlyHours: number | null }> {
  const at = (rows: SettingRow[]) => rows.find((x) => x.validFrom <= date && (x.validTo === null || date < x.validTo));
  const [emp, wt] = await Promise.all([loadSettingHistory('employee-defaults'), loadSettingHistory('working-time')]);
  const payType = (at(emp)?.payload as { payType?: 'MONTHLY' | 'HOURLY' | 'ANNUAL' | null } | undefined)?.payType ?? null;
  const hours = (at(wt)?.payload as { monthlyHours?: number | null } | undefined)?.monthlyHours;
  return { payType, monthlyHours: typeof hours === 'number' ? hours : 209 };
}

/** 급여대장 기본값의 소득세 선택 비율 — 세무 판이 없는 직원에게 쓴다. 대장 기본값을 안 정했으면 100 */
export async function loadDefaultWithholdingRatio(date: string): Promise<80 | 100 | 120> {
  const row = (await loadSettingHistory('ledger')).find((x) => x.validFrom <= date && (x.validTo === null || date < x.validTo));
  const r = (row?.payload as { withholdingRatio?: number } | undefined)?.withholdingRatio;
  return r === 80 || r === 120 ? r : 100;
}

/** 그 날 적용되는 4대보험 · 세무 회사 기본값과 그 판 (임시/검증 표시용) — 정해 두지 않았으면 null */
export async function loadTaxDefaults(date: string): Promise<{ defaults: TaxDefaults; verified: boolean } | null> {
  const row = (await loadSettingHistory('employee-defaults')).find((x) => x.validFrom <= date && (x.validTo === null || date < x.validTo));
  const d = cleanTaxDefaults((row?.payload as { taxDefaults?: unknown } | undefined)?.taxDefaults);
  return d ? { defaults: d, verified: row!.verification === 'VERIFIED' } : null;
}

/**
 * 새 판 저장. expectedVersion = 화면이 보고 있던 마지막 판 번호(없었으면 0) — 그 사이 다른 담당자가 저장했으면 409.
 * 앞 판이 새 시작일 뒤까지 이어지면 새 시작일로 닫는다. 새 시작일이 앞 판의 시작일보다 앞서거나 같으면 거부한다(지난 판을 덮지 않는다).
 */
export async function saveSetting(args: { section: SettingSection; payload: SettingPayload; validFrom: string; reason: string | null; expectedVersion: number; me: Me }): Promise<SettingRow> {
  const row = await atomicRpc<Record<string, unknown>>('append_payroll_version_atomic', { p_table: 'payroll_company_setting_versions', p_identity: args.section, p_values: { payload: args.payload }, p_valid_from: args.validFrom, p_reason: args.reason, p_expected_version: args.expectedVersion, p_actor: args.me.id });
  return toSetting(row);
}

// ── 지급 · 공제 항목 ──
export type ItemRow = ItemInput & { id: string; inUse: boolean; validFrom: string; validTo: string | null; version: number; verification: Verify; verificationNote: string | null };
const toItem = (r: Record<string, unknown>): ItemRow => ({
  id: r.id as string, code: r.code as string, kind: r.kind as ItemRow['kind'], koName: r.ko_name as string, enName: r.en_name as string, calcKind: r.calc_kind as ItemRow['calcKind'],
  defaultAmount: r.default_amount === null ? null : Number(r.default_amount), fixedAllowance: r.fixed_allowance as boolean, taxTreatment: r.tax_treatment as ItemRow['taxTreatment'],
  taxExemptLimit: r.tax_exempt_limit === null ? null : Number(r.tax_exempt_limit), taxExemptAnnualLimit: r.tax_exempt_annual_limit === null || r.tax_exempt_annual_limit === undefined ? null : Number(r.tax_exempt_annual_limit), ordinaryWage: r.ordinary_wage as ItemRow['ordinaryWage'], averageWageKind: (r.average_wage_kind ?? null) as ItemRow['averageWageKind'], sort: r.sort as number, inUse: r.in_use as boolean,
  validFrom: r.valid_from as string, validTo: r.valid_to as string | null, version: r.version as number, verification: r.verification_state as Verify, verificationNote: r.verification_note as string | null,
});

/** 연간 비과세 한도 칸(DB 0062, 묶음 28)이 있는가 */
export async function annualLimitReady(): Promise<boolean> {
  const { error } = await db().from('payroll_item_versions').select('tax_exempt_annual_limit').limit(1);
  return !error;
}

/** 퇴직금 평균임금 구분 칸(DB 묶음 36)이 있는가 */
export async function averageKindReady(): Promise<boolean> {
  const { error } = await db().from('payroll_item_versions').select('average_wage_kind').limit(1);
  return !error;
}

/** 지금 쓰는 판(끝나는 날이 열려 있는 판) — 코드마다 하나 */
export async function loadItems(kind?: 'PAYMENT' | 'DEDUCTION', asOf?: string): Promise<ItemRow[]> {
  let q = db().from('payroll_item_versions').select('*').eq('status', 'active');
  q = asOf ? q.lte('valid_from', asOf).or(`valid_to.is.null,valid_to.gt.${asOf}`) : q.is('valid_to', null);
  if (kind) q = q.eq('kind', kind);
  const { data, error } = await q.order('sort').order('code');
  if (error) fail('loadItems', error);
  return (data ?? []).map(toItem);
}

/** 항목 등록 또는 고침(새 판). 종류(지급/공제)는 바꿀 수 없다 */
export async function saveItem(args: { input: ItemInput; validFrom: string; reason: string | null; expectedVersion: number; me: Me }): Promise<ItemRow> {
  const i = args.input;
  // 연간 한도는 칸(묶음 28)이 있을 때만 보낸다 — 비우면 보내지 않는다(새 판에서 빈 값)
  const annual = i.taxExemptAnnualLimit ?? null;
  if (annual !== null && !(await annualLimitReady())) throw new ApiError(503, 'db_update_required');
  const avg = i.averageWageKind ?? null; // 평균임금 구분도 칸(묶음 36)이 있을 때만 보낸다
  if (avg !== null && !(await averageKindReady())) throw new ApiError(503, 'db_update_required');
  const row = await atomicRpc<Record<string, unknown>>('append_payroll_version_atomic', {
    p_table: 'payroll_item_versions', p_identity: i.code, p_valid_from: args.validFrom, p_reason: args.reason, p_expected_version: args.expectedVersion, p_actor: args.me.id,
    p_values: { kind: i.kind, ko_name: i.koName, en_name: i.enName, calc_kind: i.calcKind, default_amount: i.defaultAmount, fixed_allowance: i.fixedAllowance, tax_treatment: i.taxTreatment, tax_exempt_limit: i.taxExemptLimit, ...(annual !== null ? { tax_exempt_annual_limit: annual } : {}), ordinary_wage: i.ordinaryWage, ...(avg !== null ? { average_wage_kind: avg } : {}), sort: i.sort },
  });
  return toItem(row);
}

export async function setItemUse(id: string, inUse: boolean): Promise<void> {
  const { data, error } = await db().from('payroll_item_versions').update({ in_use: inUse }).eq('id', id).eq('status', 'active').is('valid_to', null).select('id');
  if (error) fail('setItemUse', error);
  if (!data?.length) throw new ApiError(404, 'not_found');
}

// ── 회사 정책 ──
export type PolicyRow<T = Record<string, unknown>> = { id: string; kind: string; payload: T; inUse: boolean; validFrom: string; version: number; verification: Verify; verificationNote: string | null };
const toPolicy = (r: Record<string, unknown>): PolicyRow => ({ id: r.id as string, kind: r.policy_kind as string, payload: r.validated_payload as Record<string, unknown>, inUse: r.in_use as boolean, validFrom: r.valid_from as string, version: r.version as number, verification: r.verification_state as Verify, verificationNote: r.verification_note as string | null });

export async function loadPolicies(prefix: string, asOf?: string): Promise<PolicyRow[]> {
  let q = db().from('payroll_policy_versions').select('*').eq('status', 'active').like('policy_kind', `${prefix}%`);
  q = asOf ? q.lte('valid_from', asOf).or(`valid_to.is.null,valid_to.gt.${asOf}`) : q.is('valid_to', null);
  const { data, error } = await q;
  if (error) fail('loadPolicies', error);
  return (data ?? []).map(toPolicy);
}

export async function savePolicy(args: { kind: string; payload: AllowancePolicy | Record<string, unknown>; validFrom: string; reason: string | null; expectedVersion: number; me: Me }): Promise<PolicyRow> {
  const row = await atomicRpc<Record<string, unknown>>('append_payroll_version_atomic', { p_table: 'payroll_policy_versions', p_identity: args.kind, p_values: { validated_payload: args.payload }, p_valid_from: args.validFrom, p_reason: args.reason, p_expected_version: args.expectedVersion, p_actor: args.me.id });
  return toPolicy(row);
}

export async function setPolicyUse(id: string, inUse: boolean): Promise<void> {
  const { data, error } = await db().from('payroll_policy_versions').update({ in_use: inUse }).eq('id', id).eq('status', 'active').is('valid_to', null).select('id');
  if (error) fail('setPolicyUse', error);
  if (!data?.length) throw new ApiError(404, 'not_found');
}

/** 「임시 / 검증됨」 표시 바꾸기 — 경영지원실의 노무 · 세무 검증을 받은 뒤에 (근거를 꼭 적는다) */
const VERIFY_TABLES = { setting: 'payroll_company_setting_versions', item: 'payroll_item_versions', policy: 'payroll_policy_versions', reference: 'payroll_reference_versions' } as const;
export async function setVerification(target: keyof typeof VERIFY_TABLES, id: string, state: 'TEMPORARY' | 'VERIFIED', note: string | null): Promise<void> {
  if (state === 'VERIFIED' && !note) throw new ApiError(422, 'payroll_reason_required');
  const { data, error } = await db().from(VERIFY_TABLES[target]).update({ verification_state: state, verification_note: note }).eq('id', id).select('id');
  if (error) fail('setVerification', error);
  if (!data?.length) throw new ApiError(404, 'not_found');
}

// ── 공식 기준 자료 ──
export type ReferenceRow = { id: string; kind: ReferenceKind; origin: 'collected' | 'manual' | 'upload'; validFrom: string | null; validTo: string | null; payload: Record<string, Json>; sourceUnit: string | null; payloadHash: string; state: string; warnings: string[]; source: { authority?: string; url?: string | null } | null; verification: Verify; verificationNote: string | null; reviewReason: string | null; approvedBy: string | null; approvedAt: string | null; createdAt: string };
const toRef = (r: Record<string, unknown>): ReferenceRow => {
  const v = (r.validation_result ?? {}) as { warnings?: string[]; source?: ReferenceRow['source'] };
  return { id: r.id as string, kind: r.reference_kind as ReferenceKind, origin: r.origin as ReferenceRow['origin'], validFrom: r.valid_from as string | null, validTo: r.valid_to as string | null, payload: r.normalized_payload as ReferenceRow['payload'], sourceUnit: r.source_unit as string | null, payloadHash: r.payload_hash as string, state: r.state as string, warnings: v.warnings ?? [], source: v.source ?? null, verification: r.verification_state as Verify, verificationNote: r.verification_note as string | null, reviewReason: r.review_reason as string | null, approvedBy: r.approved_by as string | null, approvedAt: r.approved_at as string | null, createdAt: r.created_at as string };
};

export async function loadReferences(kinds: readonly ReferenceKind[], states: string[]): Promise<ReferenceRow[]> {
  const { data } = await readAll((a,b) => db().from('payroll_reference_versions').select('*').in('reference_kind', kinds as string[]).in('state', states).order('created_at', { ascending: false }).order('id').range(a,b));
  return (data ?? []).map(toRef);
}

export async function loadReference(id: string): Promise<ReferenceRow | null> {
  const { data, error } = await db().from('payroll_reference_versions').select('*').eq('id', id).maybeSingle();
  if (error) fail('loadReference', error);
  return data ? toRef(data) : null;
}

/**
 * 후보를 「검토 대기」로 넣는다 (수집 결과 가져오기 · 직접 입력 공통). 승인 상태로는 넣지 않는다.
 * 같은 종류 · 같은 값 · 같은 기간의 후보나 승인본이 이미 있으면 새로 만들지 않는다(변경 없음).
 */
export async function stageCandidates(list: Candidate[], origin: 'collected' | 'manual' | 'upload', me: Me | null, inRun?: string): Promise<{ staged: number; unchanged: number; runId: string }> {
  const c = db();
  // inRun: 수집 실행(runCollector)이 이미 만든 실행 기록 안에서 부를 때 — 실행 기록을 따로 만들지도 닫지도 않는다
  let run: { id: string } | null = inRun ? { id: inRun } : null;
  if (!run) {
    const made = await c.from('payroll_refresh_runs').insert({ trigger: origin === 'manual' ? 'manual' : 'upload', actor_id: me?.id ?? null, status: 'running' }).select('id').single();
    if (made.error || !made.data) fail('stage.run', made.error);
    run = made.data;
  }
  let staged = 0;
  let unchanged = 0;
  const results: { kind: string; result: string }[] = [];
  for (const cand of list) {
    const hash = sha({ kind: cand.kind, payload: cand.payload, bands: cand.bands ?? null });
    const { data: same } = await c.from('payroll_reference_versions').select('id, valid_from, valid_to').eq('reference_kind', cand.kind).eq('payload_hash', hash).in('state', ['PENDING_ADMIN_REVIEW', 'APPROVED']);
    if (same?.some((s) => cand.validFrom === null || (s.valid_from === cand.validFrom && s.valid_to === cand.validTo))) {
      unchanged++;
      results.push({ kind: cand.kind, result: 'unchanged' });
      continue;
    }
    const { data: row, error } = await c
      .from('payroll_reference_versions')
      .insert({ reference_kind: cand.kind, origin, refresh_run_id: run!.id, valid_from: cand.validFrom, valid_to: cand.validTo, normalized_payload: cand.payload, source_unit: cand.sourceUnit, payload_hash: hash, state: 'PENDING_ADMIN_REVIEW', validation_result: { warnings: cand.warnings, source: { authority: cand.authority, url: cand.sourceUrl, hash: cand.sourceHash, parser: cand.parserVersion } }, created_by: me?.id ?? null })
      .select('id')
      .single();
    if (error || !row) fail('stage.insert', error);
    if (cand.bands) {
      const rows = cand.bands.flatMap((b) => b.taxes.map((tax, i) => ({ reference_version_id: row!.id, wage_from: b.wageFrom, wage_to: b.wageTo, family_count: i + 1, base_tax: tax })));
      for (let i = 0; i < rows.length; i += 1000) {
        const { error: e2 } = await c.from('payroll_tax_rows').insert(rows.slice(i, i + 1000));
        if (e2) {
          // 줄이 다 들어가지 못한 표는 쓸 수 없다 — 후보를 반려해 둔다
          await c.from('payroll_reference_versions').update({ state: 'REJECTED', review_reason: 'tax rows incomplete' }).eq('id', row!.id);
          fail('stage.rows', e2);
        }
      }
    }
    staged++;
    results.push({ kind: cand.kind, result: 'staged' });
  }
  if (!inRun) await c.from('payroll_refresh_runs').update({ status: 'done', ended_at: new Date().toISOString(), source_results: results }).eq('id', run!.id);
  return { staged, unchanged, runId: run!.id };
}

/**
 * 「확인 후 반영」 — 급여 담당 관리자가 본 바로 그 값(payloadHash)과 시행기간으로 승인한다.
 * 같은 종류의 승인본이 새 시행일 뒤까지 이어지면 그 끝을 새 시행일로 닫는다(열려 있던 경우만 — DB가 승인본의 닫힌 기간은 못 고치게 막는다).
 */
export async function approveReference(args: { id: string; payloadHash: string; validFrom: string; validTo: string | null; reason: string; me: Me }): Promise<void> {
  const c = db();
  const cur = await loadReference(args.id);
  if (!cur) throw new ApiError(404, 'not_found');
  if (cur.state !== 'PENDING_ADMIN_REVIEW') throw new ApiError(409, 'payroll_version_conflict');
  if (cur.payloadHash !== args.payloadHash) throw new ApiError(409, 'payroll_version_conflict');
  if (args.validTo !== null && args.validTo <= args.validFrom) throw new ApiError(400, 'invalid_input');
  const { data: open } = await c.from('payroll_reference_versions').select('id, valid_from, valid_to').eq('reference_kind', cur.kind).eq('state', 'APPROVED');
  for (const o of open ?? []) {
    if (o.valid_from >= args.validFrom && (args.validTo === null || o.valid_from < args.validTo)) throw new ApiError(422, 'payroll_reference_overlap');
    if (o.valid_to === null && o.valid_from < args.validFrom) {
      const { error } = await c.from('payroll_reference_versions').update({ valid_to: args.validFrom }).eq('id', o.id);
      if (error) fail('approve.close', error);
    } else if (o.valid_to !== null && o.valid_to > args.validFrom && o.valid_from < args.validFrom) throw new ApiError(422, 'payroll_reference_overlap');
  }
  const { data, error } = await c
    .from('payroll_reference_versions')
    .update({ state: 'APPROVED', valid_from: args.validFrom, valid_to: args.validTo, reviewed_payload_hash: args.payloadHash, review_reason: args.reason, approved_by: args.me.id, approved_at: new Date().toISOString() })
    .eq('id', args.id)
    .eq('state', 'PENDING_ADMIN_REVIEW')
    .select('id');
  if (error) fail('approve', error);
  if (!data?.length) throw new ApiError(409, 'payroll_version_conflict');
}

export async function rejectReference(id: string, reason: string): Promise<void> {
  const { data, error } = await db().from('payroll_reference_versions').update({ state: 'REJECTED', review_reason: reason }).eq('id', id).eq('state', 'PENDING_ADMIN_REVIEW').select('id');
  if (error) fail('reject', error);
  if (!data?.length) throw new ApiError(409, 'payroll_version_conflict');
}

/** 세액표의 한 구간 줄 (그 급여가 든 구간) — 가족 수별 세액. 없으면 빈 배열 */
export async function loadTaxRowsAt(referenceId: string, wage: number): Promise<{ family: number; wageFrom: number; wageTo: number | null; baseTax: number }[]> {
  const { data, error } = await db().from('payroll_tax_rows').select('family_count, wage_from, wage_to, base_tax').eq('reference_version_id', referenceId).lte('wage_from', wage).order('wage_from', { ascending: false }).limit(11);
  if (error) fail('loadTaxRowsAt', error);
  const top = data?.[0]?.wage_from;
  return (data ?? []).filter((r) => r.wage_from === top && (r.wage_to === null || wage < Number(r.wage_to))).map((r) => ({ family: r.family_count, wageFrom: Number(r.wage_from), wageTo: r.wage_to === null ? null : Number(r.wage_to), baseTax: Number(r.base_tax) }));
}

/** 그 급여가 든 구간의 가족 1~11명 세액 (없으면 null) */
export async function loadBandTaxes(referenceId: string, wage: number): Promise<{ from: number; to: number | null; taxes: number[] } | null> {
  const rows = await loadTaxRowsAt(referenceId, wage);
  if (rows.length !== 11) return null;
  const taxes: number[] = [];
  for (const r of rows) taxes[r.family - 1] = r.baseTax;
  return { from: rows[0].wageFrom, to: rows[0].wageTo, taxes };
}

/** 수집 실행 기록 (새 것부터) */
export type RunRow = { id: string; trigger: string; status: string; startedAt: string; endedAt: string | null; results: { source: string; authority?: string; ok?: boolean; error?: string; found?: number; staged?: number; unchanged?: number; kind?: string; result?: string }[] };
export async function loadRuns(limit = 5): Promise<RunRow[]> {
  const { data, error } = await db().from('payroll_refresh_runs').select('id, trigger, status, started_at, ended_at, source_results').order('started_at', { ascending: false }).limit(limit);
  if (error) fail('loadRuns', error);
  return (data ?? []).map((r) => ({ id: r.id, trigger: r.trigger, status: r.status, startedAt: r.started_at, endedAt: r.ended_at, results: (r.source_results ?? []) as RunRow['results'] }));
}

/** 세액표를 화면에 보일 한 쪽 (급여구간 순). from = 이 급여부터 */
export async function loadTaxPage(referenceId: string, from: number, bands: number): Promise<{ wageFrom: number; wageTo: number | null; taxes: number[] }[]> {
  const { data, error } = await db().from('payroll_tax_rows').select('family_count, wage_from, wage_to, base_tax').eq('reference_version_id', referenceId).gte('wage_from', from).order('wage_from').order('family_count').limit(bands * 11);
  if (error) fail('loadTaxPage', error);
  const out = new Map<number, { wageFrom: number; wageTo: number | null; taxes: number[] }>();
  for (const r of data ?? []) {
    const k = Number(r.wage_from);
    if (!out.has(k)) out.set(k, { wageFrom: k, wageTo: r.wage_to === null ? null : Number(r.wage_to), taxes: [] });
    out.get(k)!.taxes[r.family_count - 1] = Number(r.base_tax);
  }
  return [...out.values()];
}

