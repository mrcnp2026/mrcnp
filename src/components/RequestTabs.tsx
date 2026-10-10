// 요청 화면 맨 위 탭 한 줄 (2026-10-10 의뢰인: 시프티처럼 「대기중 · 내 요청 · 완료」가 한 줄, 숫자 배지와 함께).
// 관리자: 대기중(승인할 요청) · 내 요청 · 완료(전 직원 처리 내역). 직원: 대기중(내 것) · 완료(내 것).
// 「참조」 탭은 승인자를 여러 명 두게 될 때 붙인다 — 아직 없는 기능의 탭은 보이지 않는다.
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

export type RequestTab = 'pending' | 'mine' | 'done';

export async function RequestTabs({ admin, active, counts, live = false }: { admin: boolean; active: RequestTab; counts: Partial<Record<RequestTab, number>>; live?: boolean }) {
  const t = await getTranslations('requests');
  const q = live ? '&live=1' : '';
  const tabs: { key: RequestTab; href: string }[] = admin
    ? [
        { key: 'pending', href: `/admin/inbox${live ? '?live=1' : ''}` },
        { key: 'mine', href: '/punch/requests' },
        { key: 'done', href: `/admin/inbox?tab=done${q}` },
      ]
    : [
        { key: 'pending', href: '/punch/requests' },
        { key: 'done', href: '/punch/requests?tab=done' },
      ];
  return (
    <nav aria-label={t('title')} className="-mx-4 flex border-b border-border bg-bg px-2 lg:mx-0 lg:rounded-card lg:border">
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
  );
}
