// 폰 등록 1단계: 초대 토큰 확인 → 등록 옵션(1회용 챌린지 포함). 7-12
import { api, ApiError, readJson } from '@/lib/api';
import { passkeyService } from '@/lib/passkey-store';

export const POST = api('passkey.register.options', async (req) => {
  const { token } = await readJson(req);
  if (typeof token !== 'string' || !token) throw new ApiError(400, 'invite_invalid');
  return passkeyService().beginRegistration(token);
});
