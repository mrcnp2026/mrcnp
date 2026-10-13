// 휴가 원장 읽기 · 쓰기 (PRD v1.3 36 · 38장). 서버 전용 — 부르는 쪽이 먼저 관리자인지 확인한다.
// ★ 지금은 「대조 단계」다: 직원 화면과 휴가 화면의 잔여는 예전 계산(leave_grants) 그대로이고, 원장은 옆에서 같이 쌓아 숫자를 맞춰 본다.
// ★ 원장은 지급 건이 승인된 직원만 쌓는다 — 지급 건이 하나도 없는 직원의 휴가를 전부 「선사용」으로 적지 않기 위해서다.
// ★ 원장 줄은 고치거나 지울 수 없다(0035). 그래서 넣기 전에 계획(planRequest · planExpiry)을 세우고, 같은 열쇠는 한 번만 들어간다.
import 'server-only';
import { ApiError } from '@/lib/api';
import type { Me } from '@/lib/auth';
import { DAY_MINUTES, lotRemaining, planAccrual, planExpiry, planRequest, STANDARD_LEAVE_POLICY, validateLeavePolicy, type Entry, type LeavePolicy, type Lot, type NewEntry, type PlannedLot } from '@/lib/leave-ledger';
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
  const { data, error } = await q.order('granted_on', { ascending: false }).limit(5000);
  if (error) boom('loadLots', error);
  return (data ?? []).map(toLot);
}
export async function loadEntries(employeeId?: string): Promise<EntryRow[]> {
  let q = db().from('leave_ledger').select('*');
  if (employeeId) q = q.eq('employee_id', employeeId);
  const { data, error } = await q.order('id', { ascending: true }).limit(20000);
  if (error) boom('loadEntries', error);
  return (data ?? []).map(toEntry);
}

// ── 정책 ──
export type PolicyRow = { id: string; groupId: string; groupName: string; policy: LeavePolicy; validFrom: string; validTo: string | null; version: number; verification: 'TEMPORARY' | 'REVIEW_REQUIRED' | 'VERIFIED'; reason: string | null; createdAt: string };

/** 기본 그룹의 정책 판 전부 (새 것부터). 아직 시작하지 않았으면 빈 목록 */
export async function loadDefaultPolicies(): Promise<PolicyRow[]> {
  const c = db();
  const { data: g } = await c.from('leave_policy_groups').select('id, name').eq('is_default', true).eq('active', true).maybeSingle();
  if (!g) return [];
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
export async function saveLeavePolicy(args: { policy: LeavePolicy; validFrom: string; reason: string; expectedVersion: number; me: Me }): Promise<void> {
  const c = db();
  const rows = await loadDefaultPolicies();
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
export async function runAccrual(args: { asOf: string; me: Me }): Promise<AccrualResult> {
  const c = db();
  const policies = await loadDefaultPolicies();
  const row = policyAt(policies, args.asOf);
  if (!row) throw new ApiError(409, 'leave_policy_missing');
  const [{ data: staff, error: e1 }, { data: members }, { data: groups }, { data: keys }] = await Promise.all([
    c.from('profiles').select('id, joined_on').eq('active', true),
    c.from('leave_policy_members').select('employee_id, group_id, valid_from, valid_to').eq('active', true),
    c.from('leave_policy_groups').select('id, excluded').eq('active', true),
    c.from('leave_grant_lots').select('dedupe_key').in('state', ['CANDIDATE', 'APPROVED']).limit(20000),
  ]);
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
    for (const p of planAccrual({ hiredOn: s.joined_on as string, asOf: args.asOf, policy: row.policy, liveOnly: true })) {
      const key = lotKey(s.id as string, p);
      if (have.has(key)) { res.existing++; continue; }
      rows.push({
        employee_id: s.id, type_code: ACCRUAL_TYPE, lot_kind: p.kind, accrual_from: p.accrualFrom, accrual_to: p.accrualTo, granted_on: p.grantedOn, usable_from: p.usableFrom, usable_to: p.usableTo,
        quantity_minutes: p.minutes, day_minutes: p.dayMinutes, policy_version_id: row.id, basis: p.basis, dedupe_key: key, run_id: run!.id, created_by: args.me.id,
      });
    }
  }
  for (const r of rows) {
    const { error } = await c.from('leave_grant_lots').insert(r);
    if (!error) res.created++;
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
export async function addManualLot(args: { employeeId: string; kind: 'manual' | 'carry' | 'compensatory' | 'migrated'; minutes: number; usableFrom: string; usableTo: string | null; note: string; me: Me }): Promise<DecideResult> {
  const c = db();
  const { data: p } = await c.from('profiles').select('id').eq('id', args.employeeId).maybeSingle();
  if (!p) throw new ApiError(404, 'not_found');
  const { data, error } = await c
    .from('leave_grant_lots')
    .insert({
      employee_id: args.employeeId, type_code: ACCRUAL_TYPE, lot_kind: args.kind, granted_on: args.usableFrom, usable_from: args.usableFrom, usable_to: args.usableTo, quantity_minutes: args.minutes, day_minutes: DAY_MINUTES,
      basis: { rule: 'manual' }, dedupe_key: `manual:${crypto.randomUUID()}`, note: args.note, created_by: args.me.id,
    })
    .select('id')
    .single();
  if (error || !data) boom('addManualLot', error);
  const [r] = await decideLots({ ids: [data!.id as string], decision: 'approve', me: args.me });
  if (r.result === 'locked') await c.from('leave_grant_lots').update({ state: 'WITHDRAWN' }).eq('id', data!.id);
  return r;
}

// ── 신청 ↔ 원장 ──
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
    c.from('leave_requests').select('id, type_code, start_date, days, status, is_test').eq('employee_id', employeeId).order('start_date').order('created_at').limit(5000),
    c.from('leave_types').select('code, deducts_balance'),
  ]);
  if (error) boom('syncEmployeeLedger', error);
  const deducts = new Set((types ?? []).filter((t) => t.deducts_balance).map((t) => t.code as string));
  const known = new Set(entries.map((e) => e.requestId).filter(Boolean));
  let added = 0, locked = 0, fake = -1;
  for (const r of reqs ?? []) {
    if (r.start_date < since && !known.has(r.id)) continue;
    const plan = planRequest({ req: { id: r.id as string, startDate: r.start_date as string, days: Number(r.days), approved: r.status === 'approved', deducts: deducts.has(r.type_code as string), isTest: r.is_test as boolean }, lots, entries });
    if (plan.length === 0) continue;
    const res = await insertEntries(employeeId, plan, actorId);
    added += res.added;
    locked += res.locked;
    // 마감에 막힌 줄이 없을 때만 다음 신청의 계산에 반영한다(막힌 신청은 원장에 없는 것으로 둔다)
    if (res.locked === 0) entries = [...entries, ...plan.map((p) => ({ id: fake--, employeeId, lotId: p.lotId, event: p.event, minutes: p.minutes, effectiveOn: p.effectiveOn, isTest: p.isTest, requestId: p.requestId }))];
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

export { lotRemaining };
