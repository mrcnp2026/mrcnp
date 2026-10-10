'use client';
// PC(1024px~) 왼쪽 메뉴 — 직원·관리자 공용 (2026-10-06 의뢰인: PC 화면이 폰 화면 그대로였다. 샤플처럼 왼쪽에 묶음별 메뉴).
// 폰에서는 보이지 않는다 — 폰은 하단 탭(EmployeeNav·AdminNav)을 그대로 쓴다.
// 「더보기」에 접혀 있던 화면(연차 관리·공지·설정·진단·내 계정)을 PC에서는 전부 펼쳐 보인다.
import {
  MapPin,
  BellRing,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  House,
  LayoutDashboard,
  ListChecks,
  Megaphone,
  Network,
  PencilLine,
  Settings,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link, { useLinkStatus } from 'next/link';
import { LanguageSwitcher } from './LanguageSwitcher';
import { Logo } from './Logo';
import { usePressedTab } from './NavTab';
import { SignOutButton } from './SignOutButton';

type Item = { href: string; key: string; icon: LucideIcon; badge?: number };

/** 누른 메뉴의 다음 화면을 불러오는 동안 오른쪽 끝에 파란 막대 (2026-10-06 의뢰인: 눌러도 진행 중인지 모르겠다). 움직임 없이 나타났다 사라진다 */
function Loading() {
  const { pending } = useLinkStatus();
  return <span aria-hidden className={`h-5 w-1 shrink-0 rounded-chip bg-primary ${pending ? 'opacity-100' : 'opacity-0'}`} />;
}
type Group = { key: string; items: Item[] };

export function SideNav({ isAdmin, inboxCount = 0, languages }: { isAdmin: boolean; inboxCount?: number; languages: { code: string; name: string }[] }) {
  const t = useTranslations('side');
  const { path, pressed, setPressed } = usePressedTab();
  const groups: Group[] = [
    {
      key: 'my',
      items: [
        { href: '/punch', key: 'home', icon: House },
        { href: '/punch/records', key: 'records', icon: ListChecks },
        { href: '/punch/corrections', key: 'corrections', icon: PencilLine },
        { href: '/punch/leave', key: 'leave', icon: CalendarDays },
        { href: '/punch/notices', key: 'notices', icon: Megaphone },
      ],
    },
    ...(isAdmin
      ? [
          {
            key: 'manage',
            items: [
              { href: '/admin', key: 'board', icon: LayoutDashboard },
              { href: '/admin/inbox', key: 'inbox', icon: BellRing, badge: inboxCount },
              { href: '/admin/records', key: 'adminRecords', icon: ClipboardList },
              { href: '/admin/leave', key: 'adminLeave', icon: CalendarCheck },
            ],
          },
          {
            key: 'people',
            items: [
              { href: '/admin/members', key: 'members', icon: Users },
              { href: '/admin/branches', key: 'branches', icon: Network },
      { href: '/admin/places', key: 'places', icon: MapPin },
            ],
          },
          {
            key: 'office',
            items: [
              { href: '/admin/payroll', key: 'payroll', icon: Wallet },
              { href: '/admin/notices', key: 'adminNotices', icon: Megaphone },
            ],
          },
        ]
      : []),
    {
      key: 'settings',
      items: [
        ...(isAdmin
          ? [{ href: '/admin/settings', key: 'config', icon: Settings }]
          : []),
        { href: '/punch/account', key: 'account', icon: UserRound },
      ],
    },
  ];
  // 지금 화면 = 주소가 가장 길게 맞는 메뉴 하나 (/admin/members/groups는 「직원」이 아니라 「조직도」)
  const all = groups.flatMap((g) => g.items);
  const here = all.filter((i) => path === i.href || path.startsWith(`${i.href}/`)).sort((a, b) => b.href.length - a.href.length)[0]?.href;
  const active = pressed ?? here;

  return (
    <nav aria-label={t('menu')} className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-bg lg:flex">
      <div className="px-5 pt-5 pb-3">
        <Logo height={32} priority />
      </div>
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 pb-4">
        {groups.map((g) => (
          <div key={g.key} className="flex flex-col gap-0.5">
            <p className="px-3 pt-1 pb-1 text-xs font-medium text-faint">{t(g.key)}</p>
            {g.items.map(({ href, key, icon: Icon, badge }) => {
              const on = active === href;
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={on ? 'page' : undefined}
                  onClick={() => setPressed(href)}
                  className={`flex min-h-11 items-center gap-3 rounded-button px-3 text-sm ${on ? 'bg-primary-tint font-bold text-primary' : 'text-text'}`}
                >
                  <Icon aria-hidden size={20} strokeWidth={on ? 2.25 : 1.75} className="shrink-0" />
                  <span className="flex-1">{t(key)}</span>
                  {!!badge && <span className="num min-w-5 rounded-chip bg-warn px-1.5 text-center text-xs leading-5 font-bold text-on-primary">{badge}</span>}
                  <Loading />
                </Link>
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2 border-t border-border p-3">
        <div className="flex justify-center">
          <LanguageSwitcher options={languages} />
        </div>
        <SignOutButton />
      </div>
    </nav>
  );
}
