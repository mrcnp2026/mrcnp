// 「새 소식」 카드 (2026-10-18 의뢰인: 첫 화면에서 공지 · 사내게시판을 확인) — 공지와 사내게시판 글을 합쳐 안 읽은 것 먼저, 최근 것부터 3줄.
// 확인 안 한 중요한 공지는 지금처럼 홈을 열 때 팝업으로도 뜬다(NoticeSheet). 이 카드는 지나간 글까지 한눈에 보는 용도.
import { ChevronRight, Megaphone, MessagesSquare } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Card } from '@/components/ui';

export type NewsItem = { id: string; kind: 'notice' | 'board'; title: string; at: string; unread: boolean; href: string };

export async function NewsCard({ items }: { items: NewsItem[] }) {
  const [t, f] = await Promise.all([getTranslations('home.news'), getFormatter()]);
  const shown = [...items].sort((a, b) => Number(b.unread) - Number(a.unread) || b.at.localeCompare(a.at)).slice(0, 3);
  return (
    <Card className="flex flex-col gap-1 p-4">
      <div className="-my-1 flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold">{t('title')}</h2>
        <Link href="/punch/notices" className="inline-flex min-h-11 items-center gap-0.5 text-sm text-muted">
          {t('all')}
          <ChevronRight aria-hidden size={16} />
        </Link>
      </div>
      {shown.length === 0 ? (
        <p className="py-2 text-sm text-faint">{t('empty')}</p>
      ) : (
        <ul className="-mx-1 flex flex-col">
          {shown.map((n) => {
            const Icon = n.kind === 'notice' ? Megaphone : MessagesSquare;
            return (
              <li key={`${n.kind}${n.id}`}>
                <Link href={n.href} className="flex min-h-11 items-center gap-2 rounded-button px-1 hover:bg-surface">
                  <Icon aria-hidden size={16} className="shrink-0 text-muted" />
                  <span className="shrink-0 text-xs text-muted">{t(n.kind)}</span>
                  <span className={`min-w-0 flex-1 truncate text-sm ${n.unread ? 'font-bold' : ''}`}>{n.title}</span>
                  {n.unread && <span aria-label={t('unread')} className="size-2 shrink-0 rounded-chip bg-danger" />}
                  <span className="num shrink-0 text-xs text-faint">{f.dateTime(new Date(n.at), { month: 'numeric', day: 'numeric' })}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
