'use client';
// 폰(< 1024px) 하단 탭 — 직원·관리자 모두 같은 탭 (2026-10-10 의뢰인: 시프티처럼. 관리자만 다른 탭 묶음을 오가던 것을 없앰).
// 홈 · 요청 · 근무일정 · 출퇴근기록 · 휴가 (근무일정은 2026-10-10 2단계에 붙였다). 관리자는 같은 탭에서 「전체」 화면이 먼저 열리고, 화면 위 보기 범위(ScopeSwitch)로 「내 것」을 본다.
// 탭에 없는 화면(현황·직원·급여·공지·설정·내 계정)은 왼쪽 위 메뉴(MenuDrawer). 넓은 화면은 왼쪽 메뉴(SideNav)가 맡는다.
import { BellRing, CalendarDays, CalendarRange, House, ListChecks, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { NavTab, usePressedTab } from './NavTab';

type Tab = { key: 'home' | 'requests' | 'schedule' | 'attendance' | 'leave'; icon: LucideIcon; mine: string; all?: string; also?: string[] };
const TABS: Tab[] = [
  { key: 'home', icon: House, mine: '/punch' },
  { key: 'requests', icon: BellRing, mine: '/punch/requests', all: '/admin/inbox', also: ['/punch/corrections'] }, // 정정 요청 양식도 요청 탭 아래다
  { key: 'schedule', icon: CalendarRange, mine: '/punch/schedule', all: '/admin/schedule' },
  { key: 'attendance', icon: ListChecks, mine: '/punch/records', all: '/admin/records' },
  { key: 'leave', icon: CalendarDays, mine: '/punch/leave', all: '/admin/leave' },
];

// 배지는 요청 탭에만, 0이면 숨긴다 (승인할 요청 수 — 관리자만)
export function BottomTabs({ isAdmin, inboxCount = 0 }: { isAdmin: boolean; inboxCount?: number }) {
  const t = useTranslations('nav');
  const { path, pressed, setPressed } = usePressedTab();
  const under = (href: string) => path === href || path.startsWith(`${href}/`);
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-bg pb-[env(safe-area-inset-bottom)] lg:hidden">
      <ul className="mx-auto flex max-w-md">
        {TABS.map(({ key, icon, mine, all, also }) => {
          const href = isAdmin && all ? all : mine;
          const here = key === 'home' ? path === mine : under(mine) || (!!all && under(all)) || !!also?.some(under);
          return (
            <li key={key} className="flex-1">
              <NavTab
                href={href}
                label={t(key)}
                icon={icon}
                active={pressed ? pressed === href : here}
                onPress={() => setPressed(href)}
                badge={
                  key === 'requests' && inboxCount > 0 ? (
                    <span className="num absolute -top-2 -right-3 min-w-5 rounded-chip bg-warn px-1 text-center text-xs leading-5 font-bold text-on-primary">{inboxCount}</span>
                  ) : null
                }
              />
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
