// 직원 「공지」 목록 — 대상이고 게시 중인 공지 전부 (②-5 7-15). 언어는 메뉴의 언어 버튼을 따른다.
// PC: 시프티 직원 모드의 「메시지」 — 왼쪽 좁은 칸(기간 · 수) + 오른쪽 표(메시지명 · 상태 · 노트 · 생성일자 · 관리) (2026-10-11 의뢰인 스샷 `스샷/직원모드 메세지.png`)
import { Megaphone } from 'lucide-react';
import { HelpTip } from '@/components/Help';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { NoticeBody } from '@/components/NoticeBody';
import { PcTable } from '@/components/PcTable';
import { Button, Card, Chip, PageShell } from '@/components/ui';
import { getMe } from '@/lib/auth';
import { visibleNoticesFor } from '@/lib/notices';
import { toKstDate } from '@/lib/time';
import { ConfirmButton } from './ConfirmButton';
import { unreadCount } from '@/lib/work-messages';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const field = 'num h-8 w-full min-w-0 rounded-button border border-border bg-bg px-2 text-sm text-text';

export default async function EmployeeNoticesPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; open?: string }> }) {
  const me = await getMe();
  if (!me) redirect('/login');
  const [t, tc, f, sp] = await Promise.all([getTranslations('notices'), getTranslations('common'), getFormatter(), searchParams]);
  const all = await visibleNoticesFor(me.id, await getLocale(), new Date());
  const unreadMsg = await unreadCount(me.id);
  // 기간: 게시 시작일(한국 날짜)로 거른다. 비워 두면 게시 중인 공지 전부 — 확인하지 않은 공지가 기간 밖이라 안 보이는 일이 없게
  const from = DAY.test(sp.from ?? '') ? sp.from! : '';
  const to = DAY.test(sp.to ?? '') ? sp.to! : '';
  const list = all.filter((n) => {
    const d = toKstDate(n.startsAt);
    return (!from || d >= from) && (!to || d <= to);
  });
  const unread = list.filter((n) => !n.confirmed).length;
  const hrefOf = (open?: string) => {
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    if (open) q.set('open', open);
    return q.size ? `/punch/notices?${q}` : '/punch/notices';
  };
  const opened = list.find((n) => n.id === sp.open);

  const content = (n: (typeof list)[number]) => (
    <>
      <h2 lang={n.display.locale} className="text-lg font-semibold break-words">
        {n.display.title}
      </h2>
      <NoticeBody text={n.display.body} lang={n.display.locale} />
      {n.display.translated && (
        <>
          <p className="text-xs text-faint">
            {n.display.machine && `${t('machine')} · `}
            {n.display.stale && `${t('stale')} · `}
            {tc('translationNotice')}
          </p>
          <details className="text-sm">
            <summary className="min-h-11 cursor-pointer content-center font-semibold text-primary">{t('showOriginal')}</summary>
            <div lang="ko" className="flex flex-col gap-1 rounded-button bg-surface p-3">
              <p className="font-semibold">{n.original.title}</p>
              <NoticeBody text={n.original.body} lang="ko" />
            </div>
          </details>
        </>
      )}
    </>
  );

  return (
    <>
      <PageShell wide>
        <Link href="/punch/messages" className="num inline-flex min-h-11 items-center gap-2 self-start rounded-button border border-border bg-bg px-4 text-sm font-bold text-primary">
          {t('toMessages')}
          {unreadMsg > 0 && <span className="rounded-full bg-primary px-2 text-xs text-on-primary">{unreadMsg}</span>}
        </Link>
        <div>
          <h1 className="flex flex-wrap items-center gap-x-1 text-2xl font-semibold text-primary-deep lg:font-bold lg:text-text">
            <Megaphone aria-hidden size={24} strokeWidth={1.75} className="lg:hidden" />
            {t('title')}
          <HelpTip>{t('intro')}</HelpTip></h1>
        </div>
        <div className="hidden lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-8">
          <aside className="flex flex-col gap-4">
            <h2 className="text-lg font-bold">{t('pcTitle')}</h2>
            <form action="/punch/notices" className="flex flex-col gap-2">
              <label className="flex flex-col gap-1 text-sm text-muted">
                {t('from')}
                <input type="date" name="from" defaultValue={from} className={field} />
              </label>
              <label className="flex flex-col gap-1 text-sm text-muted">
                {t('to')}
                <input type="date" name="to" defaultValue={to} className={field} />
              </label>
              <Button type="submit" variant="outline" size="sm">
                {t('load')}
              </Button>
              {(from || to) && (
                <Link href="/punch/notices" className="text-sm font-semibold text-primary">
                  {t('allPeriod')}
                </Link>
              )}
            </form>
            <dl className="num flex flex-col gap-1 border-t border-border pt-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted">{t('countAll')}</dt>
                <dd className="rounded-button bg-surface px-2 font-bold">{list.length}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted">{t('countNew')}</dt>
                <dd className={`rounded-button px-2 font-bold ${unread ? 'bg-warn-tint text-warn' : 'bg-surface'}`}>{unread}</dd>
              </div>
            </dl>
          </aside>
          <section className="flex min-w-0 flex-col gap-3">
            {opened && (
              <Card className="flex flex-col gap-2">
                {content(opened)}
                <div className="flex items-center justify-end gap-2">
                  {!opened.confirmed && <ConfirmButton id={opened.id} small />}
                  <Link href={hrefOf()} className="inline-flex h-8 items-center rounded-button border border-border bg-bg px-3 text-sm font-bold text-muted">
                    {t('close')}
                  </Link>
                </div>
              </Card>
            )}
            <PcTable
              labels={{ search: tc('colSearch'), empty: t('pcEmpty') }}
              cols={[
                { key: 'name', label: t('colName') },
                { key: 'state', label: t('colState') },
                { key: 'note', label: t('colNote'), sort: false },
                { key: 'date', label: t('colDate') },
                { key: 'manage', label: t('colManage'), search: false, sort: false },
              ]}
              rows={list.map((n) => ({
                id: n.id,
                cells: {
                  name: {
                    text: n.display.title,
                    node: (
                      <Link href={hrefOf(n.id)} lang={n.display.locale} className={`hover:text-primary ${n.confirmed ? '' : 'font-bold'}`}>
                        {n.display.title}
                      </Link>
                    ),
                  },
                  state: {
                    text: n.confirmed ? t('confirmed') : t('unread'),
                    node: (
                      <span className="flex flex-wrap items-center gap-1">
                        {n.important && <Chip tone="warn">{t('important')}</Chip>}
                        {n.confirmed ? <Chip tone="ok">{t('confirmed')}</Chip> : <Chip tone="info">{t('unread')}</Chip>}
                      </span>
                    ),
                  },
                  note: {
                    text: n.display.body,
                    node: (
                      <span lang={n.display.locale} className="block max-w-64 truncate text-muted">
                        {n.display.body}
                      </span>
                    ),
                  },
                  date: { text: toKstDate(n.startsAt), node: <span className="num whitespace-nowrap text-muted">{toKstDate(n.startsAt)}</span> },
                  manage: { text: '', node: n.confirmed ? null : <ConfirmButton id={n.id} small /> },
                },
              }))}
            />
          </section>
        </div>
        <div className="flex flex-col gap-3 lg:hidden">
          {/* 숫자 칸: 전체 · 아직 확인하지 않은 공지 (2026-10-06 의뢰인: 무엇이 중요한지 구분되지 않았다) */}
          <dl className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-2 rounded-card bg-bg p-4">
              <dt className="text-sm text-muted">{t('countAll')}</dt>
              <dd className="num text-2xl leading-none font-extrabold">{list.length}</dd>
            </div>
            <div className="flex flex-col gap-2 rounded-card bg-bg p-4">
              <dt className="text-sm text-muted">{t('countNew')}</dt>
              <dd className={`num text-2xl leading-none font-extrabold ${unread ? 'text-warn' : ''}`}>{unread}</dd>
            </div>
          </dl>
          {list.length === 0 && <p className="rounded-card bg-bg p-5 text-muted">{t('empty')}</p>}
          <ul className="flex flex-col gap-3">
            {list.map((n) => (
              <li key={n.id}>
                <Card className={`flex flex-col gap-2 border-l-4 ${n.confirmed ? 'border-bg' : 'border-primary'}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    {n.important && <Chip tone="warn">{t('important')}</Chip>}
                    {n.confirmed ? <Chip tone="ok">{t('confirmed')}</Chip> : <Chip tone="info">{t('new')}</Chip>}
                    <span className="num text-xs text-faint">{f.dateTime(n.startsAt, { dateStyle: 'medium' })}</span>
                  </div>
                  <div className="flex min-w-0 flex-col gap-2">
                    {content(n)}
                    {!n.confirmed && <ConfirmButton id={n.id} />}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </div>
      </PageShell>
    </>
  );
}
