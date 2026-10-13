// 급여 설정 읽기 · 쓰기. 서버 전용 — 부르는 쪽이 먼저 급여 담당자인지 확인한다(requirePayroll).
// 판(version)은 고치지 않고 쌓는다: 새 판을 넣기 전에 앞 판의 끝나는 날을 새 판의 시작일로 닫는다.
import 'server-only';
import { createHash } from 'node:crypto';
import { ApiError } from '@/lib/api';
import { getMe, type Me } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { canonical, type Candidate, type ChildRule, type ReferenceKind } from './reference';
import type { AllowancePolicy, ItemInput, SettingPayload, SettingSection } from './settings';

/** 급여 담당 관리자만 (관리자 + 급여 열람 권한). 일반 관리자는 급여 설정을 보지도 바꾸지도 못한다 */
export async function requirePayroll(): Promise<Me> {
  const me = await getMe();
  if (!me || me.role !== 'admin' || !me.canViewPayroll) throw new ApiError(403, 'payroll_forbidden');
  return me;
}

export const sha = (v: unknown) => createHash('sha256').update(canonical(v)).digest('hex');
type Verify = 'TEMPORARY' | 'REVIEW_REQUIRED' | 'VERIFIED';
const db = () => createAdminClient();
/** 다음 판 번호 = 그 대상의 모든 판(거둔 판 포함) 가운데 가장 큰 번호 + 1 */
async function nextVersion(table: string, col: string, value: string): Promise<number> {
  const { data, error } = await db().from(table).select('version').eq(col, value).order('version', { ascending: false }).limit(1);
  if (error) throw new Error(`nextVersion: ${error.code}`);
  return ((data?.[0]?.version as number | undefined) ?? 0) + 1;
}
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

/**
 * 새 판 저장. expectedVersion = 화면이 보고 있던 마지막 판 번호(없었으면 0) — 그 사이 다른 담당자가 저장했으면 409.
 * 앞 판이 새 시작일 뒤까지 이어지면 새 시작일로 닫는다. 새 시작일이 앞 판의 시작일보다 앞서거나 같으면 거부한다(지난 판을 덮지 않는다).
 */
export async function saveSetting(args: { section: SettingSection; payload: SettingPayload; validFrom: string; reason: string | null; expectedVersion: number; me: Me }): Promise<SettingRow> {
  const c = db();
  const history = await loadSettingHistory(args.section);
  const last = history[0];
  if ((last?.version ?? 0) !== args.expectedVersion) throw new ApiError(409, 'payroll_version_conflict');
  if (last && args.validFrom <= last.validFrom) throw new ApiError(422, 'payroll_effective_from_past');
  if (last && !args.reason) throw new ApiError(422, 'payroll_reason_required');
  if (last && (last.validTo === null || last.validTo > args.validFrom)) {
    const { error } = await c.from('payroll_company_setting_versions').update({ valid_to: args.validFrom }).eq('id', last.id);
    if (error) fail('saveSetting.close', error);
  }
  const { data, error } = await c
    .from('payroll_company_setting_versions')
    .insert({ section: args.section, payload: args.payload, valid_from: args.validFrom, version: await nextVersion('payroll_company_setting_versions', 'section', args.section), reason: args.reason, supersedes_id: last?.id ?? null, created_by: args.me.id })
    .select('*')
    .single();
  if (error || !data) {
    // 새 판이 들어가지 못했으면 닫았던 앞 판을 다시 연다 (한쪽만 바뀐 채로 남지 않게)
    if (last) await c.from('payroll_company_setting_versions').update({ valid_to: last.validTo }).eq('id', last.id);
    fail('saveSetting.insert', error);
  }
  return toSetting(data!);
}

// ── 지급 · 공제 항목 ──
export type ItemRow = ItemInput & { id: string; inUse: boolean; validFrom: string; validTo: string | null; version: number; verification: Verify; verificationNote: string | null };
const toItem = (r: Record<string, unknown>): ItemRow => ({
  id: r.id as string, code: r.code as string, kind: r.kind as ItemRow['kind'], koName: r.ko_name as string, enName: r.en_name as string, calcKind: r.calc_kind as ItemRow['calcKind'],
  defaultAmount: r.default_amount === null ? null : Number(r.default_amount), fixedAllowance: r.fixed_allowance as boolean, taxTreatment: r.tax_treatment as ItemRow['taxTreatment'],
  taxExemptLimit: r.tax_exempt_limit === null ? null : Number(r.tax_exempt_limit), ordinaryWage: r.ordinary_wage as ItemRow['ordinaryWage'], sort: r.sort as number, inUse: r.in_use as boolean,
  validFrom: r.valid_from as string, validTo: r.valid_to as string | null, version: r.version as number, verification: r.verification_state as Verify, verificationNote: r.verification_note as string | null,
});

/** 지금 쓰는 판(끝나는 날이 열려 있는 판) — 코드마다 하나 */
export async function loadItems(kind?: 'PAYMENT' | 'DEDUCTION'): Promise<ItemRow[]> {
  let q = db().from('payroll_item_versions').select('*').eq('status', 'active').is('valid_to', null);
  if (kind) q = q.eq('kind', kind);
  const { data, error } = await q.order('sort').order('code');
  if (error) fail('loadItems', error);
  return (data ?? []).map(toItem);
}

/** 항목 등록 또는 고침(새 판). 종류(지급/공제)는 바꿀 수 없다 */
export async function saveItem(args: { input: ItemInput; validFrom: string; reason: string | null; expectedVersion: number; me: Me }): Promise<ItemRow> {
  const c = db();
  const { data: rows, error: e0 } = await c.from('payroll_item_versions').select('*').eq('code', args.input.code).eq('status', 'active').order('version', { ascending: false }).limit(1);
  if (e0) fail('saveItem.read', e0);
  const last = rows?.[0] ? toItem(rows[0]) : null;
  if ((last?.version ?? 0) !== args.expectedVersion) throw new ApiError(409, last && args.expectedVersion === 0 ? 'payroll_item_code_taken' : 'payroll_version_conflict');
  if (last && last.kind !== args.input.kind) throw new ApiError(422, 'invalid_input');
  if (last && args.validFrom <= last.validFrom) throw new ApiError(422, 'payroll_effective_from_past');
  if (last && !args.reason) throw new ApiError(422, 'payroll_reason_required');
  if (last) {
    const { error } = await c.from('payroll_item_versions').update({ valid_to: args.validFrom }).eq('id', last.id);
    if (error) fail('saveItem.close', error);
  }
  const i = args.input;
  const { data, error } = await c
    .from('payroll_item_versions')
    .insert({ code: i.code, kind: i.kind, ko_name: i.koName, en_name: i.enName, calc_kind: i.calcKind, default_amount: i.defaultAmount, fixed_allowance: i.fixedAllowance, tax_treatment: i.taxTreatment, tax_exempt_limit: i.taxExemptLimit, ordinary_wage: i.ordinaryWage, sort: i.sort, in_use: last?.inUse ?? true, valid_from: args.validFrom, version: await nextVersion('payroll_item_versions', 'code', i.code), reason: args.reason, supersedes_id: last?.id ?? null, created_by: args.me.id })
    .select('*')
    .single();
  if (error || !data) {
    if (last) await c.from('payroll_item_versions').update({ valid_to: null }).eq('id', last.id);
    fail('saveItem.insert', error);
  }
  return toItem(data!);
}

export async function setItemUse(id: string, inUse: boolean): Promise<void> {
  const { data, error } = await db().from('payroll_item_versions').update({ in_use: inUse }).eq('id', id).eq('status', 'active').is('valid_to', null).select('id');
  if (error) fail('setItemUse', error);
  if (!data?.length) throw new ApiError(404, 'not_found');
}

// ── 회사 정책 ──
export type PolicyRow<T = Record<string, unknown>> = { id: string; kind: string; payload: T; inUse: boolean; validFrom: string; version: number; verification: Verify; verificationNote: string | null };
const toPolicy = (r: Record<string, unknown>): PolicyRow => ({ id: r.id as string, kind: r.policy_kind as string, payload: r.validated_payload as Record<string, unknown>, inUse: r.in_use as boolean, validFrom: r.valid_from as string, version: r.version as number, verification: r.verification_state as Verify, verificationNote: r.verification_note as string | null });

export async function loadPolicies(prefix: string): Promise<PolicyRow[]> {
  const { data, error } = await db().from('payroll_policy_versions').select('*').eq('status', 'active').is('valid_to', null).like('policy_kind', `${prefix}%`);
  if (error) fail('loadPolicies', error);
  return (data ?? []).map(toPolicy);
}

export async function savePolicy(args: { kind: string; payload: AllowancePolicy | Record<string, unknown>; validFrom: string; reason: string | null; expectedVersion: number; me: Me }): Promise<PolicyRow> {
  const c = db();
  const { data: rows, error: e0 } = await c.from('payroll_policy_versions').select('*').eq('policy_kind', args.kind).eq('status', 'active').order('version', { ascending: false }).limit(1);
  if (e0) fail('savePolicy.read', e0);
  const last = rows?.[0] ? { ...toPolicy(rows[0]), validTo: rows[0].valid_to as string | null } : null;
  if ((last?.version ?? 0) !== args.expectedVersion) throw new ApiError(409, 'payroll_version_conflict');
  if (last && args.validFrom <= last.validFrom) throw new ApiError(422, 'payroll_effective_from_past');
  if (last && !args.reason) throw new ApiError(422, 'payroll_reason_required');
  if (last) {
    const { error } = await c.from('payroll_policy_versions').update({ valid_to: args.validFrom }).eq('id', last.id);
    if (error) fail('savePolicy.close', error);
  }
  const { data, error } = await c
    .from('payroll_policy_versions')
    .insert({ policy_kind: args.kind, validated_payload: args.payload, in_use: last?.inUse ?? true, valid_from: args.validFrom, version: await nextVersion('payroll_policy_versions', 'policy_kind', args.kind), reason: args.reason, supersedes_id: last?.id ?? null, created_by: args.me.id })
    .select('*')
    .single();
  if (error || !data) {
    if (last) await c.from('payroll_policy_versions').update({ valid_to: null }).eq('id', last.id);
    fail('savePolicy.insert', error);
  }
  return toPolicy(data!);
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
export type ReferenceRow = { id: string; kind: ReferenceKind; origin: 'collected' | 'manual' | 'upload'; validFrom: string | null; validTo: string | null; payload: Record<string, string | number | null>; sourceUnit: string | null; payloadHash: string; state: string; warnings: string[]; source: { authority?: string; url?: string | null } | null; verification: Verify; verificationNote: string | null; reviewReason: string | null; approvedBy: string | null; approvedAt: string | null; createdAt: string };
const toRef = (r: Record<string, unknown>): ReferenceRow => {
  const v = (r.validation_result ?? {}) as { warnings?: string[]; source?: ReferenceRow['source'] };
  return { id: r.id as string, kind: r.reference_kind as ReferenceKind, origin: r.origin as ReferenceRow['origin'], validFrom: r.valid_from as string | null, validTo: r.valid_to as string | null, payload: r.normalized_payload as ReferenceRow['payload'], sourceUnit: r.source_unit as string | null, payloadHash: r.payload_hash as string, state: r.state as string, warnings: v.warnings ?? [], source: v.source ?? null, verification: r.verification_state as Verify, verificationNote: r.verification_note as string | null, reviewReason: r.review_reason as string | null, approvedBy: r.approved_by as string | null, approvedAt: r.approved_at as string | null, createdAt: r.created_at as string };
};

export async function loadReferences(kinds: readonly ReferenceKind[], states: string[]): Promise<ReferenceRow[]> {
  const { data, error } = await db().from('payroll_reference_versions').select('*').in('reference_kind', kinds as string[]).in('state', states).order('created_at', { ascending: false }).limit(200);
  if (error) fail('loadReferences', error);
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
export async function stageCandidates(list: Candidate[], origin: 'collected' | 'manual' | 'upload', me: Me): Promise<{ staged: number; unchanged: number; runId: string }> {
  const c = db();
  const { data: run, error: e0 } = await c.from('payroll_refresh_runs').insert({ trigger: origin === 'manual' ? 'manual' : 'upload', actor_id: me.id, status: 'running' }).select('id').single();
  if (e0 || !run) fail('stage.run', e0);
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
      .insert({ reference_kind: cand.kind, origin, refresh_run_id: run!.id, valid_from: cand.validFrom, valid_to: cand.validTo, normalized_payload: cand.payload, source_unit: cand.sourceUnit, payload_hash: hash, state: 'PENDING_ADMIN_REVIEW', validation_result: { warnings: cand.warnings, source: { authority: cand.authority, url: cand.sourceUrl, hash: cand.sourceHash, parser: cand.parserVersion } }, created_by: me.id })
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
  await c.from('payroll_refresh_runs').update({ status: 'done', ended_at: new Date().toISOString(), source_results: results }).eq('id', run!.id);
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

export const asChildRule = (p: Record<string, string | number | null> | undefined): ChildRule | null => (p ? { child1: (p.child1 as number | null) ?? null, child2: (p.child2 as number | null) ?? null, perExtraChild: (p.perExtraChild as number | null) ?? null } : null);
