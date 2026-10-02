'use client';
// 폰(< 1024px): 하단 탭 바 · 넓은 화면: 왼쪽 세로 메뉴. 구조는 같고 배치만 다르다 (마스터 5장)
import { ClipboardList, House, Inbox, Menu, Users, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from '@/components/Logo';

// 탭 5개, 순서 ① 홈 ② 처리함 ③ 기록 ④ 직원 ⑤ 더보기 (마스터 5장). ②의 메뉴는 이 목록에 미리 넣지 않는다 (규칙 3).
const TABS: { href: string; key: 'home' | 'inbox' | 'records' | 'members' | 'more'; icon: LucideIcon }[] = [
  { href: '/admin', key: 'home', icon: House },
  { href: '/admin/inbox', key: 'inbox', icon: Inbox },
  { href: '/admin/records', key: 'records', icon: ClipboardList },
  { href: '/admin/members', key: 'members', icon: Users },
  { href: '/admin/more', key: 'more', icon: Menu },
];

// 규칙 1: 배지는 처리함 탭에만, 0이면 숨긴다
export function AdminNav({ inboxCount }: { inboxCount: number }) {
  const t = useTranslations('admin.nav');
  const path = usePathname();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-bg pb-[env(safe-area-inset-bottom)] lg:static lg:min-h-dvh lg:w-48 lg:border-t-0 lg:border-r lg:pb-0"
    >
      <div className="hidden px-4 pt-5 pb-3 lg:block">
        <Logo height={32} />
      </div>
      <ul className="flex lg:flex-col lg:gap-1 lg:p-3">
        {TABS.map(({ href, key, icon: Icon }) => {
          const active = href === '/admin' ? path === '/admin' : path.startsWith(href) || (key === 'more' && path.startsWith('/admin/diag'));
          return (
            <li key={href} className="flex-1 lg:flex-none">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 text-xs lg:flex-row lg:justify-start lg:gap-2 lg:rounded-button lg:px-3 lg:text-base ${
                  active ? 'font-semibold text-primary-deep lg:bg-primary-tint' : 'text-muted'
                }`}
              >
                <span className="relative">
                  <Icon aria-hidden size={22} strokeWidth={1.75} />
                  {key === 'inbox' && inboxCount > 0 && (
                    <span className="num absolute -top-2 -right-3 min-w-5 rounded-chip bg-warn px-1 text-center text-xs font-semibold text-on-primary">
                      {inboxCount}
                    </span>
                  )}
                </span>
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
