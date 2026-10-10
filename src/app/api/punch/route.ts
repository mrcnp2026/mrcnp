// 출퇴근 기록 API — IP는 여기서만 읽는다 (6장 파일 트리, 7-3 요점 1).
// ★ 4-11 (2026-10-05 의뢰인 확정): 로그인(아이디 + 비밀번호)만으로는 찍히지 않는다. **로그인한 본인이 등록한 기기**의
//    지문·얼굴 확인(패스키 서명)을 통과한 요청만 받는다 — 비밀번호를 동료에게 알려 줘도 동료 폰으로는 대신 찍지 못한다 (B-14).
// ★★ 7-4 요점 4: 요청 본문에서 읽는 것은 kind와 기기의 서명(와 필요할 때의 위치)뿐이다. punched_at·ip_verified·is_test·work_date 등은
//    본문에 있어도 읽지 않는다 (B-23). 시각=서버 시계, IP=서버가 본 헤더, 연습 여부=서버 설정, 직원=로그인 세션.
// ★ 2026-10-10 의뢰인 확정 (시프티 방식): 사무실 인터넷도 장소 반경 안도 아니면 기록하지 않고 「출근/퇴근 요청」을 만든다 — 관리자가 승인해야 기록된다.
//    예외(예전처럼 ip_verified=false로 바로 기록): 사무실 인터넷·출퇴근 장소가 하나도 없는 회사, 그날 승인된 외근·출장·재택이 있는 직원 (lib/punch-requests.ts).
// ★ GPS (2026-10-05): 인터넷 주소로 사무실이 확인되지 않을 때만, 폰이 함께 보낸 위치(body.geo)로 한 번 더 본다.
//    위치는 폰이 보낸 값이라 인터넷 주소보다 약한 증거다 — 확인 수단(verified_by)을 기록에 남긴다. 사무실 밖 좌표는 저장하지 않는다.
import { OFFICE } from '@/config/office';
import { api, ApiError, readJson } from '@/lib/api';
import { officeCidrs } from '@/lib/attendance-data';
import { getMe } from '@/lib/auth';
import { hasConsent } from '@/lib/consent';
import { parseCoords, roundCoord, verifyGeo } from '@/lib/geo';
import { passkeyService } from '@/lib/passkey-store';
import { loadLocationsFor } from '@/lib/geo-data';
import { isPeriodLocked, recordPunch } from '@/lib/punch';
import { geoReasonOf, punchRoute, type GeoReason } from '@/lib/punch-requests';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadWorkRequests } from '@/lib/work-data';
import { workStatusOn } from '@/lib/work-requests';
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
  let locationId: string | null = null; // 어느 출퇴근 장소로 확인됐는가 (2026-10-10)
  let geoReason: GeoReason = 'no_fix';
  let nearestM: number | null = null;
  let places = 0;
  if (!byIp) {
    // 수집 동의가 없는 사람이 보낸 위치는 읽지 않는다
    const consent = await hasConsent(who.employeeId);
    const coords = consent ? parseCoords(body.geo) : null;
    const locations = await loadLocationsFor(who.employeeId);
    places = locations.filter((l) => l.active).length;
    const verdict = coords ? verifyGeo(coords, locations) : null;
    if (coords && verdict?.verified) {
      verifiedBy = 'gps';
      locationId = verdict.locationId;
      geo = { lat: roundCoord(coords.lat), lng: roundCoord(coords.lng) };
    }
    geoReason = geoReasonOf({ consent, hasCoords: !!coords, verdict: verdict?.reason ?? null });
    nearestM = verdict?.nearestM ?? null;
  }

  // 반경 밖: 기록 대신 요청 (2026-10-10 의뢰인 확정)
  if (verifiedBy === null) {
    const today = toKstDate(now);
    const approvedAway = workStatusOn(today, who.employeeId, await loadWorkRequests({ employeeId: who.employeeId, from: today, to: today })) !== null;
    if (punchRoute({ verified: false, hasOfficeSetup: cidrs.length > 0 || places > 0, approvedAway }) === 'request') {
      const db = createAdminClient();
      // 같은 날 같은 종류의 대기 요청이 있으면 새로 만들지 않는다 (두 번 눌러도 한 건)
      const { data: had } = await db.from('punch_requests').select('id, requested_at').eq('employee_id', who.employeeId).eq('kind', kind).eq('work_date', today).eq('status', 'pending').eq('is_test', OFFICE.practiceMode).order('requested_at').limit(1);
      if (had?.length) return { requested: true, kind, punchedAt: had[0].requested_at, ipVerified: false, verifiedBy: null, isTest: OFFICE.practiceMode, deduped: true, note: null, nearestM };
      const { data: made, error } = await db
        .from('punch_requests')
        .insert({ employee_id: who.employeeId, kind, requested_at: now.toISOString(), work_date: today, client_ip: trace.ip, nearest_m: nearestM, geo_reason: geoReason, passkey_id: passkeyId, is_test: OFFICE.practiceMode })
        .select('requested_at')
        .single();
      if (error) throw new Error(`punch.request: ${error.code}`);
      return { requested: true, kind, punchedAt: made.requested_at, ipVerified: false, verifiedBy: null, isTest: OFFICE.practiceMode, deduped: false, note: null, nearestM };
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
    locationId,
    source: 'web',
    isTest: OFFICE.practiceMode,
    passkeyId,
  });
  return {
    requested: false,
    kind: event.kind,
    punchedAt: event.punchedAt, // 서버가 정한 시각 그대로 화면에 크게 보여 준다 (R-10-8 신뢰 장치)
    ipVerified: event.ipVerified,
    verifiedBy,
    isTest: event.isTest,
    deduped,
    note: event.note,
  };
});
