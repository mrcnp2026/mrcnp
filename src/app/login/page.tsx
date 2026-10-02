import { ShieldCheck } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Logo } from '@/components/Logo';
import { Card, PageShell } from '@/components/ui';
import { languageOptions } from '@/i18n/locales';
import { getMe } from '@/lib/auth';
import { homePathForRole } from '@/lib/home-path';
import { LoginButton } from './LoginButton';

export default async function LoginPage() {
  const me = await getMe();
  if (me) redirect(homePathForRole(me.role));
  const t = await getTranslations('login');
  return (
    <PageShell>
      <div className="flex items-center justify-between gap-2">
        <Logo height={32} priority />
        <LanguageSwitcher options={languageOptions()} />
      </div>
      <Card className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold text-primary-deep">{t('title')}</h1>
        <p className="text-muted">{t('subtitle')}</p>
        <LoginButton />
        <p className="flex gap-2 text-sm text-muted">
          <ShieldCheck aria-hidden size={18} strokeWidth={1.75} className="mt-0.5 shrink-0" />
          {t('privacy')}
        </p>
      </Card>
      <p className="text-sm text-faint">{t('noPhone')}</p>
    </PageShell>
  );
}
