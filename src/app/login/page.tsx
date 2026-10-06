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
  return (
    <div className="lg:grid lg:min-h-dvh lg:grid-cols-2">
      <aside className="hidden bg-primary text-on-primary lg:flex lg:flex-col lg:justify-between lg:p-12">
        <span aria-hidden />
        <div className="flex max-w-md flex-col gap-8">
          <div className="flex flex-col gap-4">
            <p className="text-4xl leading-tight font-extrabold tracking-tight whitespace-pre-line">{t('heroTitle')}</p>
            <p className="text-lg">{t('heroSub')}</p>
          </div>
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
          <LoginForm />
        </Card>
        {/* 설명 문구는 두지 않는다 — 입력 칸·버튼·링크만 (2026-10-06 의뢰인: 로그인 화면에 설명이 너무 많다) */}
        <p className="flex flex-wrap items-center justify-center gap-x-1 text-sm text-muted">
          {t('firstTime')}
          <Link href="/register" className="inline-flex min-h-11 items-center px-2 font-semibold text-primary">
            {t('setupLink')}
          </Link>
        </p>
        {/* 예전에 폰을 등록해 둔 기기에서만 되는 보조 로그인 — 맨 아래 작게 */}
        <LoginButton />
      </main>
    </div>
  );
}
