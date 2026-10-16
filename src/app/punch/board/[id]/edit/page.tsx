// 게시판 글 고치기 — 쓴 사람만
import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { MineBar } from '@/components/MineBar';
import { PageShell } from '@/components/ui';
import { getMe } from '@/lib/auth';
import { getBoardPost } from '@/lib/board';
import { safeRichHtml } from '@/lib/rich-text';
import { BoardForm } from '../../BoardForm';

export default async function BoardEditPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getMe();
  if (!me) redirect('/login');
  const [t, tc, { id }] = await Promise.all([getTranslations('board'), getTranslations('common'), params]);
  const post = await getBoardPost(id);
  if (!post || post.authorId !== me.id) notFound();
  return (
    <PageShell>
      <MineBar menu={tc('menu')} title={t('edit')} />
      <h1 className="hidden text-2xl font-bold lg:block">{t('edit')}</h1>
      <BoardForm id={post.id} title={post.title} html={safeRichHtml(post.bodyHtml)} />
    </PageShell>
  );
}
