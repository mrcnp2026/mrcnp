// next-intl: 요청마다 언어를 정한다. 주소에 언어를 넣지 않는다 — 직원마다 저장된 언어(profiles.locale)를 따른다.
// 순서: 로그인한 직원의 저장된 언어 → 로그인 전 고른 언어(쿠키) → 브라우저 언어 → 영어 (직원 1순위, 4-10)
// ⚠️ 언어는 표기만 바꾼다. 시각은 항상 사무실 시간대다 (4-10 마지막 줄) — timeZone을 여기서 고정한다.
import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';
import { OFFICE } from '@/config/office';
import { getMe } from '@/lib/auth';
import { DEFAULT_EMPLOYEE_LOCALE, isLocale, localeFromAcceptLanguage, selectableLocales, type Locale } from './locales';
import { messagesFor } from './messages';

export const LOCALE_COOKIE = 'locale';

export async function resolveLocale(): Promise<Locale> {
  const allowed = selectableLocales();
  const me = await getMe().catch(() => null);
  // 관리자가 초대 때 정한 언어라도 아직 검수 전이면 영어로 보인다 (B-21)
  if (me && allowed.includes(me.locale)) return me.locale;
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(c) && allowed.includes(c)) return c;
  // 한국어 브라우저에 영어 화면을 주면 브라우저 자동 번역이 반말("처음이야?", "비밀번호 만들어")로 옮긴다 (2026-10-06 의뢰인 실측)
  const fromBrowser = localeFromAcceptLanguage((await headers()).get('accept-language'), allowed);
  return fromBrowser ?? DEFAULT_EMPLOYEE_LOCALE;
}

export default getRequestConfig(async ({ locale: explicit }) => {
  // getTranslations({ locale }) 처럼 언어를 직접 지정한 경우 (예: 초대 화면을 직원 언어로) 그것을 따른다
  const locale = isLocale(explicit) ? explicit : await resolveLocale();
  return {
    locale,
    messages: messagesFor(locale),
    timeZone: OFFICE.timezone,
  };
});
