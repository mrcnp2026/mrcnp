// 게시판 글쓰기
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { MineBar } from '@/components/MineBar';
import { PageShell } from '@/components/ui';
import { getMe } from '@/lib/auth';
import { BoardForm } from '../BoardForm';

export default async function BoardNewPage() {
  const me = await getMe();
  if (!me) redirect('/login');
  const [t, tc] = await Promise.all([getTranslations('board'), getTranslations('common')]);
  return (
    <PageShell>
      <MineBar menu={tc('menu')} title={t('write')} />
      <h1 className="hidden text-2xl font-bold lg:block">{t('write')}</h1>
      <BoardForm />
    </PageShell>
  );
}
