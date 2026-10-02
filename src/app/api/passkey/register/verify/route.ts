// 폰 등록 2단계: 폰의 응답 검증 → 공개키 저장 → 로그인 세션 발급. 7-12
import { api, ApiError, readJson } from '@/lib/api';
import { homePathFor } from '@/lib/home-path';
import { deviceLabelFrom } from '@/lib/passkey';
import { passkeyService } from '@/lib/passkey-store';
import { issueSession } from '@/lib/session';

export const POST = api('passkey.register.verify', async (req) => {
  const { token, response } = await readJson(req);
  if (typeof token !== 'string' || !token || !response) throw new ApiError(400, 'invite_invalid');
  const r = await passkeyService().finishRegistration(token, response, deviceLabelFrom(req.headers.get('user-agent')));
  await issueSession(r.employeeId);
  return { ok: true, next: await homePathFor(r.employeeId) };
});
