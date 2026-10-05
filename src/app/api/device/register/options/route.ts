// 출퇴근 기기 등록 1단계 — 로그인한 직원이 지금 쓰는 기기를 자기 출퇴근 기기로 (2026-10-05 의뢰인: 초대 코드 없이 본인이 직접).
// 이미 등록한 기기가 있으면 거절한다 (already_registered) — 바꾸려면 관리자가 먼저 기존 기기를 해제한다.
import { api, ApiError } from '@/lib/api';
import { getMe } from '@/lib/auth';
import { passkeyService } from '@/lib/passkey-store';

export const POST = api('device.register.options', async () => {
  const me = await getMe();
  if (!me || !me.employeeNo) throw new ApiError(401, 'not_signed_in');
  return passkeyService().beginDeviceRegistration({ employeeId: me.id, employeeNo: me.employeeNo, name: me.name });
});
