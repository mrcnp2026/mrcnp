// 증명서 신청 (2026-10-29 남은 일 9-3) — 로그인한 재직 직원이 본인 것만. 발급은 최고관리자가 한다(/api/admin/certificates).
import { after } from 'next/server';
import { OFFICE } from '@/config/office';
import { api, ApiError, readJson } from '@/lib/api';
import { getMe } from '@/lib/auth';
import { cleanCertInput, requestCert } from '@/lib/certificates';
import { notifyCertRequest } from '@/lib/push-events';

export const POST = api('certificate.request', async (req) => {
  const me = await getMe();
  if (!me) throw new ApiError(401, 'not_signed_in');
  const c = cleanCertInput(await readJson(req));
  if (!c) throw new ApiError(400, 'invalid_input');
  if (c.kind === 'RETIREMENT') throw new ApiError(400, 'cert_not_retired'); // 퇴직증명서는 관리자가 발급한다(퇴사자는 로그인하지 못한다)
  const id = await requestCert({ employeeId: me.id, ...c, practice: OFFICE.practiceMode });
  after(() => notifyCertRequest(id)); // 발급할 최고관리자 폰 알림 — 응답을 돌려준 뒤에 보낸다 (2026-10-30)
  return { id };
});
