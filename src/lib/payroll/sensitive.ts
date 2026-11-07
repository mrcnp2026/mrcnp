// 민감정보(급여-36) 읽기 · 쓰기 · 원문 보기 · 열람 허락. 서버 전용 — 부르는 쪽이 먼저 급여 담당자인지 확인한다(requirePayroll).
// 원문은 DB · 기록 · 오류 어디에도 남기지 않는다. 넣음 · 바꿈 · 지움 · 봄 · 거부는 payroll_sensitive_access_logs에 남는다(고치지 못한다).
// 원문 보기는 다른 관리자가 준 기한 있는 허락이 있어야 하고(스스로 줄 수 없다 — DB 검사), 기록을 못 남기면 보여 주지 않는다.
import 'server-only';
import { ApiError } from '@/lib/api';
import type { Me } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { KEY_VERSION, keysOf, lookupOf, open, parseSensitive, seal, type SensitiveKind } from './sensitive-core';

const db = () => createAdminClient();
const fail = (where: string, e: { code?: string } | null): never => {
  if (e?.code === '23505') throw new ApiError(409, 'payroll_version_conflict'); // 다른 담당자가 먼저 넣었다
  throw new Error(`${where}: ${e?.code ?? 'unknown'}`);
};

export const sensitiveKeyReady = () => !!process.env.PAYROLL_SECRET_KEY;
function keys() {
  const s = process.env.PAYROLL_SECRET_KEY;
  if (!s) throw new ApiError(503, 'sensitive_key_missing');
  return keysOf(s);
}

type Action = 'CREATE' | 'REPLACE' | 'DISABLE' | 'VIEW' | 'DENIED';
async function logAccess(actorId: string, recordId: string | null, action: Action, reason: string | null, requestId?: string) {
  const { error } = await db().from('payroll_sensitive_access_logs').insert({ actor_id: actorId, record_id: recordId, action, reason, request_id: requestId ?? null });
  return error;
}

export type SensitiveRow = { id: string; kind: SensitiveKind; masked: string; needBasis: string; createdAt: string; createdBy: string };
export async function loadSensitive(employeeId: string): Promise<SensitiveRow[]> {
  const { data, error } = await db().from('payroll_sensitive_records').select('id, record_kind, masked, need_basis, created_at, created_by').eq('employee_id', employeeId).eq('active', true);
  if (error) fail('sensitive.load', error);
  return (data ?? []).map((r) => ({ id: r.id, kind: r.record_kind, masked: r.masked, needBasis: r.need_basis, createdAt: r.created_at, createdBy: r.created_by }));
}

export type SensitiveGrant = { id: string; adminId: string; grantedBy: string; reason: string; expiresAt: string };
/** 지금 살아 있는 허락(거두지 않았고 기한 안) */
export async function loadGrants(): Promise<SensitiveGrant[]> {
  const { data, error } = await db().from('payroll_sensitive_grants').select('id, admin_id, granted_by, reason, expires_at').is('revoked_at', null).gt('expires_at', new Date().toISOString()).order('expires_at');
  if (error) fail('sensitive.grants', error);
  return (data ?? []).map((g) => ({ id: g.id, adminId: g.admin_id, grantedBy: g.granted_by, reason: g.reason, expiresAt: g.expires_at }));
}

export async function saveSensitive(a: { employeeId: string; kind: SensitiveKind; raw: unknown; bank?: unknown; needBasis: string; me: Me; requestId?: string }) {
  const k = keys();
  const p = parseSensitive(a.kind, a.raw, a.bank);
  if (!p.ok) throw new ApiError(400, p.code);
  const lookup = lookupOf(k, a.kind, p.value);
  if (a.kind !== 'BANK') {
    // 같은 번호가 다른 직원에게 이미 있으면 막는다(같은 사람을 두 번 등록했거나 잘못 넣음). 누구인지는 알려 주지 않는다
    const { data: dup, error } = await db().from('payroll_sensitive_records').select('id').eq('record_kind', a.kind).eq('lookup_hmac', lookup).eq('active', true).neq('employee_id', a.employeeId).limit(1);
    if (error) fail('sensitive.dup', error);
    if (dup?.length) throw new ApiError(409, 'sensitive_duplicate');
  }
  const { data: cur, error: e1 } = await db().from('payroll_sensitive_records').select('id').eq('employee_id', a.employeeId).eq('record_kind', a.kind).eq('active', true).maybeSingle();
  if (e1) fail('sensitive.current', e1);
  // 바꾸면 앞 줄을 끄고 새 줄을 넣는다(같은 종류는 살아 있는 줄이 하나뿐 — 고유 색인)
  if (cur) {
    const { error } = await db().from('payroll_sensitive_records').update({ active: false, updated_by: a.me.id }).eq('id', cur.id).eq('active', true);
    if (error) fail('sensitive.off', error);
  }
  const { data: row, error: e2 } = await db().from('payroll_sensitive_records')
    .insert({ employee_id: a.employeeId, record_kind: a.kind, ciphertext: seal(k, a.kind, a.employeeId, p.value), key_version: KEY_VERSION, lookup_hmac: lookup, masked: p.masked, need_basis: a.needBasis, created_by: a.me.id })
    .select('id').single();
  if (e2 || !row) {
    if (cur) await db().from('payroll_sensitive_records').update({ active: true, updated_by: a.me.id }).eq('id', cur.id); // 새 줄을 못 넣었으면 앞 줄을 살린다
    fail('sensitive.insert', e2);
  }
  const le = await logAccess(a.me.id, row!.id, cur ? 'REPLACE' : 'CREATE', null, a.requestId);
  if (le) console.error(JSON.stringify({ route: 'sensitive', code: 'log_failed', detail: le.code }));
  return { masked: p.masked };
}

export async function disableSensitive(a: { recordId: string; employeeId: string; me: Me; requestId?: string }) {
  const { data, error } = await db().from('payroll_sensitive_records').update({ active: false, updated_by: a.me.id }).eq('id', a.recordId).eq('employee_id', a.employeeId).eq('active', true).select('id');
  if (error) fail('sensitive.disable', error);
  if (!data?.length) throw new ApiError(404, 'not_found');
  const le = await logAccess(a.me.id, a.recordId, 'DISABLE', null, a.requestId);
  if (le) console.error(JSON.stringify({ route: 'sensitive', code: 'log_failed', detail: le.code }));
}

/** 원문 한 번 보기. 허락이 없으면 거부 기록을 남기고 403 */
export async function revealSensitive(a: { recordId: string; employeeId: string; reason: string; me: Me; requestId?: string }): Promise<string> {
  const k = keys();
  const { data: r, error } = await db().from('payroll_sensitive_records').select('id, record_kind, ciphertext, key_version').eq('id', a.recordId).eq('employee_id', a.employeeId).eq('active', true).maybeSingle();
  if (error) fail('sensitive.read', error);
  if (!r) throw new ApiError(404, 'not_found');
  const { data: g, error: ge } = await db().from('payroll_sensitive_grants').select('id').eq('admin_id', a.me.id).is('revoked_at', null).gt('expires_at', new Date().toISOString()).limit(1);
  if (ge) fail('sensitive.grant', ge);
  if (!g?.length) {
    await logAccess(a.me.id, r.id, 'DENIED', a.reason, a.requestId);
    throw new ApiError(403, 'sensitive_no_grant');
  }
  if (r.key_version !== KEY_VERSION) throw new Error('sensitive.read: key_version');
  const le = await logAccess(a.me.id, r.id, 'VIEW', a.reason, a.requestId);
  if (le) fail('sensitive.log', le); // 기록을 못 남기면 보여 주지 않는다
  try {
    return open(k, r.record_kind, a.employeeId, r.ciphertext);
  } catch {
    throw new ApiError(500, 'sensitive_unreadable'); // 열쇠가 다르다(다른 서버에서 잠근 값 · 열쇠 바뀜)
  }
}

export async function grantSensitive(a: { adminId: string; reason: string; days: number; me: Me }) {
  if (a.adminId === a.me.id) throw new ApiError(400, 'sensitive_self_grant');
  const { data: t, error } = await db().from('profiles').select('id').eq('id', a.adminId).eq('role', 'admin').eq('active', true).maybeSingle();
  if (error) fail('sensitive.target', error);
  if (!t) throw new ApiError(400, 'invalid_input');
  const { error: e } = await db().from('payroll_sensitive_grants').insert({ admin_id: a.adminId, granted_by: a.me.id, reason: a.reason, expires_at: new Date(Date.now() + a.days * 86_400_000).toISOString() });
  if (e) fail('sensitive.grant.insert', e);
}

export async function revokeGrant(a: { grantId: string; me: Me }) {
  const { data, error } = await db().from('payroll_sensitive_grants').update({ revoked_at: new Date().toISOString(), revoked_by: a.me.id }).eq('id', a.grantId).is('revoked_at', null).select('id');
  if (error) fail('sensitive.revoke', error);
  if (!data?.length) throw new ApiError(404, 'not_found');
}
