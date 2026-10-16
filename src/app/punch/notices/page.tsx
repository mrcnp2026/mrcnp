// 직원 「공지」 목록 — 대상이고 게시 중인 공지 전부 (②-5 7-15). 언어는 메뉴의 언어 버튼을 따른다.
// PC: 한 칸 — 「전체 · 확인 안 함」 탭 + 표(제목 · 상태 · 내용 · 게시일 · 확인). 제목으로만 찾는다.
// 2026-10-16 의뢰인: 시프티 「메시지」를 따라 만든 시작일 · 종료일 칸과 칸마다 붙은 검색, 「업무 메시지」 버튼이 공지에는 필요 없다(업무 메시지는 메뉴 · 알림에서 간다).
import { Megaphone } from 'lucide-react';
import { HelpTip } from '@/components/Help';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { NoticeBody } from '@/components/NoticeBody';
import { RichHtml } from '@/components/RichHtml';
import { PcTable } from '@/components/PcTable';
import { Card, Chip, PageShell } from '@/components/ui';
import { getMe } from '@/lib/auth';
import { visibleNoticesFor } from '@/lib/notices';
import { toKstDate } from '@/lib/time';
import { ConfirmButton } from './ConfirmButton';


export default async function EmployeeNoticesPage({ searchParams }: { searchParams: Promise<{ f?: string; open?: string }> }) {
  const me = await getMe();
  if (!me) redirect('/login');
  const [t, tc, f, sp] = await Promise.all([getTranslations('notices'), getTranslations('common'), getFormatter(), searchParams]);
  const all = await visibleNoticesFor(me.id, await getLocale(), new Date());
  // 탭: 전체 / 확인 안 함 (?f=unread)
  const onlyUnread = sp.f === 'unread';
  const unread = all.filter((n) => !n.confirmed).length;
  const list = onlyUnread ? all.filter((n) => !n.confirmed) : all;
  const hrefOf = (open?: string) => {
    const q = new URLSearchParams();
    if (onlyUnread) q.set('f', 'unread');
    if (open) q.set('open', open);
    return q.size ? `/punch/notices?${q}` : '/punch/notices';
  };
  const opened = list.find((n) => n.id === sp.open);

  const content = (n: (typeof list)[number]) => (
    <>
      <h2 lang={n.display.locale} className="text-lg font-semibold break-words">
        {n.display.title}
      </h2>
      <RichHtml html={n.display.translated ? null : n.original.html} text={n.display.body} lang={n.display.locale} />
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
              <RichHtml html={n.original.html} text={n.original.body} lang="ko" />
            </div>
          </details>
        </>
      )}
    </>
  );

  return (
    <>
      <PageShell wide>
        <div>
          <h1 className="flex flex-wrap items-center gap-x-1 text-2xl font-semibold text-primary-deep lg:font-bold lg:text-text">
            <Megaphone aria-hidden size={24} strokeWidth={1.75} className="lg:hidden" />
            {t('title')}
          <HelpTip>{t('intro')}</HelpTip></h1>
        </div>
        <div className="hidden flex-col gap-3 lg:flex">
          <nav className="flex items-center gap-1 border-b border-border" aria-label={t('title')}>
            {([['all', t('tabAll'), all.length], ['unread', t('tabUnread'), unread]] as const).map(([k, label, n]) => {
              const on = (k === 'unread') === onlyUnread;
              return (
                <Link key={k} href={k === 'unread' ? '/punch/notices?f=unread' : '/punch/notices'} aria-current={on ? 'page' : undefined} className={`-mb-px flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-bold ${on ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-text'}`}>
                  {label}
                  <span className={`num rounded-chip px-2 text-xs ${k === 'unread' && n > 0 ? 'bg-warn-tint text-warn' : 'bg-surface text-muted'}`}>{n}</span>
                </Link>
              );
            })}
          </nav>
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
              labels={{ search: t('searchTitle'), empty: t(onlyUnread ? 'emptyUnread' : 'empty') }}
              cols={[
                { key: 'name', label: t('colTitle') },
                { key: 'state', label: t('colState'), search: false },
                { key: 'note', label: t('colBody'), search: false, sort: false },
                { key: 'date', label: t('colPosted'), search: false },
                { key: 'manage', label: t('colConfirm'), search: false, sort: false },
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
