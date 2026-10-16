// 게시판 글 한 개 — 본문(서식 · 사진), 쓴 사람이면 [고치기], 쓴 사람 · 관리자면 [지우기]
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { MineBar } from '@/components/MineBar';
import { RichBody } from '@/components/RichBody';
import { Card, PageShell } from '@/components/ui';
import { getMe } from '@/lib/auth';
import { getBoardPost } from '@/lib/board';
import { BoardDelete } from '../BoardForm';

export default async function BoardPostPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getMe();
  if (!me) redirect('/login');
  const [t, tc, f, { id }] = await Promise.all([getTranslations('board'), getTranslations('common'), getFormatter(), params]);
  const post = await getBoardPost(id);
  if (!post) notFound();
  const mine = post.authorId === me.id;
  const when = (iso: string) => f.dateTime(new Date(iso), { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return (
    <PageShell>
      <MineBar menu={tc('menu')} title={t('title')} />
      <Link href="/punch/board" className="inline-flex min-h-9 items-center self-start text-sm font-medium text-muted">‹ {t('toList')}</Link>
      <Card className="flex flex-col gap-3">
        <h1 className="text-xl font-bold break-words">{post.title}</h1>
        <p className="num border-b border-border pb-3 text-sm text-muted">
          {post.authorName} · {when(post.createdAt)}
          {post.updatedAt !== post.createdAt && ` · ${t('editedAt', { at: when(post.updatedAt) })}`}
        </p>
        <RichBody html={post.bodyHtml} text={post.body} />
      </Card>
      {(mine || me.role === 'admin') && (
        <div className="flex justify-end gap-2">
          {mine && (
            <Link href={`/punch/board/${post.id}/edit`} className="inline-flex h-10 items-center rounded-button border border-border px-4 text-sm font-semibold">
              {t('edit')}
            </Link>
          )}
          <BoardDelete id={post.id} />
        </div>
      )}
    </PageShell>
  );
}
