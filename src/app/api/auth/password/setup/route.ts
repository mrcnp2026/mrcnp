// 비밀번호 만들기 — 관리자에게 받은 초대(링크·8자리 코드)로 처음 한 번, 또는 잊어버려서 다시 받았을 때.
// 초대는 한 번만 쓰인다. 비밀번호를 새로 만들면 그 전에 로그인해 둔 다른 기기는 모두 끊긴다.
import { cookies } from 'next/headers';
import { isLocale, selectableLocales } from '@/i18n/locales';
import { LOCALE_COOKIE } from '@/i18n/request';
import { consumeInvite, findInvite, revokeSessionsBefore, setPassword } from '@/lib/account';
import { api, ApiError, readJson } from '@/lib/api';
import { homePathFor } from '@/lib/home-path';
import { checkPassword } from '@/lib/login-rules';
import { signInWithPassword } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/admin';

export const POST = api('auth.password.setup', async (req) => {
  const { token, password } = await readJson(req);
  if (typeof token !== 'string' || !token) throw new ApiError(400, 'invite_invalid');
  const inv = await findInvite(token);
  if (typeof inv === 'string') throw new ApiError(400, inv);
  const bad = checkPassword(password, inv.employeeNo);
  if (bad) throw new ApiError(400, bad);
  // 초대를 먼저 사용 처리한다 — 같은 링크로 두 사람이 동시에 비밀번호를 정하지 못하게
  if (!(await consumeInvite(inv.inviteId))) throw new ApiError(400, 'invite_invalid');

  await setPassword(inv.employeeId, password as string);
  // 가입 화면에서 직원이 언어를 직접 골랐으면 그 언어를 계정에 저장 (관리자가 정한 언어보다 본인 선택이 우선)
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(chosen) && selectableLocales().includes(chosen)) {
    await createAdminClient().from('profiles').update({ locale: chosen }).eq('id', inv.employeeId);
  }
  const authTime = await signInWithPassword(inv.employeeNo, password as string);
  if (authTime === null) throw new Error('password.setup: sign-in failed right after setting the password');
  await revokeSessionsBefore(inv.employeeId, authTime, inv.employeeId);
  return { ok: true, next: await homePathFor() };
});
