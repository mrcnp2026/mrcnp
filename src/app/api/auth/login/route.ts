// 로그인 — 아이디(사번 또는 휴대폰 번호) + 비밀번호. PC·폰 어느 기기에서나 (2026-10-05 의뢰인).
// ★ 아이디가 없는 것·비밀번호가 틀린 것·퇴사한 것을 구분해 알려 주지 않는다 (모두 login_failed) — 누가 직원인지 새지 않게.
// ★ 같은 아이디로 연속해서 틀리면 잠깐 막는다 (login-rules: 15분에 10번).
import { clearLoginFailures, findLoginTarget, loginThrottled, recordLoginFailure } from '@/lib/account';
import { api, ApiError, readJson } from '@/lib/api';
import { homePathFor } from '@/lib/home-path';
import { PASSWORD_MAX } from '@/lib/login-rules';
import { signInWithPassword } from '@/lib/session';

export const POST = api('auth.login', async (req) => {
  const { id, password } = await readJson(req);
  if (typeof id !== 'string' || !id.trim() || id.length > 64 || typeof password !== 'string' || !password) throw new ApiError(400, 'login_failed');
  if (await loginThrottled(id)) throw new ApiError(429, 'login_throttled');

  const target = await findLoginTarget(id);
  const ok = target?.employeeNo && password.length <= PASSWORD_MAX ? await signInWithPassword(target.employeeNo, password) : null;
  if (ok === null) {
    await recordLoginFailure(id);
    throw new ApiError(400, 'login_failed');
  }
  await clearLoginFailures(id);
  return { ok: true, next: await homePathFor() };
});
