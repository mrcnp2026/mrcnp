// 언어 바꾸기. 검수된 언어만 (4-10, B-21). 로그인했으면 본인 profiles.locale에 저장 — 서버만 쓴다 (6장 권한 잠금)
import { api, ApiError, readJson } from '@/lib/api';
import { getMe } from '@/lib/auth';
import { isLocale, selectableLocales } from '@/i18n/locales';
import { LOCALE_COOKIE } from '@/i18n/request';
import { createAdminClient } from '@/lib/supabase/admin';
import { cookies } from 'next/headers';

export const POST = api('locale', async (req) => {
  const { locale } = await readJson(req);
  if (!isLocale(locale) || !selectableLocales().includes(locale)) throw new ApiError(400, 'invalid_input');
  const me = await getMe();
  if (me) {
    const { error } = await createAdminClient().from('profiles').update({ locale }).eq('id', me.id);
    if (error) throw new Error(`locale update: ${error.message}`);
  }
  (await cookies()).set(LOCALE_COOKIE, locale, { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 });
  return { ok: true };
});
