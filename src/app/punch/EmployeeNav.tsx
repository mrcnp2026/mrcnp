'use client';
// 직원 하단 탭 3개 (부록 R-10-4). 배지 없음. 누르는 즉시 반응 (NavTab)
import { House, ListChecks, PencilLine, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { NavTab, usePressedTab } from '@/components/NavTab';

const TABS: { href: string; key: 'home' | 'records' | 'corrections'; icon: LucideIcon }[] = [
  { href: '/punch', key: 'home', icon: House },
  { href: '/punch/records', key: 'records', icon: ListChecks },
  { href: '/punch/corrections', key: 'corrections', icon: PencilLine },
];

export function EmployeeNav() {
  const t = useTranslations('nav');
  const { path, pressed, setPressed } = usePressedTab();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-bg pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto flex max-w-md">
        {TABS.map(({ href, key, icon }) => {
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
