// 전체 메뉴 (폰) — 하단 탭 5개에 없는 화면을 PC 왼쪽 메뉴(components/SideNav)와 같은 이름·같은 묶음으로 한 화면에 모은다.
// (2026-10-06 의뢰인: 탭을 넘어가면 또 다른 메뉴가 나와 복잡하다 → 탭 7개를 5개로, 「더보기」를 「전체」로)
// 진단은 개발 확인용이라 회사 설정 화면 맨 아래에 있다.
import { CalendarCheck, ChevronRight, ClipboardList, Megaphone, Network, Settings, UserRound, Users, Wallet, type LucideIcon } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { SignOutButton } from '@/components/SignOutButton';
import { PageShell } from '@/components/ui';

const GROUPS: { key: string; items: { href: string; key: string; icon: LucideIcon }[] }[] = [
  {
    key: 'manage',
    items: [
      { href: '/admin/records', key: 'adminRecords', icon: ClipboardList },
      { href: '/admin/leave', key: 'adminLeave', icon: CalendarCheck },
    ],
  },
  {
    key: 'people',
    items: [
      { href: '/admin/members', key: 'members', icon: Users },
      { href: '/admin/members/groups', key: 'org', icon: Network },
    ],
  },
  {
    key: 'office',
    items: [
      { href: '/admin/payroll', key: 'payroll', icon: Wallet },
      { href: '/admin/notices', key: 'adminNotices', icon: Megaphone },
    ],
  },
  {
    key: 'settings',
    items: [
      { href: '/admin/settings', key: 'config', icon: Settings },
      { href: '/punch/account', key: 'account', icon: UserRound },
    ],
  },
];

export default async function MorePage() {
  const t = await getTranslations('admin.more');
  const ts = await getTranslations('side');
  return (
    <PageShell>
      <h1 className="px-1 text-2xl font-extrabold tracking-tight">{t('title')}</h1>
      {GROUPS.map((g) => (
        <section key={g.key} className="flex flex-col gap-1">
          <h2 className="px-1 text-xs font-medium text-faint">{ts(g.key)}</h2>
          <ul className="divide-y divide-border rounded-card bg-bg">
            {g.items.map(({ href, key, icon: Icon }) => (
              <li key={href}>
                <Link href={href} className="flex min-h-14 items-center gap-3 px-5">
                  <Icon aria-hidden size={22} strokeWidth={1.75} className="shrink-0 text-muted" />
                  <span className="flex-1 font-medium">{ts(key)}</span>
                  <ChevronRight aria-hidden size={20} strokeWidth={1.75} className="shrink-0 text-faint" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <SignOutButton />
    </PageShell>
  );
}
