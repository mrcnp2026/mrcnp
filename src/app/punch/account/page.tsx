// 「내 계정」 — 로그인 아이디 확인 + 비밀번호 바꾸기 (2026-10-05 의뢰인: 아이디 + 비밀번호 로그인).
// 지문 로그인만 쓰던 사람(비밀번호 없음)은 여기서 비밀번호를 처음 만든다 — 그래야 PC·다른 폰에서도 로그인할 수 있다.
import { UserRound } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Card, CardTitle, PageShell } from '@/components/ui';
import { getMe } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { PasswordForm } from './PasswordForm';

export default async function AccountPage() {
  const me = await getMe();
  if (!me) redirect('/login');
  const t = await getTranslations('account');
  const { data: p } = await createAdminClient().from('profiles').select('password_set_at').eq('id', me.id).maybeSingle();
  const hasPassword = !!p?.password_set_at;
  return (
    <>
      <PageShell>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-primary-deep">
          <UserRound aria-hidden size={24} strokeWidth={1.75} />
          {t('title')}
        </h1>
        <Card className="flex flex-col gap-1">
          <CardTitle>{t('idLabel')}</CardTitle>
          <p className="num text-xl font-bold">{me.employeeNo}</p>
          <p className="text-sm text-muted">{me.name}</p>
        </Card>
        <Card className="flex flex-col gap-4">
          <CardTitle>{t(hasPassword ? 'changeTitle' : 'createTitle')}</CardTitle>
          {!hasPassword && <p className="text-sm text-muted">{t('createNote')}</p>}
          <PasswordForm hasPassword={hasPassword} />
        </Card>
      </PageShell>
    </>
  );
}
