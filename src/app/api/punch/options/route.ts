// 출퇴근 1단계: 1회용 챌린지 (목적 'punch' — 로그인용 챌린지로는 찍을 수 없다)
// + 위치가 필요한지 (GPS, 2026-10-05): 사무실 위치가 등록돼 있고 지금 인터넷 주소로는 사무실이 확인되지 않을 때만 true.
//   사무실 WiFi에서 찍는 사람에게는 위치를 묻지 않는다 (필요할 때만 수집한다).
import { OFFICE } from '@/config/office';
import { api } from '@/lib/api';
import { officeCidrs } from '@/lib/attendance-data';
import { loadOfficeLocations } from '@/lib/geo-data';
import { passkeyService } from '@/lib/passkey-store';
import { isOfficeIp, traceClientIp } from '@/lib/verify-location';

export const POST = api('punch.options', async (req) => {
  const options = await passkeyService().beginAssertion('punch');
  const [cidrs, locations] = await Promise.all([officeCidrs(), loadOfficeLocations()]);
  const needLocation = locations.length > 0 && !isOfficeIp(traceClientIp(req.headers, OFFICE.ipHeaderOrder).ip, cidrs.map((c) => c.cidr));
  return { ...options, needLocation };
});
