// 계정 — 비밀번호 설정·변경·로그인 초기화, 로그인 실패 횟수. DB와 인증 서버를 건드리는 쪽. 서버 전용. 판단은 login-rules.ts가 한다.
// ★ 비밀번호 원문은 어디에도 남기지 않는다 (로그·변경 기록·오류 기록 금지). 인증 서버(Supabase Auth)만 지문으로 보관한다.
import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { createClient as createPlainClient } from '@supabase/supabase-js';
import { LOGIN_MAX_FAILS, LOGIN_WINDOW_MIN, normalizeLoginId, resolveLoginId, type LoginCandidate } from '@/lib/login-rules';
import { hashToken } from '@/lib/passkey';
import { staffEmail } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/admin';

export type InviteTarget = { inviteId: string; employeeId: string; employeeNo: string; name: string; locale: string };

/** 초대(링크·8자리 코드) 확인 — 비밀번호를 처음 만들거나 다시 만들 때. 못 쓰는 초대면 오류 코드를 돌려준다 */
export async function findInvite(token: string): Promise<InviteTarget | 'invite_invalid' | 'employee_inactive'> {
  const { data, error } = await createAdminClient()
    .from('invites')
    .select('id, employee_id, expires_at, used_at, revoked_at, profiles!invites_employee_id_fkey(name, employee_no, active, locale)')
    .eq('token_hash', hashToken(token))
    .maybeSingle();
  if (error) throw new Error(`findInvite: ${error.code}`);
  if (!data || data.used_at || data.revoked_at || new Date(data.expires_at) <= new Date()) return 'invite_invalid';
  const p = data.profiles as unknown as { name: string; employee_no: string | null; active: boolean; locale: string };
  if (!p.active || !p.employee_no) return 'employee_inactive';
  return { inviteId: data.id, employeeId: data.employee_id, employeeNo: p.employee_no, name: p.name, locale: p.locale };
}

/** 초대를 사용 처리한다. 조건부 update 한 문장 — 두 요청이 동시에 와도 한쪽만 true (R-4) */
export async function consumeInvite(inviteId: string): Promise<boolean> {
  const now = new Date().toISOString();
  const { data, error } = await createAdminClient()
    .from('invites')
    .update({ used_at: now })
    .eq('id', inviteId)
    .is('used_at', null)
    .is('revoked_at', null)
    .gt('expires_at', now)
    .select('id');
  if (error) throw new Error(`consumeInvite: ${error.code}`);
  return (data?.length ?? 0) === 1;
}

export async function setPassword(employeeId: string, password: string): Promise<void> {
  const db = createAdminClient();
  const { error } = await db.auth.admin.updateUserById(employeeId, { password });
  if (error) throw new Error(`setPassword: ${error.status} ${error.code}`);
  const { error: e2 } = await db.from('profiles').update({ password_set_at: new Date().toISOString(), updated_by: employeeId }).eq('id', employeeId);
  if (e2) throw new Error(`setPassword.profile: ${e2.code}`);
}

/** 이 시각(초)보다 먼저 로그인한 기기를 모두 끊는다. 방금 받은 세션의 로그인 시각을 넘기면 그 기기만 남는다 */
export async function revokeSessionsBefore(employeeId: string, authTime: number, actorId: string): Promise<void> {
  const { error } = await createAdminClient()
    .from('profiles')
    .update({ sessions_revoked_at: new Date(authTime * 1000).toISOString(), updated_by: actorId })
    .eq('id', employeeId);
  if (error) throw new Error(`revokeSessionsBefore: ${error.code}`);
}

/**
 * 로그인 초기화 (분실·도용 의심): 모든 기기 로그아웃 + 비밀번호를 아무도 모르는 값으로 바꿈.
 * 직원은 초대 링크를 다시 받아 비밀번호를 새로 만든다. 기록은 그대로다.
 */
export async function resetLogin(employeeId: string, actorId: string): Promise<void> {
  const db = createAdminClient();
  const { error } = await db.auth.admin.updateUserById(employeeId, { password: randomBytes(32).toString('base64url') });
  if (error) throw new Error(`resetLogin: ${error.status} ${error.code}`);
  const { error: e2 } = await db
    .from('profiles')
    // 1초 뒤로 잡는다 — 같은 초에 로그인한 세션까지 끊기게 (login-rules.sessionRevoked는 같은 초를 살린다)
    .update({ password_set_at: null, sessions_revoked_at: new Date(Date.now() + 1000).toISOString(), updated_by: actorId })
    .eq('id', employeeId);
  if (e2) throw new Error(`resetLogin.profile: ${e2.code}`);
}

/** 지금 비밀번호가 맞는지만 본다. 요청 쿠키의 세션은 건드리지 않는다 (따로 만든 연결) */
export async function passwordMatches(employeeNo: string, password: string): Promise<boolean> {
  const c = createPlainClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await c.auth.signInWithPassword({ email: staffEmail(employeeNo), password });
  if (!error) return true;
  if (error.status === 400 || error.status === 422) return false;
  throw new Error(`passwordMatches: ${error.status} ${error.code}`);
}

/** 입력한 아이디(사번 또는 휴대폰 번호) → 재직 중인 직원 */
export async function findLoginTarget(rawId: unknown): Promise<LoginCandidate | null> {
  const { data, error } = await createAdminClient().from('profiles').select('id, employee_no, phone, active').eq('active', true);
  if (error) throw new Error(`findLoginTarget: ${error.code}`);
  return resolveLoginId(rawId, (data ?? []).map((p) => ({ id: p.id, employeeNo: p.employee_no, phone: p.phone, active: p.active })));
}

// ── 로그인 실패 횟수 (비밀번호 맞히기 방지) ──
const loginKey = (rawId: unknown) => createHash('sha256').update(normalizeLoginId(rawId)).digest('hex');
const windowStart = () => new Date(Date.now() - LOGIN_WINDOW_MIN * 60_000).toISOString();

export async function loginThrottled(rawId: unknown): Promise<boolean> {
  const { count, error } = await createAdminClient()
    .from('login_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('login_key', loginKey(rawId))
    .gt('created_at', windowStart());
  if (error) throw new Error(`loginThrottled: ${error.code}`);
  return (count ?? 0) >= LOGIN_MAX_FAILS;
}

export async function recordLoginFailure(rawId: unknown): Promise<void> {
  const db = createAdminClient();
  await db.from('login_attempts').delete().lt('created_at', new Date(Date.now() - 86_400_000).toISOString());
  const { error } = await db.from('login_attempts').insert({ login_key: loginKey(rawId) });
  if (error) throw new Error(`recordLoginFailure: ${error.code}`);
}

export async function clearLoginFailures(rawId: unknown): Promise<void> {
  await createAdminClient().from('login_attempts').delete().eq('login_key', loginKey(rawId));
}
