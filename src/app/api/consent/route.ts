// 개인정보·위치정보 수집 동의 (2026-10-05). 로그인한 본인만, 지금 판에만. 누가·언제·어느 판·어느 언어로 봤는지 남긴다.
// 화면이 보낸 판이 서버의 판과 다르면(안내문이 그 사이 바뀜) 거절한다 — 보지 않은 안내문에 동의한 것으로 남기지 않는다.
import { getLocale } from 'next-intl/server';
import { CONSENT } from '@/config/consent';
import { OFFICE } from '@/config/office';
import { api, ApiError, readJson } from '@/lib/api';
import { getMe } from '@/lib/auth';
import { recordConsent } from '@/lib/consent';
import { traceClientIp } from '@/lib/verify-location';

export const POST = api('consent', async (req) => {
  const me = await getMe();
  if (!me) throw new ApiError(401, 'not_signed_in');
  const b = await readJson(req);
  if (b.version !== CONSENT.version) throw new ApiError(409, 'consent_outdated');
  await recordConsent({ employeeId: me.id, locale: await getLocale(), clientIp: traceClientIp(req.headers, OFFICE.ipHeaderOrder).ip });
  return { ok: true };
});
