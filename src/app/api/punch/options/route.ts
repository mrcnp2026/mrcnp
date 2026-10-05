// 출퇴근 1단계: 기기 확인용 1회용 챌린지 (목적 'punch', 로그인한 본인이 등록한 기기만 답할 수 있다 — 등록한 기기가 없으면 device_required)
// + 위치가 필요한지 (GPS, 2026-10-05): 사무실 위치가 등록돼 있고 지금 인터넷 주소로는 사무실이 확인되지 않을 때만 true.
//   사무실 WiFi에서 찍는 사람에게는 위치를 묻지 않는다 (필요할 때만 수집한다).
import { OFFICE } from '@/config/office';
import { api, ApiError } from '@/lib/api';
import { officeCidrs } from '@/lib/attendance-data';
import { getMe } from '@/lib/auth';
import { hasConsent } from '@/lib/consent';
import { loadOfficeLocations } from '@/lib/geo-data';
import { passkeyService } from '@/lib/passkey-store';
import { isOfficeIp, traceClientIp } from '@/lib/verify-location';

export const POST = api('punch.options', async (req) => {
  const me = await getMe();
  if (!me) throw new ApiError(401, 'not_signed_in');
  const options = await passkeyService().beginPunchAssertion(me.id);
  const [cidrs, locations] = await Promise.all([officeCidrs(), loadOfficeLocations()]);
  // 위치는 수집 동의를 한 사람에게만 묻는다 (동의 창을 지나야 이 화면에 오지만, 서버에서도 한 번 더 본다)
  const needLocation = (await hasConsent(me.id)) && locations.length > 0 && !isOfficeIp(traceClientIp(req.headers, OFFICE.ipHeaderOrder).ip, cidrs.map((c) => c.cidr));
  return { options, needLocation };
});
