// 폰 등록 2단계: 폰의 응답 검증 → 공개키 저장 → 로그인 세션 발급. 7-12
import { api, ApiError, readJson } from '@/lib/api';
import { homePathFor } from '@/lib/home-path';
import { deviceLabelFrom } from '@/lib/passkey';
import { passkeyService } from '@/lib/passkey-store';
import { issueSession } from '@/lib/session';
import { isLocale, selectableLocales } from '@/i18n/locales';
import { LOCALE_COOKIE } from '@/i18n/request';
import { createAdminClient } from '@/lib/supabase/admin';
import { cookies } from 'next/headers';

export const POST = api('passkey.register.verify', async (req) => {
  const { token, response } = await readJson(req);
  if (typeof token !== 'string' || !token || !response) throw new ApiError(400, 'invite_invalid');
  const r = await passkeyService().finishRegistration(token, response, deviceLabelFrom(req.headers.get('user-agent')));
  // 등록 화면에서 직원이 언어를 직접 골랐으면 그 언어를 계정에 저장 (관리자가 정한 언어보다 본인 선택이 우선)
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(chosen) && selectableLocales().includes(chosen)) {
    await createAdminClient().from('profiles').update({ locale: chosen }).eq('id', r.employeeId);
  }
  await issueSession(r.employeeId);
  return { ok: true, next: await homePathFor() };
});
