// 출퇴근 기기 등록 2단계 — 기기의 응답 검증 → 공개키 저장. 지문·얼굴 정보는 서버로 오지 않는다 (공개키와 서명만).
import { api, ApiError, readJson } from '@/lib/api';
import { getMe } from '@/lib/auth';
import { deviceLabelFrom, isPhoneUserAgent } from '@/lib/passkey';
import { passkeyService } from '@/lib/passkey-store';

export const POST = api('device.register.verify', async (req) => {
  const me = await getMe();
  if (!me) throw new ApiError(401, 'not_signed_in');
  if (!isPhoneUserAgent(req.headers.get('user-agent'))) throw new ApiError(400, 'phone_only');
  const { response } = await readJson(req);
  if (!response) throw new ApiError(400, 'invalid_input');
  const r = await passkeyService().finishDeviceRegistration(me.id, response, deviceLabelFrom(req.headers.get('user-agent')));
  return { ok: true, credentialId: r.credentialId };
});
