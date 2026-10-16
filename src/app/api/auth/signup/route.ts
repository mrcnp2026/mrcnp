// 이메일로 가입 신청 (로그인 전, 2026-10-16 의뢰인 권한-6). 관리자가 승인해야 로그인된다 — lib/signup.ts.
// 같은 이메일로 여러 번 누르는 것 · 맞히기를 막으려고 로그인과 같은 횟수 제한을 쓴다(이메일마다 15분에 10번).
import { loginThrottled, recordLoginFailure } from '@/lib/account';
import { api, ApiError, readJson } from '@/lib/api';
import { requestSignup } from '@/lib/signup';

export const POST = api('auth.signup', async (req) => {
  const b = await readJson(req);
  const key = `signup:${typeof b.email === 'string' ? b.email.trim().toLowerCase() : ''}`;
  if (await loginThrottled(key)) throw new ApiError(429, 'login_throttled');
  try {
    await requestSignup(b);
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) await recordLoginFailure(key);
    throw e;
  }
  return { ok: true };
});
