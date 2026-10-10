// 요청 화면 맨 위 탭 한 줄 (2026-10-10 의뢰인: 시프티처럼 「대기중 · 내 요청 · 완료」가 한 줄, 숫자 배지와 함께).
// 관리자: 대기중(승인할 요청) · 내 요청 · 완료(전 직원 처리 내역). 직원: 대기중(내 것) · 완료(내 것).
// 「참조」 탭은 승인자를 여러 명 두게 될 때 붙인다 — 아직 없는 기능의 탭은 보이지 않는다.
import { getTranslations } from 'next-intl/server';
import { Search } from 'lucide-react';
import Link from 'next/link';
import { MenuButton } from './MenuButton';

export type RequestTab = 'pending' | 'mine' | 'done';

export async function RequestTabs({ admin, active, counts, live = false, q = '' }: { admin: boolean; active: RequestTab; counts: Partial<Record<RequestTab, number>>; live?: boolean; q?: string }) {
  const [t, tc] = await Promise.all([getTranslations('requests'), getTranslations('common')]);
  const lq = live ? '&live=1' : '';
  const tabs: { key: RequestTab; href: string }[] = admin
    ? [
        { key: 'pending', href: `/admin/inbox${live ? '?live=1' : ''}` },
        { key: 'mine', href: '/punch/requests' },
        { key: 'done', href: `/admin/inbox?tab=done${lq}` },
      ]
    : [
        { key: 'pending', href: '/punch/requests' },
        { key: 'done', href: '/punch/requests?tab=done' },
      ];
  const here = tabs.find((x) => x.key === active)!.href;
  const [action, query = ''] = here.split('?');
  return (
    <div className="sticky top-0 z-10 -mx-4 -mt-4 bg-bg pt-[calc(0.5rem+env(safe-area-inset-top))] lg:static lg:mx-0 lg:mt-0 lg:pt-0">
      {/* 검색 줄 — 주소(?q)로 보낸다. 탭·연습 보기 값은 그대로 둔다 */}
      <div className="flex items-center gap-2 px-4 pb-1 lg:px-0 lg:pb-3">
        <MenuButton label={tc('menu')} />
        <form role="search" method="get" action={action} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-button bg-surface px-3 lg:bg-bg">
          {[...new URLSearchParams(query)].map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <Search aria-hidden size={20} className="shrink-0 text-muted" />
          <input type="search" name="q" defaultValue={q} placeholder={t('search')} aria-label={t('search')} maxLength={40} className="min-h-11 w-full min-w-0 bg-transparent text-base outline-none" />
        </form>
      </div>
      <nav aria-label={t('title')} className="flex border-b border-border bg-bg px-2 lg:rounded-card lg:border">
        {tabs.map(({ key, href }) => {
          const on = key === active;
          const n = counts[key];
          return (
            <Link key={key} href={href} aria-current={on ? 'page' : undefined} className={`flex min-h-12 flex-1 items-center justify-center gap-2 border-b-2 text-base font-bold whitespace-nowrap ${on ? 'border-text text-text' : 'border-transparent text-muted'}`}>
              {t(key === 'pending' ? 'tabPending' : key === 'mine' ? 'tabMine' : 'tabDone')}
              {n !== undefined && <span className={`num min-w-6 rounded-button px-1.5 text-center text-xs leading-5 font-bold ${n > 0 && key === 'pending' ? 'bg-warn text-on-primary' : 'bg-surface text-muted'}`}>{n}</span>}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
