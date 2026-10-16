// 이메일로 스스로 가입 → 관리자 승인 (2026-10-16 의뢰인 권한-6, DB 묶음 18). 서버 전용.
// ① 신청: 이름 · 이메일 · 휴대폰(선택) · 비밀번호. 로그인 계정(auth)은 이때 만들지만(비밀번호를 다시 받지 않으려고) 직원(profiles)은 아직 없다
//    → 승인 전에는 로그인되지 않는다. 계정 안쪽 주소는 signup-{id}@staff.invalid (메일을 보내지 않는 가짜 주소).
// ② 승인: 관리자가 사번 · 소속 · 입사일을 정하면 같은 id로 직원이 생기고, 계정 안쪽 주소를 {사번}@staff.invalid로 바꾼다. 이메일은 로그인 아이디가 된다.
// ③ 거절: 신청은 「거절」로 남기고 로그인 계정만 지운다(직원 기록이 생기기 전이라 지워도 남는 기록이 없다, 4-1).
// ★ 이메일이 그 사람 것인지 메일로 확인하지 않는다(메일 발송 수단 없음) — 관리자가 승인할 때 본인인지 확인한다(결정 권한-8).
import 'server-only';
import { isLocale, type Locale } from '@/i18n/locales';
import { ApiError } from '@/lib/api';
import { cleanEmail } from '@/lib/email-rules';
import { EMPLOYEE_NO_RE } from '@/lib/invite';
import { checkPassword } from '@/lib/login-rules';
import { cleanPhone } from '@/lib/org';
import { assignableGroup } from '@/lib/org-data';
import { sendPush } from '@/lib/push';
import { staffEmail } from '@/lib/session';
import { syncStaffHistorySafe } from '@/lib/staff-history';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';

export const signupAuthEmail = (id: string) => `signup-${id}@staff.invalid`;

export type SignupRequest = { id: string; name: string; email: string; phone: string | null; locale: string; requestedAt: string };

async function emailTaken(email: string): Promise<boolean> {
  const db = createAdminClient();
  const [{ data: p }, { data: r }] = await Promise.all([
    db.from('profiles').select('id').eq('email', email).maybeSingle(),
    db.from('signup_requests').select('id').eq('email', email).eq('status', 'pending').maybeSingle(),
  ]);
  return !!p || !!r;
}

export async function requestSignup(b: Record<string, unknown>): Promise<void> {
  const name = typeof b.name === 'string' ? b.name.trim().replace(/\s+/g, ' ') : '';
  if (!name || name.length > 50) throw new ApiError(400, 'invalid_name');
  const email = cleanEmail(b.email);
  if (!email) throw new ApiError(400, 'invalid_email');
  const phone = cleanPhone(b.phone);
  if (phone === undefined) throw new ApiError(400, 'invalid_phone');
  const rule = checkPassword(b.password, email.split('@')[0]);
  if (rule) throw new ApiError(400, rule);
  const locale: Locale = isLocale(b.locale) ? b.locale : 'ko';
  // 이미 쓰는 이메일인지 · 대기 중인 신청이 있는지 — 같은 안내로 답한다
  if (await emailTaken(email)) throw new ApiError(409, 'email_taken');

  const db = createAdminClient();
  const id = crypto.randomUUID();
  const { data: u, error: e1 } = await db.auth.admin.createUser({ id, email: signupAuthEmail(id), password: b.password as string, email_confirm: true });
  if (e1 || !u.user) throw new Error(`requestSignup.createUser: ${e1?.message}`);
  const { error: e2 } = await db.from('signup_requests').insert({ id: u.user.id, name, email, phone, locale });
  if (e2) {
    await db.auth.admin.deleteUser(u.user.id);
    if (e2.code === '23505') throw new ApiError(409, 'email_taken');
    throw new Error(`requestSignup.insert: ${e2.code}`);
  }
  // 관리자에게 폰 알림 (켜 둔 사람만)
  const { data: admins } = await db.from('profiles').select('id, employee_no').eq('role', 'admin').eq('active', true);
  await sendPush((admins ?? []).filter((a) => !a.employee_no?.startsWith('e2e-')).map((a) => a.id as string), { title: `${name} 님이 가입을 신청했습니다`, body: `${email} — 승인하면 직원으로 등록됩니다`, url: '/admin/members#signups', tag: `signup-${id}` }).catch(() => 0);
}

/** 로그인이 안 될 때: 승인 대기 중인 신청인지(비밀번호까지 맞을 때만 알려 준다 — 남의 이메일로 신청 여부를 떠보지 못하게) */
export async function pendingSignupFor(email: string): Promise<string | null> {
  const { data } = await createAdminClient().from('signup_requests').select('id').eq('email', email).eq('status', 'pending').maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

export async function loadPendingSignups(): Promise<SignupRequest[]> {
  const { data, error } = await createAdminClient().from('signup_requests').select('id, name, email, phone, locale, requested_at').eq('status', 'pending').order('requested_at');
  if (error) return []; // 표가 아직 없으면(묶음 18 전) 빈 목록
  return (data ?? []).map((r) => ({ id: r.id as string, name: r.name as string, email: r.email as string, phone: r.phone as string | null, locale: r.locale as string, requestedAt: r.requested_at as string }));
}

export async function approveSignup(args: { id: string; actorId: string; employeeNo: unknown; groupId: unknown; joinedOn: unknown }): Promise<{ employeeId: string }> {
  const db = createAdminClient();
  const { data: r } = await db.from('signup_requests').select('*').eq('id', args.id).eq('status', 'pending').maybeSingle();
  if (!r) throw new ApiError(404, 'not_found');
  const employeeNo = typeof args.employeeNo === 'string' ? args.employeeNo.trim() : '';
  if (!EMPLOYEE_NO_RE.test(employeeNo)) throw new ApiError(400, 'invalid_no');
  const groupId = await assignableGroup(args.groupId);
  if (groupId === undefined) throw new ApiError(400, 'invalid_group');
  const joinedOn = typeof args.joinedOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.joinedOn) ? args.joinedOn : null;
  if (args.joinedOn && !joinedOn) throw new ApiError(400, 'invalid_date');
  if (joinedOn && joinedOn > toKstDate(new Date())) throw new ApiError(400, 'invalid_date');
  const { data: dup } = await db.from('profiles').select('id').eq('employee_no', employeeNo).maybeSingle();
  if (dup) throw new ApiError(409, 'duplicate_no');
  const { data: dupMail } = await db.from('profiles').select('id').eq('email', r.email).maybeSingle();
  if (dupMail) throw new ApiError(409, 'email_taken');

  // 계정 안쪽 주소를 사번 주소로 — 그다음 직원을 만든다. 직원 만들기가 실패하면 주소를 되돌린다
  const { error: e1 } = await db.auth.admin.updateUserById(args.id, { email: staffEmail(employeeNo), email_confirm: true });
  if (e1) {
    if (/already|registered|exists/i.test(e1.message)) throw new ApiError(409, 'duplicate_no');
    throw new Error(`approveSignup.email: ${e1.message}`);
  }
  const now = new Date().toISOString();
  const { error: e2 } = await db.from('profiles').insert({
    id: args.id, name: r.name, employee_no: employeeNo, role: 'employee', locale: r.locale, joined_on: joinedOn, phone: r.phone, email: r.email, group_id: groupId, password_set_at: now, updated_by: args.actorId,
  });
  if (e2) {
    await db.auth.admin.updateUserById(args.id, { email: signupAuthEmail(args.id), email_confirm: true });
    if (e2.code === '23505') throw new ApiError(409, 'duplicate_no');
    throw new Error(`approveSignup.profile: ${e2.code}`);
  }
  const { error: e3 } = await db.from('signup_requests').update({ status: 'approved', decided_at: now, decided_by: args.actorId, employee_id: args.id }).eq('id', args.id);
  if (e3) throw new Error(`approveSignup.request: ${e3.code}`);
  await syncStaffHistorySafe(args.id, args.actorId);
  return { employeeId: args.id };
}

export async function rejectSignup(args: { id: string; actorId: string; reason: unknown }): Promise<void> {
  const db = createAdminClient();
  const reason = typeof args.reason === 'string' && args.reason.trim() ? args.reason.trim().slice(0, 300) : null;
  const { data, error } = await db.from('signup_requests').update({ status: 'rejected', decided_at: new Date().toISOString(), decided_by: args.actorId, reason }).eq('id', args.id).eq('status', 'pending').select('id');
  if (error) throw new Error(`rejectSignup: ${error.code}`);
  if (!data?.length) throw new ApiError(404, 'not_found');
  const { error: e2 } = await db.auth.admin.deleteUser(args.id);
  if (e2) console.error(JSON.stringify({ route: 'signup.reject', code: 'delete_user_failed', detail: e2.message.slice(0, 200) }));
}
