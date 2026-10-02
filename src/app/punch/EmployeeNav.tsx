'use client';
// 직원 하단 탭 3개 (부록 R-10-4). 배지 없음. 누르는 즉시 반응 (NavTab)
// 관리자가 이 화면을 쓸 때는 4번째 탭 「직원관리」 → 관리자 화면 (상단 네모 아이콘과 같은 곳, 2026-10-02 의뢰인)
import { CalendarDays, House, LayoutDashboard, ListChecks, PencilLine, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { NavTab, usePressedTab } from '@/components/NavTab';

// ② 연차 탭이 4번째 (②-2 게이트 5, 2026-10-02 시프티 대조 우선 반영 ①)
type Tab = { href: string; key: 'home' | 'records' | 'corrections' | 'leave' | 'manage'; icon: LucideIcon };
const TABS: Tab[] = [
  { href: '/punch', key: 'home', icon: House },
  { href: '/punch/records', key: 'records', icon: ListChecks },
  { href: '/punch/corrections', key: 'corrections', icon: PencilLine },
  { href: '/punch/leave', key: 'leave', icon: CalendarDays },
];
const ADMIN_TAB: Tab = { href: '/admin', key: 'manage', icon: LayoutDashboard };

export function EmployeeNav({ isAdmin = false }: { isAdmin?: boolean }) {
  const t = useTranslations('nav');
  const { path, pressed, setPressed } = usePressedTab();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-bg pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto flex max-w-md">
        {(isAdmin ? [...TABS, ADMIN_TAB] : TABS).map(({ href, key, icon }) => {
          const here = href === '/punch' ? path === '/punch' : path.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <NavTab href={href} label={t(key)} icon={icon} active={pressed ? pressed === href : here} onPress={() => setPressed(href)} />
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
