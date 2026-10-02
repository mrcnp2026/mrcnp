// 폰으로 로그인 2단계: 서명 검증 → 로그인 세션 발급 (7-12 요점 6의 ②, 마스터 8-3)
import { api, ApiError, readJson } from '@/lib/api';
import { homePathFor } from '@/lib/home-path';
import { passkeyService } from '@/lib/passkey-store';
import { issueSession } from '@/lib/session';

export const POST = api('passkey.login.verify', async (req) => {
  const { response } = await readJson(req);
  if (!response) throw new ApiError(400, 'invalid_input');
  const r = await passkeyService().verifyAssertion(response, 'login');
  await issueSession(r.employeeId);
  return { ok: true, next: await homePathFor() };
});
