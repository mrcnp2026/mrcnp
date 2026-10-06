'use client';
// 폰(< 1024px) 하단 탭 바. 넓은 화면은 왼쪽 메뉴(components/SideNav)가 맡는다 (2026-10-06 의뢰인)
import { BellRing, House, LayoutDashboard, Menu, Users, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { NavTab, usePressedTab } from '@/components/NavTab';

// ① 홈 = 처음 들어온 출퇴근 화면으로 돌아가기 ② 현황(관리자 현황판) ③ 요청(정정·연장·연차 승인) ④ 직원(목록·조직도·연차 관리) ⑤ 전체(나머지 화면 모음)
// ★ 2026-10-06 의뢰인: 탭 안에 또 메뉴가 나와 복잡하다 → 매일 쓰는 5개만. 기록·급여·공지·설정은 「전체」 한 화면에 (PC 왼쪽 메뉴와 같은 묶음)
const TABS: { href: string; key: 'home' | 'board' | 'inbox' | 'members' | 'more'; icon: LucideIcon }[] = [
  { href: '/punch', key: 'home', icon: House },
  { href: '/admin', key: 'board', icon: LayoutDashboard },
  { href: '/admin/inbox', key: 'inbox', icon: BellRing },
  { href: '/admin/members', key: 'members', icon: Users },
  { href: '/admin/more', key: 'more', icon: Menu },
];

// 규칙 1: 배지는 처리함 탭에만, 0이면 숨긴다
export function AdminNav({ inboxCount }: { inboxCount: number }) {
  const t = useTranslations('admin.nav');
  const { path, pressed, setPressed } = usePressedTab();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-bg pb-[env(safe-area-inset-bottom)] lg:hidden">
      <ul className="flex">
        {TABS.map(({ href, key, icon }) => {
          const inMembers = path.startsWith('/admin/members') || path.startsWith('/admin/leave'); // 직원 탭 = 직원 목록·조직도·연차 관리
          const here = key === 'board' ? path === '/admin' : key === 'members' ? inMembers : key === 'more' ? !inMembers && path !== '/admin' && !path.startsWith('/admin/inbox') : path.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <NavTab
                href={href}
                label={t(key)}
                icon={icon}
                active={pressed ? pressed === href : here}
                onPress={() => setPressed(href)}
                badge={
                  key === 'inbox' && inboxCount > 0 ? (
                    <span className="num absolute -top-2 -right-3 min-w-5 rounded-chip bg-warn px-1 text-center text-xs leading-5 font-bold text-on-primary">
                      {inboxCount}
                    </span>
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
