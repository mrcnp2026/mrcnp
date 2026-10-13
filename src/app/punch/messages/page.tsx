// 업무 메시지 (직원) — 받은 메시지 · 보낸 문의, 관리자에게 문의하기 (PRD v1.3 37.4, L19). 본인이 받은 것 · 보낸 것만.
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { InquiryCompose } from '@/components/MessageForms';
import { MessageList } from '@/components/MessageViews';
import { PageShell } from '@/components/ui';
import { getMe } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadInbox, loadSent } from '@/lib/work-messages';

export default async function MyMessagesPage({ searchParams }: { searchParams: Promise<{ box?: string }> }) {
  const me = await getMe();
  if (!me) redirect('/login');
  const [t, sp] = await Promise.all([getTranslations('messages'), searchParams]);
  const sent = sp.box === 'sent';
  // 직원의 「보낸 것」은 자기가 보낸 문의뿐이다(관리자가 보낸 통지 전체가 아니다)
  const [items, { data: staff }] = await Promise.all([sent ? loadSent({ ...me, role: 'employee' }) : loadInbox(me), createAdminClient().from('profiles').select('id, name')]);
  const names = new Map((staff ?? []).map((p) => [p.id as string, p.name as string]));
  const tab = (on: boolean) => `flex min-h-11 flex-1 items-center justify-center border-b-2 text-sm font-bold ${on ? 'border-text text-text' : 'border-transparent text-muted'}`;
  return (
    <PageShell>
      <div>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="pt-1 text-sm text-faint">{t('intro')}</p>
      </div>
      <nav className="flex border-b border-border">
        <Link href="/punch/notices" className={tab(false)}>
          {t('tabNotices')}
        </Link>
        <Link href="/punch/messages" aria-current={!sent ? 'page' : undefined} className={tab(!sent)}>
          {t('tabInbox')}
        </Link>
        <Link href="/punch/messages?box=sent" aria-current={sent ? 'page' : undefined} className={tab(sent)}>
          {t('tabSent')}
        </Link>
      </nav>
      <InquiryCompose />
      <MessageList items={items} base="/punch/messages" names={names} sent={sent} />
    </PageShell>
  );
}
