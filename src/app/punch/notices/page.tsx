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
      <TopBar right={<LanguageSwitcher options={languageOptions()} />} />
      <PageShell>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-primary-deep">
          <Megaphone aria-hidden size={24} strokeWidth={1.75} />
          {t('title')}
        </h1>
        {list.length === 0 && <p className="text-muted">{t('empty')}</p>}
        <ul className="flex flex-col gap-3">
          {list.map((n) => (
            <li key={n.id}>
              <Card className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  {n.important && <Chip tone="warn">{t('important')}</Chip>}
                  {n.confirmed ? <Chip tone="ok">{t('confirmed')}</Chip> : <Chip tone="info">{t('new')}</Chip>}
                  <span className="num text-xs text-faint">{f.dateTime(n.startsAt, { dateStyle: 'medium' })}</span>
                </div>
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
                {!n.confirmed && <ConfirmButton id={n.id} />}
              </Card>
            </li>
          ))}
        </ul>
      </PageShell>
    </>
  );
}
