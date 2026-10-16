// 이메일로 가입 신청 (2026-10-16 의뢰인 권한-6) — 초대 링크가 없는 사람이 스스로 신청하고, 관리자가 승인하면 로그인된다.
// 초대 링크 · 코드로 가입하는 길(/register)은 그대로 있다. 끝나면 초대 가입과 같은 「홈 화면에 추가」 안내.
import { MailPlus } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Logo } from '@/components/Logo';
import { OpenExternal } from '@/components/OpenExternal';
import { Card, PageShell } from '@/components/ui';
import { languageOptions } from '@/i18n/locales';
import { getMe } from '@/lib/auth';
import { homePathForRole } from '@/lib/home-path';
import { SignupForm } from './SignupForm';

export default async function SignupPage() {
  if (await getMe()) redirect(homePathForRole());
  const t = await getTranslations('signup');
  return (
    <PageShell>
      <OpenExternal />
      <div className="flex items-center justify-between gap-2">
        <Logo height={32} priority />
        <LanguageSwitcher options={languageOptions()} />
      </div>
      <Card className="flex flex-col gap-4">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-primary-deep">
          <MailPlus aria-hidden size={26} strokeWidth={1.75} />
          {t('title')}
        </h1>
        <SignupForm />
      </Card>
      <p className="flex flex-wrap items-center justify-center gap-x-1 text-sm text-muted">
        {t('haveInvite')}
        <Link href="/register" className="inline-flex min-h-11 items-center px-2 font-semibold text-primary">
          {t('inviteLink')}
        </Link>
      </p>
      <Link href="/login" className="min-h-11 content-center text-center text-sm text-primary">
        {t('haveAccount')}
      </Link>
    </PageShell>
  );
}
