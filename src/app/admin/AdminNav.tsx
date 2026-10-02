'use client';
// 폰(< 1024px): 하단 탭 바 · 넓은 화면: 왼쪽 세로 메뉴. 구조는 같고 배치만 다르다 (마스터 5장)
import { Users, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// ★ 만든 탭만 여기 넣는다 (5장 규칙 3). 순서는 ① 홈 ② 처리함 ③ 기록 ④ 직원 ⑤ 더보기
//   홈(게이트 6)·처리함(7)·기록(8)·더보기(진단, 게이트 5)는 그 게이트에서 추가한다.
const TABS: { href: string; key: 'home' | 'inbox' | 'records' | 'members' | 'more'; icon: LucideIcon }[] = [
  { href: '/admin/members', key: 'members', icon: Users },
];

export function AdminNav() {
  const t = useTranslations('admin.nav');
  const path = usePathname();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-bg pb-[env(safe-area-inset-bottom)] lg:static lg:min-h-dvh lg:w-48 lg:border-t-0 lg:border-r lg:pb-0"
    >
      <ul className="flex lg:flex-col lg:gap-1 lg:p-3">
        {TABS.map(({ href, key, icon: Icon }) => {
          const active = path.startsWith(href);
          return (
            <li key={href} className="flex-1 lg:flex-none">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 text-xs lg:flex-row lg:justify-start lg:gap-2 lg:rounded-button lg:px-3 lg:text-base ${
                  active ? 'font-semibold text-primary-deep lg:bg-primary-tint' : 'text-muted'
                }`}
              >
                <Icon aria-hidden size={22} strokeWidth={1.75} />
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
