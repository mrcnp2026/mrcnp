// 비밀번호 바꾸기 — 로그인한 본인이. 이미 비밀번호가 있으면 지금 비밀번호를 한 번 더 확인한다
// (열어 둔 화면을 다른 사람이 만져 비밀번호를 바꾸지 못하게). 지문 로그인만 쓰던 사람은 비밀번호가 없으므로 바로 만든다.
// 바꾸면 이 기기만 남고 다른 기기는 모두 로그아웃된다.
import { passwordMatches, revokeSessionsBefore, setPassword } from '@/lib/account';
import { api, ApiError, readJson } from '@/lib/api';
import { getMe } from '@/lib/auth';
import { checkPassword } from '@/lib/login-rules';
import { signInWithPassword } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/admin';

export const POST = api('auth.password', async (req) => {
  const me = await getMe();
  if (!me || !me.employeeNo) throw new ApiError(401, 'not_signed_in');
  const { current, password } = await readJson(req);
  const bad = checkPassword(password, me.employeeNo);
  if (bad) throw new ApiError(400, bad);

  const { data: p } = await createAdminClient().from('profiles').select('password_set_at').eq('id', me.id).maybeSingle();
  if (p?.password_set_at) {
    if (typeof current !== 'string' || !current || !(await passwordMatches(me.employeeNo, current))) throw new ApiError(400, 'password_wrong');
  }
  await setPassword(me.id, password as string);
  const authTime = await signInWithPassword(me.employeeNo, password as string);
  if (authTime === null) throw new Error('password.change: sign-in failed right after setting the password');
  await revokeSessionsBefore(me.id, authTime, me.id);
  return { ok: true };
});
