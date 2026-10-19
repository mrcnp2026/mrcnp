// 사내게시판 (직원) — 회사가 보낸 글을 본다. 직원은 글쓰기 · 답글이 없다(2026-10-16 의뢰인 알림-8). 본인이 받은 것만.
import { getTranslations } from 'next-intl/server';
import { HelpTip } from '@/components/Help';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MessageList } from '@/components/MessageViews';
import { PageShell } from '@/components/ui';
import { getMe } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadInbox } from '@/lib/work-messages';

export default async function MyMessagesPage() {
  const me = await getMe();
  if (!me) redirect('/login');
  const t = await getTranslations('messages');
  const [items, { data: staff }] = await Promise.all([loadInbox(me), createAdminClient().from('profiles').select('id, name')]);
  const names = new Map((staff ?? []).map((p) => [p.id as string, p.name as string]));
  const tab = (on: boolean) => `flex min-h-11 flex-1 lg:flex-none lg:px-4 items-center justify-center border-b-2 text-sm font-bold ${on ? 'border-text text-text lg:border-primary lg:text-primary' : 'border-transparent text-muted hover:text-text'}`;
  return (
    <PageShell>
      <div>
        <h1 className="flex flex-wrap items-center gap-x-1 text-2xl font-bold">{t('title')}<HelpTip>{t('intro')}</HelpTip></h1>
      </div>
      {/* 폰에서만 — PC는 왼쪽 메뉴(공지 · 사내게시판)가 같은 일을 해서 겹쳤다 (2026-10-18 디자인) */}
      <nav className="flex border-b border-border lg:hidden">
        <Link href="/punch/notices" className={tab(false)}>
          {t('tabNotices')}
        </Link>
        <Link href="/punch/messages" aria-current="page" className={tab(true)}>
          {t('tabInbox')}
        </Link>
      </nav>
      <MessageList items={items} base="/punch/messages" names={names} sent={false} />
    </PageShell>
  );
}
