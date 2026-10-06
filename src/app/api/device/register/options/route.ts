// 출퇴근 기기 등록 1단계 — 로그인한 직원이 지금 쓰는 기기를 자기 출퇴근 기기로 (2026-10-05 의뢰인: 초대 코드 없이 본인이 직접).
// 폰에서만 등록한다 (phone_only, 2026-10-06 의뢰인) — PC는 조회·신청용이다.
// 이미 등록한 기기가 있으면 거절한다 (already_registered) — 바꾸려면 관리자가 먼저 기존 기기를 해제한다.
import { api, ApiError } from '@/lib/api';
import { getMe } from '@/lib/auth';
import { isPhoneUserAgent } from '@/lib/passkey';
import { passkeyService } from '@/lib/passkey-store';

export const POST = api('device.register.options', async (req) => {
  const me = await getMe();
  if (!me || !me.employeeNo) throw new ApiError(401, 'not_signed_in');
  if (!isPhoneUserAgent(req.headers.get('user-agent'))) throw new ApiError(400, 'phone_only'); // PC는 출퇴근 기기가 될 수 없다
  return passkeyService().beginDeviceRegistration({ employeeId: me.id, employeeNo: me.employeeNo, name: me.name });
});
