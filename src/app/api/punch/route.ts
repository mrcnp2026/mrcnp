// 출퇴근 기록 API — IP는 여기서만 읽는다 (6장 파일 트리, 7-3 요점 1).
// ★ 4-11: 폰 확인(패스키)을 통과한 요청만 받는다. 로그인 세션만으로는 찍히지 않는다 (B-14).
// ★★ 7-4 요점 4: 요청 본문에서 읽는 것은 kind와 폰의 서명뿐이다. punched_at·ip_verified·is_test·work_date 등은
//    본문에 있어도 읽지 않는다 (B-23). 시각=서버 시계, IP=서버가 본 헤더, 연습 여부=서버 설정.
// ★ 4-3: 사무실 밖이어도 기록은 남긴다 (ip_verified=false). 신원(패스키)은 선택이 아니다.
import { OFFICE } from '@/config/office';
import { api, ApiError, readJson } from '@/lib/api';
import { officeCidrs } from '@/lib/attendance-data';
import { getMe } from '@/lib/auth';
import { passkeyService } from '@/lib/passkey-store';
import { isPeriodLocked, recordPunch } from '@/lib/punch';
import { toKstDate } from '@/lib/time';
import { isOfficeIp, traceClientIp } from '@/lib/verify-location';

export const POST = api('punch', async (req) => {
  const body = await readJson(req);
  const kind = body.kind;
  if (kind !== 'in' && kind !== 'out') throw new ApiError(400, 'invalid_input');
  if (!body.response) throw new ApiError(401, 'verification_failed');

  const who = await passkeyService().verifyAssertion(body.response, 'punch');

  // 로그인한 사람과 폰 주인이 다르면 거부 (다른 사람 폰으로 내 화면에서 찍는 것을 막는다)
  const me = await getMe();
  if (me && me.id !== who.employeeId) throw new ApiError(403, 'wrong_person');

  const now = new Date();
  if (await isPeriodLocked(who.employeeId, toKstDate(now))) throw new ApiError(409, 'period_locked');

  const trace = traceClientIp(req.headers, OFFICE.ipHeaderOrder);
  const cidrs = (await officeCidrs()).map((c) => c.cidr);
  const ipVerified = isOfficeIp(trace.ip, cidrs);

  const { event, deduped } = await recordPunch({
    employeeId: who.employeeId,
    kind,
    now,
    clientIp: trace.ip,
    ipVerified,
    source: 'web',
    isTest: OFFICE.practiceMode,
    passkeyId: who.passkeyId,
  });
  return {
    kind: event.kind,
    punchedAt: event.punchedAt, // 서버가 정한 시각 그대로 화면에 크게 보여 준다 (R-10-8 신뢰 장치)
    ipVerified: event.ipVerified,
    isTest: event.isTest,
    deduped,
    note: event.note,
  };
});
