// 사내 게시판 목록 (2026-10-16 의뢰인: 자유 게시판, 글이 쌓이면 페이지 넘김). 한 페이지 15개, 최신 글이 위.
// 제목 · 본문 글자로 찾는다(?q=). 페이지는 주소(?p=)로 넘겨 뒤로 가기 · 새로 고침에도 같은 페이지다.
import { ImageIcon, PenLine, Search } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MineBar } from '@/components/MineBar';
import { Pager } from '@/components/Pager';
import { Card, PageShell } from '@/components/ui';
import { getMe } from '@/lib/auth';
import { listBoard } from '@/lib/board';

export default async function BoardPage({ searchParams }: { searchParams: Promise<{ p?: string; q?: string }> }) {
  const me = await getMe();
  if (!me) redirect('/login');
  const [t, tc, f, sp] = await Promise.all([getTranslations('board'), getTranslations('common'), getFormatter(), searchParams]);
  const q = (sp.q ?? '').slice(0, 50);
  const list = await listBoard(Number(sp.p) || 1, q);
  const when = (iso: string) => f.dateTime(new Date(iso), { year: 'numeric', month: '2-digit', day: '2-digit' });
  return (
    <PageShell>
      <MineBar menu={tc('menu')} title={t('title')} />
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="hidden flex-1 text-2xl font-bold lg:block">{t('title')}</h1>
        <form action="/punch/board" className="flex min-w-0 flex-1 items-center gap-2 rounded-button border border-border bg-bg px-3 focus-within:border-primary lg:max-w-xs">
          <Search aria-hidden size={16} className="shrink-0 text-faint" />
          <input name="q" defaultValue={q} placeholder={t('search')} aria-label={t('search')} className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none" />
        </form>
        <Link href="/punch/board/new" className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-button bg-primary px-4 text-sm font-bold text-on-primary">
          <PenLine aria-hidden size={16} />
          {t('write')}
        </Link>
      </div>
      {!list.ready && <p className="rounded-card border border-warn bg-warn-tint p-3 text-sm text-warn">{t('dbNeeded')}</p>}
      <Card className="p-0">
        <ul className="flex flex-col divide-y divide-border">
          {list.items.map((x) => (
            <li key={x.id}>
              <Link href={`/punch/board/${x.id}`} className="flex flex-col gap-1 px-4 py-3 hover:bg-surface">
                <span className="flex items-center gap-1.5 font-semibold break-words">
                  {x.title}
                  {x.hasImage && <ImageIcon aria-label={t('hasImage')} size={15} className="shrink-0 text-faint" />}
                </span>
                {x.excerpt && <span className="line-clamp-1 text-sm text-muted">{x.excerpt}</span>}
                <span className="num text-xs text-faint">
                  {x.authorName} · {when(x.createdAt)}
                  {x.updatedAt !== x.createdAt && ` · ${t('edited')}`}
                </span>
              </Link>
            </li>
          ))}
          {list.ready && list.items.length === 0 && <li className="px-4 py-8 text-center text-sm text-faint">{q ? t('noResult') : t('empty')}</li>}
        </ul>
      </Card>
      <Pager page={list.page} pages={list.pages} param="p" params={{ q: q || undefined }} label={t('pages')} />
      <p className="text-center text-xs text-faint">{t('count', { n: list.total })}</p>
    </PageShell>
  );
}
