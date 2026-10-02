// 직원 홈 (PWA 진입점). 게이트 4에서 "오늘 근무" 카드 + 출퇴근 큰 버튼이 들어간다 (부록 R-10-1).
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { SignOutButton } from '@/components/SignOutButton';
import { Card, PageShell } from '@/components/ui';
import { languageOptions } from '@/i18n/locales';
import { getMe } from '@/lib/auth';

export default async function PunchPage() {
  const me = await getMe();
  if (!me) redirect('/login');
  const t = await getTranslations('home');
  return (
    <PageShell>
      <header className="flex items-center justify-between gap-2">
        <LanguageSwitcher options={languageOptions()} />
        <SignOutButton />
      </header>
      <Card>
        <p className="text-xl font-semibold">{t('hello', { name: me.name })}</p>
        <p className="mt-2 text-muted">{t('comingSoon')}</p>
      </Card>
    </PageShell>
  );
}
