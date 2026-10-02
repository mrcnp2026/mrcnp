import { ShieldCheck } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
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
  const tc = await getTranslations('common');
  return (
    <PageShell>
      <div className="flex justify-end">
        <LanguageSwitcher options={languageOptions()} />
      </div>
      <section className="flex flex-col items-center gap-3 py-6 text-center">
        <Logo height={56} priority />
        <p className="text-sm text-muted">{tc('appName')}</p>
      </section>
      <Card className="flex flex-col gap-4 p-6">
        <h1 className="text-2xl font-semibold text-primary-deep">{t('title')}</h1>
        <p className="text-muted">{t('subtitle')}</p>
        <LoginButton />
        <p className="flex gap-2 text-sm text-muted">
          <ShieldCheck aria-hidden size={18} strokeWidth={1.75} className="mt-0.5 shrink-0" />
          {t('privacy')}
        </p>
      </Card>
      <Card className="flex flex-col gap-3">
        <p className="font-semibold">{t('firstTime')}</p>
        <p className="text-sm text-muted">{t('qrHint')}</p>
        <Link
          href="/register"
          className="inline-flex min-h-12 items-center justify-center rounded-button border border-border bg-bg px-4 font-semibold text-primary"
        >
          {t('registerLink')}
        </Link>
      </Card>
    </PageShell>
  );
}
