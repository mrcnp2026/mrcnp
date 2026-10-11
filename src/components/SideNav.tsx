'use client';
// PC(1024px~) 왼쪽 메뉴 — 직원·관리자 공용. 폰에서는 보이지 않는다(폰은 하단 탭 + 서랍 메뉴).
// 2026-10-11 의뢰인: PC도 시프티 수준으로 → 시프티 PC의 구성을 따른다 (`pc용/시프티 PC 화면 기록.md` 1·2장):
//   짙은 남색 196px · 한 줄 메뉴(아이콘 + 글자) · 누른 메뉴 아래에 하위 메뉴가 펼쳐짐 · 묶음 사이는 간격으로만 나눔.
//   로고·언어·로그아웃은 위쪽 흰 줄(AppFrame의 PC 상단 줄)로 옮겼다.
import {
  BellRing,
  Building2,
  CalendarRange,
  Clock,
  House,
  ListChecks,
  Megaphone,
  PencilLine,
  Plane,
  Send,
  UserRound,
  UserRoundCog,
  Users,
  Wallet,
  CalendarDays,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link, { useLinkStatus } from 'next/link';
import { usePressedTab } from './NavTab';

type Leaf = { href: string; key: string };
type Item = { href: string; key: string; icon: LucideIcon; badge?: number; sub?: Leaf[] };

/** 누른 메뉴의 다음 화면을 불러오는 동안 오른쪽 끝에 밝은 막대 (2026-10-06 의뢰인: 눌러도 진행 중인지 모르겠다) */
function Loading() {
  const { pending } = useLinkStatus();
  return <span aria-hidden className={`h-4 w-1 shrink-0 rounded-chip bg-on-primary ${pending ? 'opacity-100' : 'opacity-0'}`} />;
}

const MY: Leaf[] = [
  { href: '/punch', key: 'home' },
  { href: '/punch/schedule', key: 'mySchedule' },
  { href: '/punch/records', key: 'records' },
  { href: '/punch/requests', key: 'myRequests' },
  { href: '/punch/leave', key: 'leave' },
  { href: '/punch/notices', key: 'notices' },
  { href: '/punch/account', key: 'account' },
];

export function SideNav({ isAdmin, inboxCount = 0 }: { isAdmin: boolean; inboxCount?: number }) {
  const t = useTranslations('side');
  const { path, pressed, setPressed } = usePressedTab();
  // 묶음 사이는 간격으로만 나눈다 (시프티: 업무 메뉴 / 관리·회사 설정 / 프로필)
  const groups: Item[][] = isAdmin
    ? [
        [
          { href: '/admin', key: 'home', icon: House },
          { href: '/admin/schedule', key: 'adminSchedule', icon: CalendarRange },
          {
            href: '/admin/records/list',
            key: 'attendance',
            icon: Clock,
            sub: [
              { href: '/admin/records/calendar', key: 'calendarView' },
              { href: '/admin/records/list', key: 'listView' },
              { href: '/admin/records', key: 'monthly' },
              { href: '/admin/missing', key: 'missing' },
            ],
          },
          {
            href: '/admin/leave',
            key: 'leaveAdmin',
            icon: Plane,
            sub: [
              { href: '/admin/leave', key: 'leaveStatus' },
              { href: '/admin/leave/types', key: 'leaveTypes' },
            ],
          },
          { href: '/admin/inbox', key: 'requests', icon: Send, badge: inboxCount },
          { href: '/admin/notices', key: 'adminNotices', icon: Megaphone },
          { href: '/admin/payroll', key: 'payroll', icon: Wallet },
        ],
        [
          {
            href: '/admin/members',
            key: 'admin',
            icon: UserRoundCog,
            sub: [
              { href: '/admin/members', key: 'members' },
              { href: '/admin/branches', key: 'branches' },
              { href: '/admin/places', key: 'places' },
              { href: '/admin/jobs', key: 'jobs' },
              { href: '/admin/shifts', key: 'shifts' },
            ],
          },
          { href: '/admin/settings', key: 'config', icon: Building2 },
        ],
        [{ href: '/punch', key: 'my', icon: UserRound, sub: MY }],
      ]
    : [
        [
          { href: '/punch', key: 'home', icon: House },
          { href: '/punch/schedule', key: 'mySchedule', icon: CalendarRange },
          { href: '/punch/records', key: 'records', icon: ListChecks },
          { href: '/punch/requests', key: 'myRequests', icon: BellRing },
          { href: '/punch/corrections', key: 'corrections', icon: PencilLine },
          { href: '/punch/leave', key: 'leave', icon: CalendarDays },
          { href: '/punch/notices', key: 'notices', icon: Megaphone },
        ],
        [{ href: '/punch/account', key: 'account', icon: Users }],
      ];

  // 지금 화면 = 주소가 가장 길게 맞는 메뉴 하나 (/admin/leave/types는 「휴가 현황」이 아니라 「휴가 유형」)
  const leaves = groups.flat().flatMap((i) => i.sub ?? [{ href: i.href, key: i.key }]);
  const here = leaves.filter((i) => path === i.href || path.startsWith(`${i.href}/`)).sort((a, b) => b.href.length - a.href.length)[0]?.href;
  const active = pressed ?? here;

  return (
    <nav aria-label={t('menu')} className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-49 shrink-0 flex-col overflow-y-auto bg-nav py-4 text-on-primary lg:flex">
      {groups.map((items, gi) => (
        <div key={gi} className={gi > 0 ? 'mt-8' : ''}>
          {items.map(({ href, key, icon: Icon, badge, sub }) => {
            const open = sub ? sub.some((s) => s.href === active) : active === href;
            return (
              <div key={key}>
                <Link
                  href={href}
                  aria-current={open && !sub ? 'page' : undefined}
                  aria-expanded={sub ? open : undefined}
                  onClick={() => setPressed(href)}
                  className={`flex min-h-10.5 items-center gap-3.5 border-l-4 pr-3 pl-3.5 text-sm font-bold ${open ? 'border-on-primary/60 bg-on-primary/15 text-on-primary' : 'border-transparent text-on-primary/75 hover:bg-on-primary/10 hover:text-on-primary'}`}
                >
                  <Icon aria-hidden size={18} strokeWidth={2} className="shrink-0" />
                  <span className="flex-1">{t(key)}</span>
                  {!!badge && <span className="num min-w-4.5 rounded-chip bg-danger px-1 text-center text-xs leading-4.5 font-bold text-on-primary">{badge}</span>}
                  <Loading />
                </Link>
                {sub && open && (
                  <div className="bg-primary-deep/35 py-1">
                    {sub.map((s) => {
                      const on = active === s.href;
                      return (
                        <Link
                          key={s.href}
                          href={s.href}
                          aria-current={on ? 'page' : undefined}
                          onClick={() => setPressed(s.href)}
                          className={`flex min-h-9 items-center pr-3 pl-15 text-sm ${on ? 'font-bold text-on-primary' : 'text-on-primary/55 hover:text-on-primary'}`}
                        >
                          <span className="flex-1">{t(s.key)}</span>
                          <Loading />
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
