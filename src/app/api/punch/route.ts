// 출퇴근 기록 API — IP는 여기서만 읽는다 (6장 파일 트리, 7-3 요점 1).
// ★ 4-11 (2026-10-05 의뢰인 확정): 로그인(아이디 + 비밀번호)만으로는 찍히지 않는다. **로그인한 본인이 등록한 기기**의
//    지문·얼굴 확인(패스키 서명)을 통과한 요청만 받는다 — 비밀번호를 동료에게 알려 줘도 동료 폰으로는 대신 찍지 못한다 (B-14).
// ★★ 7-4 요점 4: 요청 본문에서 읽는 것은 kind와 기기의 서명(와 필요할 때의 위치)뿐이다. punched_at·ip_verified·is_test·work_date 등은
//    본문에 있어도 읽지 않는다 (B-23). 시각=서버 시계, IP=서버가 본 헤더, 연습 여부=서버 설정, 직원=로그인 세션.
// ★ 4-3: 사무실 밖이어도 기록은 남긴다 (ip_verified=false).
// ★ GPS (2026-10-05): 인터넷 주소로 사무실이 확인되지 않을 때만, 폰이 함께 보낸 위치(body.geo)로 한 번 더 본다.
//    위치는 폰이 보낸 값이라 인터넷 주소보다 약한 증거다 — 확인 수단(verified_by)을 기록에 남긴다. 사무실 밖 좌표는 저장하지 않는다.
import { OFFICE } from '@/config/office';
import { api, ApiError, readJson } from '@/lib/api';
import { officeCidrs } from '@/lib/attendance-data';
import { getMe } from '@/lib/auth';
import { hasConsent } from '@/lib/consent';
import { parseCoords, roundCoord, verifyGeo } from '@/lib/geo';
import { passkeyService } from '@/lib/passkey-store';
import { loadOfficeLocations } from '@/lib/geo-data';
import { isPeriodLocked, recordPunch } from '@/lib/punch';
import { toKstDate } from '@/lib/time';
import { isOfficeIp, traceClientIp } from '@/lib/verify-location';

export const POST = api('punch', async (req) => {
  const body = await readJson(req);
  const kind = body.kind;
  if (kind !== 'in' && kind !== 'out') throw new ApiError(400, 'invalid_input');
  const me = await getMe();
  if (!me) throw new ApiError(401, 'not_signed_in');
  if (!body.response) throw new ApiError(401, 'verification_failed');
  // 서명 검증 + 그 기기가 로그인한 본인의 것인지 (다른 사람 계정에 등록된 기기면 wrong_person)
  const { passkeyId } = await passkeyService().verifyPunch(me.id, body.response);
  const who = { employeeId: me.id };

  const now = new Date();
  if (await isPeriodLocked(who.employeeId, toKstDate(now))) throw new ApiError(409, 'period_locked');

  const trace = traceClientIp(req.headers, OFFICE.ipHeaderOrder);
  const cidrs = (await officeCidrs()).map((c) => c.cidr);
  const byIp = isOfficeIp(trace.ip, cidrs);
  let verifiedBy: 'ip' | 'gps' | null = byIp ? 'ip' : null;
  let geo: { lat: number; lng: number } | null = null;
  if (!byIp) {
    // 수집 동의가 없는 사람이 보낸 위치는 읽지 않는다
    const coords = (await hasConsent(who.employeeId)) ? parseCoords(body.geo) : null;
    if (coords && verifyGeo(coords, await loadOfficeLocations()).verified) {
      verifiedBy = 'gps';
      geo = { lat: roundCoord(coords.lat), lng: roundCoord(coords.lng) };
    }
  }

  const { event, deduped } = await recordPunch({
    employeeId: who.employeeId,
    kind,
    now,
    clientIp: trace.ip,
    ipVerified: verifiedBy !== null,
    verifiedBy,
    geo,
    source: 'web',
    isTest: OFFICE.practiceMode,
    passkeyId,
  });
  return {
    kind: event.kind,
    punchedAt: event.punchedAt, // 서버가 정한 시각 그대로 화면에 크게 보여 준다 (R-10-8 신뢰 장치)
    ipVerified: event.ipVerified,
    verifiedBy,
    isTest: event.isTest,
    deduped,
    note: event.note,
  };
});
