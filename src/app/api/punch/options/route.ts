// 출퇴근 1단계: 1회용 챌린지 (목적 'punch' — 로그인용 챌린지로는 찍을 수 없다)
// + 위치가 필요한지 (GPS, 2026-10-05): 사무실 위치가 등록돼 있고 지금 인터넷 주소로는 사무실이 확인되지 않을 때만 true.
//   사무실 WiFi에서 찍는 사람에게는 위치를 묻지 않는다 (필요할 때만 수집한다).
import { OFFICE } from '@/config/office';
import { api } from '@/lib/api';
import { officeCidrs } from '@/lib/attendance-data';
import { getMe } from '@/lib/auth';
import { hasConsent } from '@/lib/consent';
import { loadOfficeLocations } from '@/lib/geo-data';
import { passkeyService } from '@/lib/passkey-store';
import { isOfficeIp, traceClientIp } from '@/lib/verify-location';

export const POST = api('punch.options', async (req) => {
  const options = await passkeyService().beginAssertion('punch');
  const [cidrs, locations] = await Promise.all([officeCidrs(), loadOfficeLocations()]);
  const me = await getMe();
  // 위치는 수집 동의를 한 사람에게만 묻는다 (동의 창을 지나야 이 화면에 오지만, 서버에서도 한 번 더 본다)
  const needLocation = !!me && (await hasConsent(me.id)) && locations.length > 0 && !isOfficeIp(traceClientIp(req.headers, OFFICE.ipHeaderOrder).ip, cidrs.map((c) => c.cidr));
  return { ...options, needLocation };
});
