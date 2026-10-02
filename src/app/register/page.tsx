// 초대 QR로 여는 폰 등록 화면 (4-11 등록 흐름). 로그인 전이라도 관리자가 정한 직원 언어로 보여 준다 (4-10).
import { ShieldCheck, Smartphone } from 'lucide-react';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import { ErrorNote } from '@/components/ErrorNote';
import { Card, PageShell } from '@/components/ui';
import { isLocale, selectableLocales, type Locale } from '@/i18n/locales';
import { messagesFor } from '@/i18n/messages';
import { PasskeyError } from '@/lib/passkey';
import { passkeyService } from '@/lib/passkey-store';
import { RegisterButton } from './RegisterButton';

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = '' } = await searchParams;
  let invite: { name: string; employeeNo: string; locale: string } | null = null;
  let errorCode: string | null = null;
  try {
    invite = await passkeyService().describeInvite(token);
  } catch (e) {
    errorCode = e instanceof PasskeyError ? e.code : 'generic';
  }

  // 검수된 언어면 그 언어로, 아니면 지금 언어(기본 영어) 그대로 (B-21)
  const locale: Locale =
    invite && isLocale(invite.locale) && selectableLocales().includes(invite.locale) ? invite.locale : ((await getLocale()) as Locale);
  const t = await getTranslations({ locale, namespace: 'register' });

  return (
    <NextIntlClientProvider locale={locale} messages={messagesFor(locale)}>
      <PageShell>
        <Card className="flex flex-col gap-4" >
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-primary-deep">
            <Smartphone aria-hidden size={28} strokeWidth={1.75} />
            {invite ? t('title') : t('invalidTitle')}
          </h1>
          {invite ? (
            <>
              <div>
                <p className="text-xl font-semibold">{t('hello', { name: invite.name })}</p>
                <p className="num text-sm text-faint">{t('employeeNo', { no: invite.employeeNo })}</p>
              </div>
              <p>{t('explain')}</p>
              <p className="flex gap-2 rounded-card bg-surface p-3 text-sm text-muted">
                <ShieldCheck aria-hidden size={18} strokeWidth={1.75} className="mt-0.5 shrink-0" />
                {t('privacy')}
              </p>
              <p className="text-sm text-muted">{t('onePhone')}</p>
              <RegisterButton token={token} />
            </>
          ) : (
            <ErrorNote code={errorCode ?? 'generic'} />
          )}
        </Card>
      </PageShell>
    </NextIntlClientProvider>
  );
}
