import { CalendarCheck, FileClock, KeyRound, ShieldCheck } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { OpenExternal } from '@/components/OpenExternal';
import { Logo } from '@/components/Logo';
import { Card } from '@/components/ui';
import { BRAND } from '@/config/brand';
import { languageOptions } from '@/i18n/locales';
import { getMe } from '@/lib/auth';
import { homePathForRole } from '@/lib/home-path';
import { LoginButton } from './LoginButton';
import { LoginForm } from './LoginForm';

export default async function LoginPage() {
  const me = await getMe();
  if (me) redirect(homePathForRole());
  const t = await getTranslations('login');
  // 넓은 화면(PC·태블릿 가로, 1024px~)은 두 칸: 왼쪽 소개 면 + 오른쪽 로그인. 폰은 그대로 한 칸 (2026-10-05 의뢰인: PC 로그인이 폰 화면 그대로였다)
  const points = [
    { icon: KeyRound, text: t('point1') },
    { icon: CalendarCheck, text: t('point2') },
    { icon: FileClock, text: t('point3') },
  ];
  return (
    <div className="lg:grid lg:min-h-dvh lg:grid-cols-2">
      <aside className="hidden bg-primary text-on-primary lg:flex lg:flex-col lg:justify-between lg:p-12">
        <span aria-hidden />
        <div className="flex max-w-md flex-col gap-8">
          <div className="flex flex-col gap-4">
            <p className="text-4xl leading-tight font-extrabold tracking-tight whitespace-pre-line">{t('heroTitle')}</p>
            <p className="text-lg">{t('heroSub')}</p>
          </div>
          <ul className="flex flex-col gap-4">
            {points.map((x) => (
              <li key={x.text} className="flex items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-button bg-bg text-primary">
                  <x.icon aria-hidden size={22} strokeWidth={1.75} />
                </span>
                <span>{x.text}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm">© {BRAND.name}</p>
      </aside>
      <main className="mx-auto flex w-full max-w-md flex-col gap-3 px-4 py-4 lg:justify-center lg:py-12">
        <OpenExternal />
        <div className="flex justify-end">
          <LanguageSwitcher options={languageOptions()} />
        </div>
        <section className="flex justify-center py-6">
          <Logo height={56} priority />
        </section>
        <Card className="flex flex-col gap-4 p-6">
          <h1 className="text-2xl font-semibold text-primary-deep">{t('title')}</h1>
          <p className="text-muted">{t('subtitle')}</p>
          <LoginForm />
          <p className="flex gap-2 text-sm text-muted">
            <ShieldCheck aria-hidden size={18} strokeWidth={1.75} className="mt-0.5 shrink-0" />
            {t('secure')}
          </p>
        </Card>
        <Card className="flex flex-col gap-3">
          <p className="font-semibold">{t('firstTime')}</p>
          <p className="text-sm text-muted">{t('setupHint')}</p>
          <Link
            href="/register"
            className="inline-flex min-h-12 items-center justify-center rounded-button border border-border bg-bg px-4 font-semibold text-primary"
          >
            {t('setupLink')}
          </Link>
        </Card>
        {/* 예전에 폰을 등록해 둔 기기에서만 되는 보조 로그인 — 맨 아래 작게 */}
        <LoginButton />
      </main>
    </div>
  );
}
