'use client';
// 폰(< 1024px) 하단 탭 바. 넓은 화면은 왼쪽 메뉴(components/SideNav)가 맡는다 (2026-10-06 의뢰인)
import { BellRing, ClipboardList, House, LayoutDashboard, Menu, Users, Wallet, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { NavTab, usePressedTab } from '@/components/NavTab';

// 탭 7개 (2026-10-02 의뢰인): ① 홈 = 처음 들어온 출퇴근 화면으로 돌아가기 (하단 메뉴가 바뀌어도 홈은 같은 곳)
// ② 현황(관리자 현황판) ③ 요청(정정·연장·연차 승인 — 예전 이름 "처리함"은 무엇이 들어 있는지 안 보였다)
// ④ 기록 ⑤ 직원 ⑥ 급여(③ 급여 문서) ⑦ 더보기
const TABS: { href: string; key: 'home' | 'board' | 'inbox' | 'records' | 'members' | 'payroll' | 'more'; icon: LucideIcon }[] = [
  { href: '/punch', key: 'home', icon: House },
  { href: '/admin', key: 'board', icon: LayoutDashboard },
  { href: '/admin/inbox', key: 'inbox', icon: BellRing },
  { href: '/admin/records', key: 'records', icon: ClipboardList },
  { href: '/admin/members', key: 'members', icon: Users },
  { href: '/admin/payroll', key: 'payroll', icon: Wallet },
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
          const here = href === '/admin' ? path === '/admin' : path.startsWith(href) || (key === 'more' && (path.startsWith('/admin/diag') || path.startsWith('/admin/notices')));
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
