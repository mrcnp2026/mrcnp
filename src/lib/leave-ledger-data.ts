// 휴가 원장 읽기 · 쓰기 (PRD v1.3 36 · 38장). 서버 전용 — 부르는 쪽이 먼저 관리자인지 확인한다.
// ★ 승인된 지급 건이 있는 직원은 신청·직원·관리자 화면이 원장 잔여를 사용하고, 그 밖은 leave_grants를 사용한다.
// ★ 원장은 지급 건이 승인된 직원만 쌓는다 — 지급 건이 하나도 없는 직원의 휴가를 전부 「선사용」으로 적지 않기 위해서다.
// ★ 원장 줄은 고치거나 지울 수 없다(0035). 그래서 넣기 전에 계획(planRequest · planExpiry)을 세우고, 같은 열쇠는 한 번만 들어간다.
import 'server-only';
import { OFFICE } from '@/config/office';
import { readAll } from '@/lib/read-all';
import { ApiError } from '@/lib/api';
import type { Me } from '@/lib/auth';
import { addMonths, DAY_MINUTES, entriesFor, lotRemaining, NO_TYPE_RULE, planAccrual, planExpiry, planOffset, planRequest, settleLeave, splitCarry, STANDARD_LEAVE_POLICY, validateLeavePolicy, validateTypeRule, type Entry, type LeavePolicy, type LeaveTypeRule, type Lot, type NewEntry, type PlannedLot, type Settlement, ledgerBalance, minutesToDays } from '@/lib/leave-ledger';
import { addDays } from '@/lib/calendar';
import { leavePayout, type PayoutItem } from '@/lib/leave-payout';
import { versionAt } from '@/lib/payroll/contract';
import { loadItems } from '@/lib/payroll/data';
import { loadStaffPay } from '@/lib/payroll/staff-data';
import { toKstDate } from '@/lib/time';
import { createAdminClient } from '@/lib/supabase/admin';

export const ACCRUAL_TYPE = 'annual'; // 연차 지급 건의 휴가 종류. 반차 · 반반차처럼 「차감하는 종류」는 전부 이 잔여에서 뺀다
const db = () => createAdminClient();
type Row = Record<string, unknown>;
const boom = (where: string, e: { code?: string } | null): never => {
  throw new Error(`${where}: ${e?.code ?? 'unknown'}`);
};

export type LotRow = Lot & { accrualFrom: string | null; accrualTo: string | null; basis: Row; note: string | null; decidedAt: string | null; createdAt: string; policyVersionId: string | null };
const toLot = (r: Row): LotRow => ({
  id: r.id as string, employeeId: r.employee_id as string, typeCode: r.type_code as string, kind: r.lot_kind as Lot['kind'], grantedOn: r.granted_on as string, usableFrom: r.usable_from as string, usableTo: r.usable_to as string | null,
  quantityMinutes: r.quantity_minutes as number, dayMinutes: r.day_minutes as number, state: r.state as Lot['state'], accrualFrom: r.accrual_from as string | null, accrualTo: r.accrual_to as string | null,
  basis: (r.basis ?? {}) as Row, note: r.note as string | null, decidedAt: r.decided_at as string | null, createdAt: r.created_at as string, policyVersionId: r.policy_version_id as string | null,
});
export type EntryRow = Entry & { reason: string | null; createdAt: string };
const toEntry = (r: Row): EntryRow => ({
  id: Number(r.id), employeeId: r.employee_id as string, lotId: r.lot_id as string | null, event: r.event as Entry['event'], minutes: r.minutes as number, effectiveOn: r.effective_on as string,
  isTest: r.is_test as boolean, requestId: r.request_id as string | null, reason: r.reason as string | null, createdAt: r.created_at as string,
});

export async function loadLots(opts: { employeeId?: string; states?: Lot['state'][] } = {}): Promise<LotRow[]> {
  let q = db().from('leave_grant_lots').select('*');
  if (opts.employeeId) q = q.eq('employee_id', opts.employeeId);
  if (opts.states) q = q.in('state', opts.states);
  const { data } = await readAll((a,b) => q.order('granted_on', { ascending: false }).order('id').range(a,b));
  return (data ?? []).map(toLot);
}
export async function loadEntries(employeeId?: string): Promise<EntryRow[]> {
  let q = db().from('leave_ledger').select('*');
  if (employeeId) q = q.eq('employee_id', employeeId);
  const { data } = await readAll((a,b) => q.order('id', { ascending: true }).range(a,b));
  return (data ?? []).map(toEntry);
}

// ── 정책 ──
export type PolicyRow = { id: string; groupId: string; groupName: string; policy: LeavePolicy; validFrom: string; validTo: string | null; version: number; verification: 'TEMPORARY' | 'REVIEW_REQUIRED' | 'VERIFIED'; reason: string | null; createdAt: string };

/** 기본 그룹의 정책 판 전부 (새 것부터). 아직 시작하지 않았으면 빈 목록 */
export async function loadDefaultPolicies(): Promise<PolicyRow[]> {
  const { data: g } = await db().from('leave_policy_groups').select('id, name').eq('is_default', true).eq('active', true).maybeSingle();
  return g ? loadGroupPolicies(g as { id: string; name: string }) : [];
}
/** 한 그룹의 정책 판 전부 (새 것부터) — 그룹만의 기준을 쓰지 않으면 빈 목록(기본 그룹 기준을 따른다) */
export async function loadGroupPolicies(g: { id: string; name: string }): Promise<PolicyRow[]> {
  const c = db();
  const { data, error } = await c.from('leave_policy_versions').select('*').eq('group_id', g.id).eq('status', 'active').order('version', { ascending: false });
  if (error) boom('loadDefaultPolicies', error);
  return (data ?? []).flatMap((r) => {
    const policy = validateLeavePolicy(r.payload);
    return policy ? [{ id: r.id as string, groupId: g.id as string, groupName: g.name as string, policy, validFrom: r.valid_from as string, validTo: r.valid_to as string | null, version: r.version as number, verification: r.verification_state as PolicyRow['verification'], reason: r.reason as string | null, createdAt: r.created_at as string }] : [];
  });
}
const policyAt = (rows: readonly PolicyRow[], d: string) => rows.find((r) => r.validFrom <= d && (r.validTo === null || d < r.validTo)) ?? null;

/** 통상 방식으로 시작 — 기본 그룹과 첫 정책 판(임시)을 만든다. 이미 있으면 아무것도 하지 않는다 */
export async function seedLeavePolicy(me: Me, groupName: string): Promise<void> {
  const c = db();
  if ((await loadDefaultPolicies()).length > 0) return;
  let { data: g } = await c.from('leave_policy_groups').select('id').eq('is_default', true).eq('active', true).maybeSingle();
  if (!g) {
    const r = await c.from('leave_policy_groups').insert({ name: groupName, is_default: true, created_by: me.id }).select('id').single();
    if (r.error || !r.data) boom('seedLeavePolicy.group', r.error);
    g = r.data;
  }
  const { error } = await c.from('leave_policy_versions').insert({ group_id: g!.id, payload: STANDARD_LEAVE_POLICY, valid_from: '2000-01-01', version: 1, created_by: me.id });
  if (error && error.code !== '23505' && error.code !== '23P01') boom('seedLeavePolicy.version', error);
}

/** 정책을 고친다 = 새 판. 앞 판은 새 시작일로 닫는다. 화면이 보던 판 번호가 다르면 409 */
export async function saveLeavePolicy(args: { policy: LeavePolicy; validFrom: string; reason: string; expectedVersion: number; me: Me; groupId?: string | null }): Promise<void> {
  const c = db();
  const rows = args.groupId ? await loadGroupPolicies({ id: args.groupId, name: '' }) : await loadDefaultPolicies();
  const last = rows[0];
  if (!last) throw new ApiError(409, 'leave_policy_missing');
  if (last.version !== args.expectedVersion) throw new ApiError(409, 'leave_version_conflict');
  if (args.validFrom <= last.validFrom) throw new ApiError(422, 'leave_effective_from_past');
  if (last.validTo === null || last.validTo > args.validFrom) {
    const { error } = await c.from('leave_policy_versions').update({ valid_to: args.validFrom }).eq('id', last.id);
    if (error) boom('saveLeavePolicy.close', error);
  }
  const { error } = await c.from('leave_policy_versions').insert({ group_id: last.groupId, payload: args.policy, valid_from: args.validFrom, version: last.version + 1, reason: args.reason, supersedes_id: last.id, created_by: args.me.id });
  if (error) {
    await c.from('leave_policy_versions').update({ valid_to: last.validTo }).eq('id', last.id);
    if (error.code === '23505' || error.code === '23P01') throw new ApiError(409, 'leave_version_conflict');
    boom('saveLeavePolicy.insert', error);
  }
}

export async function setPolicyVerification(id: string, state: 'TEMPORARY' | 'VERIFIED', note: string | null): Promise<void> {
  const { error } = await db().from('leave_policy_versions').update({ verification_state: state, verification_note: note }).eq('id', id);
  if (error) boom('setPolicyVerification', error);
}

// ── 연차 후보 만들기 ──
export type AccrualResult = { created: number; existing: number; noHireDate: number; excluded: number; employees: number };
const lotKey = (employeeId: string, p: PlannedLot) => `${employeeId}:${ACCRUAL_TYPE}:${p.key}`;

/**
 * 재직 중인 직원마다 asOf까지 발생한 연차를 「후보」로 만든다(아직 쓸 수 있는 건만). 같은 발생은 한 번만 — 다시 눌러도 늘지 않는다.
 * 입사일이 없는 직원은 건너뛴다(추측하지 않는다). 생성 제외 그룹의 직원도 건너뛴다.
 */
export async function runAccrual(args: { asOf: string; me: Me; keep?: (employeeId: string, lot: PlannedLot) => boolean; createdIds?: string[] }): Promise<AccrualResult> {
  const c = db();
  const policies = await loadDefaultPolicies();
  const row = policyAt(policies, args.asOf);
  if (!row) throw new ApiError(409, 'leave_policy_missing');
  const [{ data: staff, error: e1 }, { data: members }, { data: groups }, { data: keys }, { data: gvers }] = await Promise.all([
    c.from('profiles').select('id, joined_on').eq('active', true),
    c.from('leave_policy_members').select('employee_id, group_id, valid_from, valid_to').eq('active', true),
    c.from('leave_policy_groups').select('id, excluded').eq('active', true),
    c.from('leave_grant_lots').select('dedupe_key').in('state', ['CANDIDATE', 'APPROVED']).limit(20000),
    c.from('leave_policy_versions').select('*').eq('status', 'active').neq('group_id', row.groupId),
  ]);
  // 그룹만의 기준 (L06, 2026-10-15): 그룹 → 그 날 적용되는 판
  const groupRow = new Map<string, PolicyRow>();
  for (const r of gvers ?? []) {
    const policy = validateLeavePolicy(r.payload);
    if (!policy || !((r.valid_from as string) <= args.asOf && (r.valid_to === null || args.asOf < (r.valid_to as string)))) continue;
    groupRow.set(r.group_id as string, { id: r.id as string, groupId: r.group_id as string, groupName: '', policy, validFrom: r.valid_from as string, validTo: r.valid_to as string | null, version: r.version as number, verification: r.verification_state as PolicyRow['verification'], reason: r.reason as string | null, createdAt: r.created_at as string });
  }
  if (e1) boom('runAccrual.staff', e1);
  const excluded = new Set((groups ?? []).filter((g) => g.excluded).map((g) => g.id as string));
  const have = new Set((keys ?? []).map((k) => k.dedupe_key as string));
  const res: AccrualResult = { created: 0, existing: 0, noHireDate: 0, excluded: 0, employees: (staff ?? []).length };
  const { data: run, error: e2 } = await c.from('leave_runs').insert({ kind: 'accrual', as_of: args.asOf, actor_id: args.me.id }).select('id').single();
  if (e2 || !run) boom('runAccrual.run', e2);
  const rows: Row[] = [];
  for (const s of staff ?? []) {
    if (!s.joined_on) { res.noHireDate++; continue; }
    const m = (members ?? []).find((x) => x.employee_id === s.id && x.valid_from <= args.asOf && (x.valid_to === null || args.asOf < x.valid_to));
    if (m && excluded.has(m.group_id as string)) { res.excluded++; continue; }
    const use = (m && groupRow.get(m.group_id as string)) || row;
    for (const p of planAccrual({ hiredOn: s.joined_on as string, asOf: args.asOf, policy: use.policy, liveOnly: true })) {
      if (args.keep && !args.keep(s.id as string, p)) continue; // 자동 발생: 시프티에서 옮긴 기간 · 자동 시작 전은 건너뛴다
      const key = lotKey(s.id as string, p);
      if (have.has(key)) { res.existing++; continue; }
      rows.push({
        employee_id: s.id, type_code: ACCRUAL_TYPE, lot_kind: p.kind, accrual_from: p.accrualFrom, accrual_to: p.accrualTo, granted_on: p.grantedOn, usable_from: p.usableFrom, usable_to: p.usableTo,
        quantity_minutes: p.minutes, day_minutes: p.dayMinutes, policy_version_id: use.id, basis: p.basis, dedupe_key: key, run_id: run!.id, created_by: args.me.id,
      });
    }
  }
  for (const r of rows) {
    const { data: made, error } = await c.from('leave_grant_lots').insert(r).select('id').single();
    if (!error) {
      res.created++;
      args.createdIds?.push(made.id as string);
    }
    else if (error.code === '23505') res.existing++; // 다른 관리자가 같은 때 만들었다
    else boom('runAccrual.insert', error);
  }
  await c.from('leave_runs').update({ status: 'done', summary: res, ended_at: new Date().toISOString() }).eq('id', run!.id);
  return res;
}

// ── 후보 승인 · 반려 · 거두기 ──
async function insertEntries(employeeId: string, rows: NewEntry[], actorId: string | null): Promise<{ added: number; locked: number }> {
  let added = 0, locked = 0;
  for (const e of rows) {
    const { error } = await db().from('leave_ledger').insert({
      employee_id: employeeId, type_code: ACCRUAL_TYPE, lot_id: e.lotId, event: e.event, minutes: e.minutes, effective_on: e.effectiveOn, is_test: e.isTest, request_id: e.requestId, dedupe_key: e.dedupeKey, reason: e.reason ?? null, actor_id: actorId,
    });
    if (!error) added++;
    else if (error.code === 'AC001') locked++; // 마감된 달 — 다시 열어야 들어간다
    else if (error.code !== '23505') boom('leave_ledger.insert', error); // 23505 = 이미 들어간 줄
  }
  return { added, locked };
}

export type DecideResult = { id: string; result: 'approved' | 'rejected' | 'withdrawn' | 'locked' | 'in_use' | 'skipped' };
/**
 * 승인: 원장에 지급 줄을 넣고 지급 건을 승인으로 바꾼다 → 그 직원의 휴가 신청을 원장에 맞춘다.
 * 반려: 후보만. 거두기: 승인된 건 가운데 아직 아무도 쓰지 않은 건만 — 남은 분을 조정 줄로 0으로 만든다.
 */
export async function decideLots(args: { ids: string[]; decision: 'approve' | 'reject' | 'withdraw'; me: Me }): Promise<DecideResult[]> {
  const c = db();
  const { data, error } = await c.from('leave_grant_lots').select('*').in('id', args.ids);
  if (error) boom('decideLots.load', error);
  const out: DecideResult[] = [];
  const touched = new Set<string>();
  const now = new Date().toISOString();
  for (const lot of (data ?? []).map(toLot)) {
    if (args.decision === 'approve') {
      if (lot.state !== 'CANDIDATE') { out.push({ id: lot.id, result: 'skipped' }); continue; }
      const r = await insertEntries(lot.employeeId, [{ lotId: lot.id, event: 'grant', minutes: lot.quantityMinutes, effectiveOn: lot.grantedOn, isTest: false, requestId: null, dedupeKey: `grant:${lot.id}` }], args.me.id);
      if (r.locked) { out.push({ id: lot.id, result: 'locked' }); continue; }
      const u = await c.from('leave_grant_lots').update({ state: 'APPROVED', decided_by: args.me.id, decided_at: now }).eq('id', lot.id).eq('state', 'CANDIDATE');
      if (u.error) boom('decideLots.approve', u.error);
      touched.add(lot.employeeId);
      out.push({ id: lot.id, result: 'approved' });
    } else if (args.decision === 'reject') {
      if (lot.state !== 'CANDIDATE') { out.push({ id: lot.id, result: 'skipped' }); continue; }
      const u = await c.from('leave_grant_lots').update({ state: 'REJECTED', decided_by: args.me.id, decided_at: now }).eq('id', lot.id).eq('state', 'CANDIDATE');
      if (u.error) boom('decideLots.reject', u.error);
      out.push({ id: lot.id, result: 'rejected' });
    } else {
      if (lot.state === 'CANDIDATE') {
        const u = await c.from('leave_grant_lots').update({ state: 'WITHDRAWN' }).eq('id', lot.id).eq('state', 'CANDIDATE');
        if (u.error) boom('decideLots.withdraw', u.error);
        out.push({ id: lot.id, result: 'withdrawn' });
        continue;
      }
      if (lot.state !== 'APPROVED') { out.push({ id: lot.id, result: 'skipped' }); continue; }
      const entries = (await loadEntries(lot.employeeId)).filter((e) => e.lotId === lot.id);
      // 썼다가 전부 취소된 건은 거둘 수 있다(지급 말고 다른 줄의 합이 0)
      if (entries.filter((e) => e.event !== 'grant').reduce((x, e) => x + e.minutes, 0) !== 0) { out.push({ id: lot.id, result: 'in_use' }); continue; }
      const left = entries.reduce((a, e) => a + e.minutes, 0);
      if (left !== 0) {
        const r = await insertEntries(lot.employeeId, [{ lotId: lot.id, event: 'adjust', minutes: -left, effectiveOn: lot.grantedOn, isTest: false, requestId: null, dedupeKey: `withdraw:${lot.id}`, reason: 'withdrawn' }], args.me.id);
        if (r.locked) { out.push({ id: lot.id, result: 'locked' }); continue; }
      }
      const u = await c.from('leave_grant_lots').update({ state: 'WITHDRAWN' }).eq('id', lot.id).eq('state', 'APPROVED');
      if (u.error) boom('decideLots.withdraw', u.error);
      touched.add(lot.employeeId);
      out.push({ id: lot.id, result: 'withdrawn' });
    }
  }
  for (const id of touched) await syncEmployeeLedger(id, args.me.id);
  return out;
}

/** 관리자가 직접 넣는 지급 건(보상 · 이월 · 옛 잔여 옮기기). 넣은 사람이 승인자다 — 바로 승인된다 */
export async function addManualLot(args: { employeeId: string; kind: 'manual' | 'carry' | 'compensatory' | 'migrated'; minutes: number; usableFrom: string; usableTo: string | null; note: string; me: Me; basis?: Record<string, unknown>; dedupeKey?: string }): Promise<DecideResult> { // basis · dedupeKey: 연장 → 보상휴가(payroll/overtime-comp.ts)처럼 근거를 잇는 지급
  const c = db();
  const { data: p } = await c.from('profiles').select('id').eq('id', args.employeeId).maybeSingle();
  if (!p) throw new ApiError(404, 'not_found');
  const { data, error } = await c
    .from('leave_grant_lots')
    .insert({
      employee_id: args.employeeId, type_code: ACCRUAL_TYPE, lot_kind: args.kind, granted_on: args.usableFrom, usable_from: args.usableFrom, usable_to: args.usableTo, quantity_minutes: args.minutes, day_minutes: DAY_MINUTES,
      basis: args.basis ?? { rule: 'manual' }, dedupe_key: args.dedupeKey ?? `manual:${crypto.randomUUID()}`, note: args.note, created_by: args.me.id,
    })
    .select('id')
    .single();
  if (error || !data) boom('addManualLot', error);
  const [r] = await decideLots({ ids: [data!.id as string], decision: 'approve', me: args.me });
  if (r.result === 'locked') await c.from('leave_grant_lots').update({ state: 'WITHDRAWN' }).eq('id', data!.id);
  return r;
}

// ── 신청 ↔ 원장 ──
/** 자동 발생을 시작한 날 — 이 날보다 앞의 지급은 자동으로 만들지 않는다(그 전 것은 시프티에서 옮겼거나 관리자가 넣었다) */
export const AUTO_ACCRUAL_FROM = '2026-10-17';
/** 자동으로 만들 지급 종류 — 연차 기준이 정해지면 'annual'을 더한다(회계연도면 기준 판도 함께 바꾼다) */
const AUTO_KINDS = new Set(['monthly', 'annual']); // 2026-10-19 의뢰인: 회계연도(1월 1일) 기준 + 첫해 비례분으로 정하고 연차도 자동 (급여-10)

/**
 * 입사일 기준 연차를 매일 자동으로 만들고 바로 지급한다 (2026-10-19 의뢰인: 「자동 생성 + 자동 승인」). 정기 작업 /api/cron/leave-accrual이 부른다.
 * 시프티에서 옮긴 지급 건은 12월까지 미리 잡힌 월차가 있어서, 직원마다 「옮긴 마지막 지급일」 다음 날부터만 만든다 — 같은 기간이 두 번 생기지 않게.
 * 지급한 사람은 시스템관리자로 남는다. 기준은 노무 확인 전 「임시」(검증 대기 기록).
 */
export async function autoAccrue(asOf: string): Promise<AccrualResult & { approved: number }> {
  const c = db();
  const [{ data: sys }, { data: migrated, error }] = await Promise.all([
    c.from('profiles').select('id').eq('employee_no', OFFICE.ownerEmployeeNo).maybeSingle(),
    c.from('leave_grant_lots').select('employee_id, granted_on, quantity_minutes').eq('lot_kind', 'migrated').eq('state', 'APPROVED').limit(20000),
  ]);
  if (error) boom('autoAccrue.migrated', error);
  if (!sys) throw new Error('autoAccrue: system admin missing');
  const me = { id: sys.id as string } as Me; // 정기 작업에는 로그인한 사람이 없다 — 지급 기록의 「누가」는 시스템관리자
  const lastMigrated = new Map<string, string>();
  const migratedDays = new Map<string, number>(); // 옮긴 1일짜리 지급 건 수 = 시프티에서 이미 받은 월차 개수 (입사 1년 차 직원)
  for (const m of migrated ?? []) {
    const id = m.employee_id as string;
    const cur = lastMigrated.get(id);
    if (!cur || (m.granted_on as string) > cur) lastMigrated.set(id, m.granted_on as string);
    if (Number(m.quantity_minutes) === DAY_MINUTES) migratedDays.set(id, (migratedDays.get(id) ?? 0) + 1);
  }
  // 월차(입사 1년 차, 매달 1일)와 연차(회계연도 1월 1일, 첫해는 비례분) 둘 다 — 2026-10-19 기준을 회계연도로 바꾼 뒤 켰다(급여-10).
  // 연차는 시프티에서 옮긴 마지막 지급일보다 뒤의 것만(같은 해가 두 번 생기지 않게). 「생성 제외」 그룹(대표자 · 임원)은 runAccrual이 건너뛴다
  // 월차는 날짜가 시프티와 며칠씩 다를 수 있어(25일 · 27일 등) 날짜 대신 개수로 이어 간다: k번째 월차는 시프티에서 받은 월차가 k개보다 적을 때만
  const keep = (employeeId: string, lot: PlannedLot) => {
    if (!AUTO_KINDS.has(lot.kind) || lot.grantedOn < AUTO_ACCRUAL_FROM) return false;
    if (lot.kind === 'monthly') return (lot.basis.month ?? 0) > (migratedDays.get(employeeId) ?? 0);
    return lot.grantedOn > (lastMigrated.get(employeeId) ?? '');
  };
  const createdIds: string[] = [];
  const res = await runAccrual({ asOf, me, keep, createdIds });
  const decided = createdIds.length ? await decideLots({ ids: createdIds, decision: 'approve', me }) : [];
  return { ...res, approved: decided.filter((d) => d.result === 'approved').length };
}

/**
 * 그 직원의 휴가 신청을 원장에 맞춘다(연습 · 운영 각각). 승인된 지급 건이 없으면 아무것도 하지 않는다.
 * 가장 이른 지급 건의 사용 시작일 뒤에 시작한 신청과, 이미 원장에 줄이 있는 신청만 본다.
 */
export async function syncEmployeeLedger(employeeId: string, actorId: string | null): Promise<{ added: number; locked: number }> {
  const c = db();
  const lots = await loadLots({ employeeId, states: ['APPROVED'] });
  let entries: Entry[] = await loadEntries(employeeId);
  if (lots.length === 0 && !entries.some((e) => e.requestId)) return { added: 0, locked: 0 };
  const since = lots.map((l) => l.usableFrom).sort()[0] ?? '9999-12-31';
  const [{ data: reqs, error }, { data: types }] = await Promise.all([
    c.from('leave_requests').select('id, type_code, start_date, days, status, is_test, type_snapshot').eq('employee_id', employeeId).order('start_date').order('created_at').limit(5000),
    c.from('leave_types').select('code, deducts_balance'),
  ]);
  if (error) boom('syncEmployeeLedger', error);
  const deducts = new Set((types ?? []).filter((t) => t.deducts_balance).map((t) => t.code as string));
  const known = new Set(entries.map((e) => e.requestId).filter(Boolean));
  let added = 0, locked = 0, fake = -1;
  for (const r of reqs ?? []) {
    if (r.start_date < since && !known.has(r.id)) continue;
    const plan = planRequest({ req: { id: r.id as string, startDate: r.start_date as string, days: Number(r.days), approved: r.status === 'approved', deducts: (r.type_snapshot as { deductsBalance?: boolean } | null)?.deductsBalance ?? deducts.has(r.type_code as string), isTest: r.is_test as boolean }, lots, entries });
    if (plan.length === 0) continue;
    const res = await insertEntries(employeeId, plan, actorId);
    added += res.added;
    locked += res.locked;
    // 마감에 막힌 줄이 없을 때만 다음 신청의 계산에 반영한다(막힌 신청은 원장에 없는 것으로 둔다)
    if (res.locked === 0) entries = [...entries, ...plan.map((p) => ({ id: fake--, employeeId, lotId: p.lotId, event: p.event, minutes: p.minutes, effectiveOn: p.effectiveOn, isTest: p.isTest, requestId: p.requestId }))];
  }
  // 선사용이 남아 있고 쓸 수 있는 지급 건이 있으면 그 건에서 갚는다(운영 기준)
  if (lots.length > 0) {
    const off = planOffset(lots, entriesFor(entries, false), toKstDate(new Date()), false);
    if (off.length) {
      const res = await insertEntries(employeeId, off, actorId);
      added += res.added;
      locked += res.locked;
    }
  }
  return { added, locked };
}

/** 휴가를 승인 · 거절 · 취소한 뒤에 부른다. 원장 맞추기가 실패해도 그 처리는 이미 끝난 것이다 — 실패는 서버 기록에만 남긴다 */
export async function syncEmployeeLedgerSafe(employeeId: string, actorId: string | null): Promise<void> {
  try {
    await syncEmployeeLedger(employeeId, actorId);
  } catch (e) {
    console.error(JSON.stringify({ route: 'leave-ledger', code: 'sync_failed', detail: String((e as Error)?.message ?? e).slice(0, 200) }));
  }
}

// ── 소멸 ──
/** 사용 기간이 끝난 지급 건의 남은 분(운영 기준). 화면이 먼저 보여 주고, 관리자가 눌러야 소멸 줄이 들어간다 */
export async function loadExpiring(asOf: string): Promise<{ lot: LotRow; minutes: number }[]> {
  const [lots, entries] = await Promise.all([loadLots({ states: ['APPROVED'] }), loadEntries()]);
  const live = entries.filter((e) => !e.isTest);
  const by = new Map(lots.map((l) => [l.id, l]));
  return planExpiry(lots, live, asOf).map((e) => ({ lot: by.get(e.lotId!)!, minutes: -e.minutes }));
}
export async function runExpiry(args: { asOf: string; me: Me }): Promise<{ expired: number; locked: number }> {
  const c = db();
  const [lots, entries] = await Promise.all([loadLots({ states: ['APPROVED'] }), loadEntries()]);
  const plan = planExpiry(lots, entries.filter((e) => !e.isTest), args.asOf);
  if (plan.length === 0) return { expired: 0, locked: 0 };
  const { data: run } = await c.from('leave_runs').insert({ kind: 'expiry', as_of: args.asOf, actor_id: args.me.id }).select('id').single();
  const by = new Map(lots.map((l) => [l.id, l.employeeId]));
  let expired = 0, locked = 0;
  for (const e of plan) {
    const r = await insertEntries(by.get(e.lotId!)!, [e], args.me.id);
    expired += r.added;
    locked += r.locked;
  }
  if (run) await c.from('leave_runs').update({ status: locked ? 'partial' : 'done', summary: { expired, locked }, ended_at: new Date().toISOString() }).eq('id', run.id);
  return { expired, locked };
}

// ── 이월 (M5) ──
/**
 * 사용 기간이 끝난 지급 건의 남은 분을 정책 한도까지 새 지급 건(이월)으로 넘기고, 나머지는 소멸로 적는다.
 * 관리자가 건마다 눌러야 한다 — 자동으로 넘기지 않는다. 이월 지급 건은 누른 관리자가 승인한 것으로 남는다.
 */
export async function carryLot(args: { lotId: string; me: Me }): Promise<{ result: 'carried' | 'nothing' | 'not_expired' | 'no_policy' | 'locked'; carried: number; expired: number }> {
  const c = db();
  const today = toKstDate(new Date());
  const { data: row } = await c.from('leave_grant_lots').select('*').eq('id', args.lotId).maybeSingle();
  if (!row) throw new ApiError(404, 'not_found');
  const lot = toLot(row);
  const policy = (await loadDefaultPolicies())[0]?.policy;
  if (!policy || policy.carryMaxDays <= 0) return { result: 'no_policy', carried: 0, expired: 0 };
  if (lot.state !== 'APPROVED' || lot.usableTo === null || lot.usableTo > today) return { result: 'not_expired', carried: 0, expired: 0 };
  const left = (await loadEntries(lot.employeeId)).filter((e) => !e.isTest && e.lotId === lot.id).reduce((a, e) => a + e.minutes, 0);
  const { carry, expire } = splitCarry(left, policy);
  if (carry <= 0) return { result: 'nothing', carried: 0, expired: 0 };
  // 먼저 옛 건에서 빼는 줄을 넣는다 — 마감에 막히면 새 건을 만들지 않는다
  const out = await insertEntries(lot.employeeId, [{ lotId: lot.id, event: 'carry_out', minutes: -carry, effectiveOn: lot.usableTo, isTest: false, requestId: null, dedupeKey: `carry_out:${lot.id}` }], args.me.id);
  if (out.locked) return { result: 'locked', carried: 0, expired: 0 };
  const { data: made, error } = await c
    .from('leave_grant_lots')
    .insert({
      employee_id: lot.employeeId, type_code: lot.typeCode, lot_kind: 'carry', accrual_from: lot.accrualFrom, accrual_to: lot.accrualTo, granted_on: lot.usableTo, usable_from: lot.usableTo, usable_to: addMonths(lot.usableTo, policy.carryValidMonths),
      quantity_minutes: carry, day_minutes: lot.dayMinutes, basis: { rule: 'carry', from: lot.id }, source_ref: lot.id, dedupe_key: `carry:${lot.id}`, state: 'APPROVED', decided_by: args.me.id, decided_at: new Date().toISOString(), created_by: args.me.id,
    })
    .select('id')
    .single();
  let newId = made?.id as string | undefined;
  if (error?.code === '23505') newId = ((await c.from('leave_grant_lots').select('id').eq('dedupe_key', `carry:${lot.id}`).in('state', ['CANDIDATE', 'APPROVED']).maybeSingle()).data?.id as string | undefined) ?? undefined;
  else if (error) boom('carryLot.insert', error);
  if (!newId) boom('carryLot.find', null);
  const rest: NewEntry[] = [{ lotId: newId!, event: 'carry_in', minutes: carry, effectiveOn: lot.usableTo, isTest: false, requestId: null, dedupeKey: `grant:${newId}` }];
  if (expire > 0) rest.push({ lotId: lot.id, event: 'expire', minutes: -expire, effectiveOn: lot.usableTo, isTest: false, requestId: null, dedupeKey: `expire:${lot.id}` });
  await insertEntries(lot.employeeId, rest, args.me.id);
  await syncEmployeeLedger(lot.employeeId, args.me.id);
  return { result: 'carried', carried: carry, expired: expire };
}

// ── 퇴사자 연차 정산 (M5) ──
export type SettlementRow = { id: string; employeeId: string; retireOn: string; revision: number; snapshot: Settlement; unusedMinutes: number; advanceMinutes: number; state: 'CANDIDATE' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED'; createdAt: string; decidedAt: string | null };
const toSettlement = (r: Row): SettlementRow => ({ id: r.id as string, employeeId: r.employee_id as string, retireOn: r.retire_on as string, revision: r.revision as number, snapshot: r.snapshot as Settlement, unusedMinutes: r.unused_minutes as number, advanceMinutes: r.advance_minutes as number, state: r.state as SettlementRow['state'], createdAt: r.created_at as string, decidedAt: r.decided_at as string | null });

export async function loadSettlements(employeeId: string): Promise<SettlementRow[]> {
  const { data, error } = await db().from('leave_settlements').select('*').eq('employee_id', employeeId).order('created_at', { ascending: false });
  if (error) boom('loadSettlements', error);
  return (data ?? []).map(toSettlement);
}

async function computeSettlement(employeeId: string, retireOn: string): Promise<Settlement> {
  const [lots, entries, policies, { data: p }] = await Promise.all([loadLots({ employeeId }), loadEntries(employeeId), loadDefaultPolicies(), db().from('profiles').select('joined_on').eq('id', employeeId).maybeSingle()]);
  if (!policies[0]) throw new ApiError(409, 'leave_policy_missing');
  const s = settleLeave({ lots, entries: entriesFor(entries, false), retireOn, hiredOn: (p?.joined_on as string | null) ?? null, policy: policies[0].policy });
  // 남은 연차 수당 (2026-10-20) — 마지막 근무일(퇴사일 전날)의 계약 · 매달 수당으로 1일 통상임금을 낸다. 퇴사일에 계약이 남아 있으면 그것을 쓴다
  const lastDay = addDays(retireOn, -1);
  const [pay, items] = await Promise.all([loadStaffPay(employeeId), loadItems('PAYMENT', lastDay)]);
  const con = versionAt(pay.contracts, lastDay) ?? versionAt(pay.contracts, retireOn);
  const assigned: PayoutItem[] = pay.items
    .filter((a) => a.validFrom <= lastDay && (a.validTo === null || lastDay < a.validTo))
    .flatMap((a) => {
      const it = items.find((x) => x.code === a.itemCode);
      const amount = a.amount ?? it?.defaultAmount ?? null;
      return it && amount !== null ? [{ code: it.code, label: it.koName, amount, ordinaryWage: it.ordinaryWage }] : [];
    });
  return { ...s, payout: leavePayout({ contract: con, items: assigned, unusedMinutes: s.unusedMinutes, dayMinutes: policies[0].policy.dayMinutes }) };
}

/** 퇴사일 기준 정산 후보를 만든다. 앞서 만든 후보는 「대체됨」으로 바꾼다. 승인하기 전에는 원장에 아무것도 넣지 않는다 */
export async function createSettlement(args: { employeeId: string; retireOn: string; me: Me }): Promise<SettlementRow> {
  const c = db();
  const snapshot = await computeSettlement(args.employeeId, args.retireOn);
  const prev = await loadSettlements(args.employeeId);
  if (prev.some((s) => s.state === 'APPROVED' && s.retireOn === args.retireOn)) throw new ApiError(409, 'leave_settlement_done');
  for (const s of prev.filter((x) => x.state === 'CANDIDATE')) await c.from('leave_settlements').update({ state: 'SUPERSEDED' }).eq('id', s.id).eq('state', 'CANDIDATE');
  const revision = Math.max(0, ...prev.filter((s) => s.retireOn === args.retireOn).map((s) => s.revision)) + 1;
  const { data, error } = await c.from('leave_settlements').insert({ employee_id: args.employeeId, retire_on: args.retireOn, revision, snapshot, unused_minutes: snapshot.unusedMinutes, advance_minutes: snapshot.advanceMinutes, created_by: args.me.id }).select('*').single();
  if (error || !data) boom('createSettlement', error);
  return toSettlement(data!);
}

/** 승인: 후보를 만든 뒤 원장이 바뀌지 않았을 때만. 지급 건마다 남은 분을 「정산」 줄로 0으로 만든다(퇴사일 날짜) */
export async function decideSettlement(args: { id: string; decision: 'approve' | 'reject'; me: Me }): Promise<'approved' | 'rejected'> {
  const c = db();
  const { data: row } = await c.from('leave_settlements').select('*').eq('id', args.id).maybeSingle();
  if (!row) throw new ApiError(404, 'not_found');
  const s = toSettlement(row);
  if (s.state !== 'CANDIDATE') throw new ApiError(409, 'already');
  const now = new Date().toISOString();
  if (args.decision === 'reject') {
    const u = await c.from('leave_settlements').update({ state: 'REJECTED', decided_by: args.me.id, decided_at: now }).eq('id', s.id).eq('state', 'CANDIDATE');
    if (u.error) boom('decideSettlement.reject', u.error);
    return 'rejected';
  }
  const fresh = await computeSettlement(s.employeeId, s.retireOn);
  if (fresh.unusedMinutes !== s.unusedMinutes || fresh.advanceMinutes !== s.advanceMinutes) throw new ApiError(409, 'leave_settlement_stale');
  const res = await insertEntries(s.employeeId, s.snapshot.lots.map((l) => ({ lotId: l.lotId, event: 'settle' as const, minutes: -l.minutes, effectiveOn: s.retireOn, isTest: false, requestId: null, dedupeKey: `settle:${s.id}:${l.lotId}` })), args.me.id);
  if (res.locked) throw new ApiError(409, 'period_locked');
  const u = await c.from('leave_settlements').update({ state: 'APPROVED', decided_by: args.me.id, decided_at: now }).eq('id', s.id).eq('state', 'CANDIDATE');
  if (u.error) boom('decideSettlement.approve', u.error);
  return 'approved';
}

// ── 휴가 종류별 신청 규칙 (M5) ──
/** 지금 적용되는 규칙 (종류 코드 → 규칙 · 판 번호). 판이 없는 종류는 제한 없음 */
export async function loadTypeRules(): Promise<Map<string, { rule: LeaveTypeRule; version: number; validFrom: string }>> {
  const { data, error } = await db().from('leave_type_policy_versions').select('type_code, payload, version, valid_from').eq('status', 'active').is('valid_to', null);
  if (error) boom('loadTypeRules', error);
  return new Map((data ?? []).map((r) => [r.type_code as string, { rule: validateTypeRule(r.payload) ?? NO_TYPE_RULE, version: r.version as number, validFrom: r.valid_from as string }]));
}

export async function saveTypeRule(args: { code: string; rule: LeaveTypeRule; expectedVersion: number; me: Me }): Promise<void> {
  const c = db();
  const { data: rows, error } = await c.from('leave_type_policy_versions').select('id, version, valid_from, valid_to').eq('type_code', args.code).eq('status', 'active').order('version', { ascending: false }).limit(1);
  if (error) boom('saveTypeRule.read', error);
  const last = rows?.[0];
  if ((last?.version ?? 0) !== args.expectedVersion) throw new ApiError(409, 'leave_version_conflict');
  const today = toKstDate(new Date());
  // 같은 날 다시 고치면 시작일을 하루 뒤로 잡는다(판의 기간이 겹치지 않게) — 쓰는 값은 늘 가장 새 판이다
  const validFrom = last && (last.valid_from as string) >= today ? addDays(last.valid_from as string, 1) : today;
  if (last) {
    const u = await c.from('leave_type_policy_versions').update({ valid_to: validFrom }).eq('id', last.id);
    if (u.error) boom('saveTypeRule.close', u.error);
  }
  const ins = await c.from('leave_type_policy_versions').insert({ type_code: args.code, payload: args.rule, valid_from: validFrom, version: (last?.version ?? 0) + 1, supersedes_id: last?.id ?? null, created_by: args.me.id });
  if (ins.error) {
    if (last) await c.from('leave_type_policy_versions').update({ valid_to: null }).eq('id', last.id);
    if (ins.error.code === '23505' || ins.error.code === '23P01') throw new ApiError(409, 'leave_version_conflict');
    boom('saveTypeRule.insert', ins.error);
  }
}

// ── 휴가 정책 그룹 (PRD 34.2 L06 · L07, 36.2) — 부서와 다른 개념: 연차 생성 기준 · 생성 제외를 정하는 묶음. 2026-10-15 ──
export type PolicyGroup = { id: string; name: string; excluded: boolean; isDefault: boolean; ownPolicy: boolean; members: { id: string; employeeId: string; validFrom: string }[] };
/** 켜진 그룹 전부 + 오늘 소속된 직원. 기본 그룹이 맨 앞 */
export async function loadPolicyGroups(today: string): Promise<PolicyGroup[]> {
  const c = db();
  const [{ data: gs, error }, { data: ms }, { data: vs }] = await Promise.all([
    c.from('leave_policy_groups').select('id, name, excluded, is_default, sort').eq('active', true).order('sort').order('created_at'),
    c.from('leave_policy_members').select('id, employee_id, group_id, valid_from, valid_to').eq('active', true),
    c.from('leave_policy_versions').select('group_id').eq('status', 'active'),
  ]);
  if (error) boom('loadPolicyGroups', error);
  const own = new Set((vs ?? []).map((v) => v.group_id as string));
  const now = (ms ?? []).filter((m) => (m.valid_from as string) <= today && (m.valid_to === null || today < (m.valid_to as string)));
  return (gs ?? []).map((g) => ({
    id: g.id as string, name: g.name as string, excluded: !!g.excluded, isDefault: !!g.is_default, ownPolicy: !g.is_default && own.has(g.id as string),
    members: now.filter((m) => m.group_id === g.id).map((m) => ({ id: m.id as string, employeeId: m.employee_id as string, validFrom: m.valid_from as string })),
  })).sort((a, b) => (a.isDefault === b.isDefault ? 0 : a.isDefault ? -1 : 1));
}
export async function addPolicyGroup(args: { name: string; excluded: boolean; me: Me }): Promise<{ id: string }> {
  const { data, error } = await db().from('leave_policy_groups').insert({ name: args.name, excluded: args.excluded, created_by: args.me.id }).select('id').single();
  if (error || !data) boom('addPolicyGroup', error);
  return { id: data!.id as string };
}
/** 그룹 이름 · 제외 여부 고치기, 끄기(소속된 사람이 있으면 끌 수 없다 — 먼저 옮긴다) */
export async function setPolicyGroup(args: { id: string; name?: string; excluded?: boolean; active?: boolean; me: Me }): Promise<void> {
  const c = db();
  const { data: g } = await c.from('leave_policy_groups').select('id, is_default').eq('id', args.id).eq('active', true).maybeSingle();
  if (!g) throw new ApiError(404, 'not_found');
  if (g.is_default && (args.excluded || args.active === false)) throw new ApiError(409, 'leave_group_default'); // 기본 그룹은 제외 그룹이 될 수 없고 끌 수 없다
  if (args.active === false) {
    const { count } = await c.from('leave_policy_members').select('id', { count: 'exact', head: true }).eq('group_id', args.id).eq('active', true).is('valid_to', null);
    if ((count ?? 0) > 0) throw new ApiError(409, 'leave_group_in_use');
  }
  const patch: Row = { updated_by: args.me.id };
  if (args.name !== undefined) patch.name = args.name;
  if (args.excluded !== undefined) patch.excluded = args.excluded;
  if (args.active !== undefined) patch.active = args.active;
  const { error } = await c.from('leave_policy_groups').update(patch).eq('id', args.id);
  if (error) boom('setPolicyGroup', error);
}
/**
 * 직원을 그룹에 넣는다(그 날부터). 지금 든 그룹은 그 날로 닫는다. groupId가 null이면 기본으로 되돌린다(소속을 닫기만).
 * 지난 날짜로 옮기면 이미 만든 연차 후보 · 지급 건은 그대로다(다음 「연차 후보 만들기」부터 새 그룹 기준) — 화면에 그렇게 적는다.
 */
export async function setPolicyMember(args: { employeeId: string; groupId: string | null; validFrom: string; reason: string | null; me: Me }): Promise<void> {
  const c = db();
  const { data: cur } = await c.from('leave_policy_members').select('id, group_id, valid_from').eq('employee_id', args.employeeId).eq('active', true).is('valid_to', null).maybeSingle();
  if (cur && cur.group_id === args.groupId) return;
  if (cur) {
    // 같은 날 다시 옮기면 앞 소속을 끈다(기간이 0일이 되지 않게)
    const u = (cur.valid_from as string) >= args.validFrom ? await c.from('leave_policy_members').update({ active: false, updated_by: args.me.id }).eq('id', cur.id) : await c.from('leave_policy_members').update({ valid_to: args.validFrom, updated_by: args.me.id }).eq('id', cur.id);
    if (u.error) boom('setPolicyMember.close', u.error);
  }
  if (!args.groupId) return;
  const { data: g } = await c.from('leave_policy_groups').select('id').eq('id', args.groupId).eq('active', true).maybeSingle();
  if (!g) throw new ApiError(404, 'not_found');
  const { error } = await c.from('leave_policy_members').insert({ employee_id: args.employeeId, group_id: args.groupId, valid_from: args.validFrom, reason: args.reason, created_by: args.me.id });
  if (error?.code === '23P01') throw new ApiError(409, 'leave_member_overlap');
  if (error) boom('setPolicyMember.insert', error);
}
/** 그룹만의 기준 시작 — 기본 그룹의 지금 기준을 그대로 옮겨 1판을 만든다. 그 뒤 고치면 그 그룹에만 적용된다 */
export async function startGroupPolicy(args: { groupId: string; me: Me }): Promise<void> {
  const c = db();
  const base = (await loadDefaultPolicies())[0];
  if (!base) throw new ApiError(409, 'leave_policy_missing');
  const { data: g } = await c.from('leave_policy_groups').select('id, is_default, excluded').eq('id', args.groupId).eq('active', true).maybeSingle();
  if (!g || g.is_default || g.excluded) throw new ApiError(409, 'leave_group_default');
  const { error } = await c.from('leave_policy_versions').insert({ group_id: args.groupId, payload: base.policy, valid_from: '2000-01-01', version: 1, reason: 'copy:default', created_by: args.me.id });
  if (error && error.code !== '23505' && error.code !== '23P01') boom('startGroupPolicy', error);
}

/**
 * 원장을 시작한 직원(승인된 지급 건이 있는 직원)의 그 날 잔여 — 없으면 null(예전 계산을 쓴다). 2026-10-15 미구현 목록 34번:
 * 실제 직원에게 원장으로 연차를 발생시켰는데 신청 · 화면은 예전 계산(받은 연차 입력)을 봐서 「연차 미입력」으로 막혔다.
 * advanceMaxDays: 기본 그룹 기준의 선사용 한도(일) — 잔여보다 이만큼까지는 더 신청할 수 있다.
 */
export async function ledgerFor(employeeId: string, asOf: string, practice: boolean): Promise<{ grantedDays: number; usedDays: number; remainingDays: number; expiredDays: number; advanceDays: number; advanceMaxDays: number } | null> {
  const lots = await loadLots({ employeeId, states: ['APPROVED'] });
  if (lots.length === 0) return null;
  const [entries, policies] = await Promise.all([loadEntries(employeeId), policiesForEmployee(employeeId, asOf)]);
  const b = ledgerBalance(lots, entriesFor(entries, practice), asOf);
  const d = (m: number) => minutesToDays(m);
  return { grantedDays: d(b.granted), usedDays: d(b.used), remainingDays: d(b.remaining), expiredDays: d(b.expired), advanceDays: d(b.advance), advanceMaxDays: policyAt(policies, asOf)?.policy.advanceMaxDays ?? 0 };
}

/**
 * 여러 직원의 원장 잔여를 한 번에 — 관리자 휴가 화면용 (검수 R21, 2026-10-15: 직원마다 ledgerFor를 부르면 30명에 요청 수백 건).
 * 지급 건 · 원장 줄은 한 번씩만 읽고, 정책은 그룹마다 한 번만 읽는다. 결과는 ledgerFor와 같다.
 */
export async function ledgerForMany(employeeIds: readonly string[], asOf: string, practice: boolean): Promise<Map<string, NonNullable<Awaited<ReturnType<typeof ledgerFor>>>>> {
  const out = new Map<string, NonNullable<Awaited<ReturnType<typeof ledgerFor>>>>();
  const want = new Set(employeeIds);
  const lots = (await loadLots({ states: ['APPROVED'] })).filter((l) => want.has(l.employeeId));
  if (lots.length === 0) return out;
  const withLots = [...new Set(lots.map((l) => l.employeeId))];
  const entries = (await loadEntries()).filter((e) => withLots.includes(e.employeeId));
  const policyCache = new Map<string, Promise<PolicyRow[]>>();
  const d = (m: number) => minutesToDays(m);
  // 직원마다 소속 그룹을 따로 묻지 않고 한 번에 읽는다 (2026-10-19 속도: 23명이면 23번을 차례로 기다렸다)
  const { data: members, error: memberError } = await db().from('leave_policy_members').select('employee_id, group_id').in('employee_id', withLots).eq('active', true).lte('valid_from', asOf).or(`valid_to.is.null,valid_to.gt.${asOf}`);
  if (memberError) boom('ledgerForMany.members', memberError);
  const groupOf = new Map((members ?? []).map((m) => [m.employee_id as string, m.group_id as string]));
  for (const id of withLots) {
    const key = groupOf.get(id) ?? 'default';
    if (!policyCache.has(key)) policyCache.set(key, policiesForEmployee(id, asOf));
    const policies = await policyCache.get(key)!;
    const b = ledgerBalance(lots.filter((l) => l.employeeId === id), entriesFor(entries.filter((e) => e.employeeId === id), practice), asOf);
    out.set(id, { grantedDays: d(b.granted), usedDays: d(b.used), remainingDays: d(b.remaining), expiredDays: d(b.expired), advanceDays: d(b.advance), advanceMaxDays: policyAt(policies, asOf)?.policy.advanceMaxDays ?? 0 });
  }
  return out;
}

export { lotRemaining };

/** 신청 시점의 그룹과 그 그룹의 정책 판. 독립 기준이 없으면 기본 기준을 따른다. */
async function policiesForEmployee(employeeId: string, asOf: string): Promise<PolicyRow[]> {
  const { data: member, error } = await db().from('leave_policy_members').select('group_id').eq('employee_id', employeeId).eq('active', true).lte('valid_from', asOf).or(`valid_to.is.null,valid_to.gt.${asOf}`).maybeSingle();
  if (error) boom('policyForEmployee.member', error);
  if (member) {
    const { data: group, error: groupError } = await db().from('leave_policy_groups').select('id, name, excluded').eq('id', member.group_id).eq('active', true).maybeSingle();
    if (groupError) boom('policyForEmployee.group', groupError);
    if (group?.excluded) return [];
    if (group) { const policies = await loadGroupPolicies(group); if (policyAt(policies, asOf)) return policies; }
  }
  return loadDefaultPolicies();
}
