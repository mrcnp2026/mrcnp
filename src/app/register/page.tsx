// 비밀번호 만들기 화면 (2026-10-05 의뢰인: 폰 등록 대신 아이디 + 비밀번호). 처음 가입할 때, 그리고 비밀번호를 잊어 링크를 다시 받았을 때 온다.
// 들어오는 길은 셋: 받은 링크 · 초대 QR · 주소창에 앱 주소를 치고 "비밀번호 설정" → 8자리 코드 입력.
// 로그인 전이라도 관리자가 정한 직원 언어로 보여 준다 (4-10).
import { KeyRound } from 'lucide-react';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { ErrorNote } from '@/components/ErrorNote';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Logo } from '@/components/Logo';
import { OpenExternal } from '@/components/OpenExternal';
import { Card, PageShell } from '@/components/ui';
import { isLocale, languageOptions, selectableLocales, type Locale } from '@/i18n/locales';
import { messagesFor } from '@/i18n/messages';
import { LOCALE_COOKIE } from '@/i18n/request';
import { findInvite } from '@/lib/account';
import { CodeForm } from './CodeForm';
import { PasswordSetup } from './PasswordSetup';

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = '' } = await searchParams;
  let invite: { name: string; employeeNo: string; locale: string } | null = null;
  let errorCode: string | null = null;
  if (token) {
    const found = await findInvite(token);
    if (typeof found === 'string') errorCode = found;
    else invite = found;
  }

  // 언어: ① 이 화면에서 직원이 직접 고른 언어(쿠키) → ② 관리자가 초대 때 정한 언어 → ③ 지금 언어(기본 영어). 검수된 언어만 (B-21)
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;
  const allowed = selectableLocales();
  const locale: Locale =
    isLocale(chosen) && allowed.includes(chosen)
      ? chosen
      : invite && isLocale(invite.locale) && allowed.includes(invite.locale)
        ? invite.locale
        : ((await getLocale()) as Locale);
  const t = await getTranslations({ locale, namespace: 'register' });

  return (
    <NextIntlClientProvider locale={locale} messages={messagesFor(locale)}>
      <PageShell>
        <OpenExternal />
        <div className="flex items-center justify-between gap-2">
          <Logo height={32} priority />
          <LanguageSwitcher options={languageOptions()} />
        </div>
        <Card className="flex flex-col gap-4">
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-primary-deep">
            <KeyRound aria-hidden size={28} strokeWidth={1.75} />
            {invite || !token ? t('title') : t('invalidTitle')}
          </h1>
          {invite ? (
            <>
              <div>
                <p className="text-xl font-semibold">{t('hello', { name: invite.name })}</p>
                <p className="num text-sm text-faint">{t('employeeNo', { no: invite.employeeNo })}</p>
              </div>
              <p>{t('explain')}</p>
              <PasswordSetup token={token} />
            </>
          ) : (
            <>
              {errorCode && <ErrorNote code={errorCode} />}
              <CodeForm />
            </>
          )}
        </Card>
        {!invite && (
          <Link href="/login" className="min-h-11 content-center text-center text-sm text-primary">
            {t('haveAccount')}
          </Link>
        )}
      </PageShell>
    </NextIntlClientProvider>
  );
}
