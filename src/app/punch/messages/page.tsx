// 사내게시판 (직원) — 회사가 보낸 글을 본다. 직원은 글쓰기 · 답글이 없다(2026-10-16 의뢰인 알림-8). 본인이 받은 것만.
// 2026-10-30 의뢰인 「게시판도 공지처럼 레이아웃」: 전사공지와 같은 틀 — PC는 두 칸(2026-11-01) — 왼쪽 「전체 · 안 읽음」 + 오른쪽 표(제목 · 상태 · 보낸 사람 · 올린 날),
//   폰은 숫자 칸(전체 · 안 읽음) + 목록. 글을 누르면 지금처럼 한 건 보기(/punch/messages/[id])로 간다(열면 읽음으로 남는다).
import { CountUp } from '@/components/CountUp';
import { MessagesSquare } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import { HelpTip } from '@/components/Help';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MessageList } from '@/components/MessageViews';
import { PcTable } from '@/components/PcTable';
import { SideFilter } from '@/components/SideFilter';
import { Chip, PageShell } from '@/components/ui';
import { getMe } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';
import { loadInbox } from '@/lib/work-messages';

export default async function MyMessagesPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const me = await getMe();
  if (!me) redirect('/login');
  const [t, f, sp] = await Promise.all([getTranslations('messages'), getFormatter(), searchParams]);
  const [all, { data: staff }] = await Promise.all([loadInbox(me), createAdminClient().from('profiles').select('id, name')]);
  const names = new Map((staff ?? []).map((p) => [p.id as string, p.name as string]));
  const isUnread = (m: (typeof all)[number]) => !m.readAt && !m.mine;
  const unread = all.filter(isUnread).length;
  const onlyUnread = sp.f === 'unread';
  const list = onlyUnread ? all.filter(isUnread) : all;
  const from = (id: string | null) => (id ? (names.get(id) ?? '') : t('system'));
  return (
    <PageShell>
      <div>
        <h1 className="flex flex-wrap items-center gap-x-1 text-2xl font-semibold text-primary-deep lg:font-bold lg:text-text">
          <MessagesSquare aria-hidden size={24} strokeWidth={1.75} className="lg:hidden" />
          {t('title')}
          <HelpTip>{t('intro')}</HelpTip>
        </h1>
      </div>
      {/* 2026-11-01 의뢰인: 제증명 · 내 프로필처럼 PC는 두 칸 — 왼쪽: 전체 · 안 읽음, 오른쪽: 표 */}
      <div className="hidden lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start lg:gap-6">
        <SideFilter
          title={t('title')}
          items={[
            { key: 'all', label: t('tabAll'), n: all.length, href: '/punch/messages', on: !onlyUnread },
            { key: 'unread', label: t('unread'), n: unread, href: '/punch/messages?f=unread', on: onlyUnread, warn: true },
          ]}
        />
        <div className="min-w-0">
        <PcTable
          labels={{ search: t('searchTitle'), empty: t(onlyUnread ? 'emptyUnread' : 'empty') }}
          cols={[
            { key: 'name', label: t('colTitle') },
            { key: 'state', label: t('colState'), search: false },
            { key: 'from', label: t('colFrom'), search: false },
            { key: 'date', label: t('colPosted'), search: false },
          ]}
          rows={list.map((m) => ({
            id: m.id,
            cells: {
              name: {
                text: m.title,
                node: (
                  <Link prefetch={false} href={`/punch/messages/${m.id}`} className={`hover:text-primary ${isUnread(m) ? 'font-bold' : ''}`}>
                    {m.title}
                    {m.replies > 0 && <span className="num ml-1.5 text-xs font-normal text-muted">{t('replyCount', { n: m.replies })}</span>}
                  </Link>
                ),
              },
              state: {
                text: isUnread(m) ? t('unread') : t('read'),
                node: (
                  <span className="flex flex-wrap items-center gap-1">
                    <Chip tone={m.kind === 'inquiry' ? 'info' : 'neutral'}>{t(`kind.${m.kind}`)}</Chip>
                    {m.needsReply && <Chip tone="info">{t('needsReply')}</Chip>}
                    {isUnread(m) ? <Chip tone="warn">{t('unread')}</Chip> : <Chip tone="ok">{t('read')}</Chip>}
                  </span>
                ),
              },
              from: { text: from(m.senderId), node: <span className="text-muted">{from(m.senderId)}</span> },
              date: { text: toKstDate(new Date(m.createdAt)), node: <span className="num whitespace-nowrap text-muted">{f.dateTime(new Date(m.createdAt), { dateStyle: 'medium' })}</span> },
            },
          }))}
        />
        </div>
      </div>
      <div className="flex flex-col gap-3 lg:hidden">
        <dl className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-2 rounded-card bg-tile-2 p-4 shadow-card">
            <dt className="text-sm text-muted">{t('countAll')}</dt>
            <dd className="num text-2xl leading-none font-extrabold"><CountUp value={all.length} /></dd>
          </div>
          <div className="flex flex-col gap-2 rounded-card bg-tile-1 p-4 shadow-card">
            <dt className="text-sm text-muted">{t('countNew')}</dt>
            <dd className={`num text-2xl leading-none font-extrabold ${unread ? 'text-warn' : ''}`}><CountUp value={unread} /></dd>
          </div>
        </dl>
        <MessageList items={all} base="/punch/messages" names={names} sent={false} />
      </div>
    </PageShell>
  );
}
