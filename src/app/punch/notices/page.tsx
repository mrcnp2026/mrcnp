// 직원 「공지」 목록 — 대상이고 게시 중인 공지 전부 (②-5 7-15). 언어는 상단 언어 버튼을 따른다.
import { Megaphone } from 'lucide-react';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { NoticeBody } from '@/components/NoticeBody';
import { TopBar } from '@/components/TopBar';
import { Card, Chip, PageShell } from '@/components/ui';
import { languageOptions } from '@/i18n/locales';
import { getMe } from '@/lib/auth';
import { visibleNoticesFor } from '@/lib/notices';
import { ConfirmButton } from './ConfirmButton';

export default async function EmployeeNoticesPage() {
  const me = await getMe();
  if (!me) redirect('/login');
  const t = await getTranslations('notices');
  const tc = await getTranslations('common');
  const f = await getFormatter();
  const list = await visibleNoticesFor(me.id, await getLocale(), new Date());
  return (
    <>
      {/* PC는 왼쪽 메뉴에 언어 버튼이 있다 */}
      <div className="lg:hidden">
        <TopBar right={<LanguageSwitcher options={languageOptions()} />} />
      </div>
      <PageShell wide>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-primary-deep">
          <Megaphone aria-hidden size={24} strokeWidth={1.75} />
          {t('title')}
        </h1>
        {/* 숫자 칸: 전체 · 아직 확인하지 않은 공지 (2026-10-06 의뢰인: 무엇이 중요한지 구분되지 않았다) */}
        <dl className="grid grid-cols-2 gap-2 lg:max-w-md lg:gap-4">
          <div className="flex flex-col gap-2 rounded-card bg-bg p-4 lg:p-5">
            <dt className="text-sm text-muted">{t('countAll')}</dt>
            <dd className="num text-2xl leading-none font-extrabold lg:text-3xl">{list.length}</dd>
          </div>
          <div className="flex flex-col gap-2 rounded-card bg-bg p-4 lg:p-5">
            <dt className="text-sm text-muted">{t('countNew')}</dt>
            <dd className={`num text-2xl leading-none font-extrabold lg:text-3xl ${list.some((n) => !n.confirmed) ? 'text-warn' : ''}`}>{list.filter((n) => !n.confirmed).length}</dd>
          </div>
        </dl>
        {list.length === 0 && <p className="rounded-card bg-bg p-5 text-muted">{t('empty')}</p>}
        <ul className="flex flex-col gap-3">
          {list.map((n) => (
            <li key={n.id}>
              <Card className={`flex flex-col gap-2 border-l-4 lg:grid lg:grid-cols-4 lg:gap-6 ${n.confirmed ? 'border-bg' : 'border-primary'}`}>
                <div className="flex flex-wrap items-center gap-2 lg:flex-col lg:items-start">
                  {n.important && <Chip tone="warn">{t('important')}</Chip>}
                  {n.confirmed ? <Chip tone="ok">{t('confirmed')}</Chip> : <Chip tone="info">{t('new')}</Chip>}
                  <span className="num text-xs text-faint">{f.dateTime(n.startsAt, { dateStyle: 'medium' })}</span>
                  {!n.confirmed && (
                    <span className="hidden lg:block">
                      <ConfirmButton id={n.id} />
                    </span>
                  )}
                </div>
                <div className="flex min-w-0 flex-col gap-2 lg:col-span-3">
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
                {!n.confirmed && (
                  <span className="lg:hidden">
                    <ConfirmButton id={n.id} />
                  </span>
                )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </PageShell>
    </>
  );
}
