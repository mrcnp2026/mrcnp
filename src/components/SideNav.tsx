'use client';
// PC(1024px~) 왼쪽 메뉴 — 폰에서는 보이지 않는다(폰은 하단 탭 + 서랍 메뉴).
// 시프티 PC의 구성을 따른다 (2026-10-11 의뢰인 스샷 `스샷/홈.png` · `스샷/관리-직원.png`):
//   · 짙은 남색 196px · 한 줄 메뉴(아이콘 + 글자) · 묶음 사이는 간격으로만 나눔
//   · 하위 메뉴가 있는 메뉴는 **마우스를 올리면** 바로 아래로 펼쳐진다(누르지 않아도). 그 메뉴 안에 있을 때는 펼쳐진 채로 있다
//   · 「관리」처럼 항목이 많은 메뉴는 마우스를 올리면 사이드 메뉴 오른쪽에 패널이 하나 더 나온다. 관리 화면 안에서는 그 패널이 회색 둘째 메뉴로 계속 붙어 있다
//     (2026-10-11 의뢰인: "메뉴에 마우스를 대면 상세 메뉴가 자연스럽게 내려오는 구조 · 많으면 사이드 메뉴 우측으로 패널")
//   · 관리자 화면(/admin)에만 있다. 직원 화면(/punch)은 왼쪽 메뉴 없이 상단 탭(StaffTabs) — 오가는 것은 상단 줄의 [직원 모드로 전환] / [관리자 모드로 전환] 버튼
import { Building2, CalendarRange, Clock, House, Megaphone, Plane, Send, UserRoundCog, Wallet, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link, { useLinkStatus } from 'next/link';
import { useSearchParams } from 'next/navigation';
import { usePressedTab } from './NavTab';

type Leaf = { href: string; key: string };
type Item = { href: string; key: string; icon: LucideIcon; badge?: number; sub?: Leaf[]; panel?: { key: string; items: Leaf[] }[] };

/** 누른 메뉴의 다음 화면을 불러오는 동안 오른쪽 끝에 막대 (2026-10-06 의뢰인: 눌러도 진행 중인지 모르겠다) */
function Loading({ dark = false }: { dark?: boolean }) {
  const { pending } = useLinkStatus();
  return <span aria-hidden className={`h-4 w-1 shrink-0 rounded-chip ${dark ? 'bg-primary' : 'bg-on-primary'} ${pending ? 'opacity-100' : 'opacity-0'}`} />;
}

// 「관리」의 둘째 메뉴 — 시프티와 같은 묶음 이름
const MANAGE: { key: string; items: Leaf[] }[] = [
  {
    key: 'gBasic',
    items: [
      { href: '/admin/members', key: 'members' },
      { href: '/admin/branches', key: 'branches' },
      { href: '/admin/places', key: 'places' },
      { href: '/admin/jobs', key: 'jobs' },
    ],
  },
  { key: 'gSchedule', items: [{ href: '/admin/shifts', key: 'shifts' }] },
  { key: 'gLeave', items: [{ href: '/admin/leave/types', key: 'leaveTypes' }] },
];

function PanelLinks({ panel, active, onPick, t, dark = false }: { panel: { key: string; items: Leaf[] }[]; active: string | undefined; onPick: (href: string) => void; t: (k: string) => string; dark?: boolean }) {
  return (
    <>
      {panel.map((g) => (
        <div key={g.key} className="pb-3">
          <p className={`px-6 pt-2 pb-1 text-xs font-bold ${dark ? 'text-on-primary/60' : 'text-nav'}`}>{t(g.key)}</p>
          {g.items.map((s) => {
            const on = active === s.href;
            return (
              <Link key={s.href} href={s.href} aria-current={on ? 'page' : undefined} onClick={() => onPick(s.href)} className={`flex min-h-9 items-center pr-3 pl-6 text-sm ${dark ? 'text-on-primary hover:bg-on-primary/10' : on ? 'bg-border font-bold text-text' : 'text-muted hover:bg-border/60'}`}>
                <span className="flex-1">{t(s.key)}</span>
                <Loading dark={!dark} />
              </Link>
            );
          })}
        </div>
      ))}
    </>
  );
}

// 「회사 설정」의 둘째 메뉴 — 시프티는 왼쪽에 탭 목록(일반 · 알림 · 권한 …)이 있고 고른 탭의 내용만 오른쪽에 보인다.
// 우리가 가진 설정만 탭으로 둔다(없는 기능의 빈 탭은 만들지 않는다) — 이름은 시프티와 같게: 일반 · 근무일정 · 출퇴근기록 · 휴게시간. 탭은 주소의 ?tab= 로 고른다
const SETTINGS: { key: string; items: Leaf[] }[] = [
  {
    key: 'config',
    items: [
      { href: '/admin/settings?tab=general', key: 'sGeneral' },
      { href: '/admin/settings?tab=work', key: 'sWork' },
      { href: '/admin/settings?tab=punch', key: 'sPunch' },
      { href: '/admin/settings?tab=break', key: 'sBreak' },
    ],
  },
];

export function SideNav({ isAdmin, inboxCount = 0 }: { isAdmin: boolean; inboxCount?: number }) {
  const t = useTranslations('side');
  const { path, pressed, setPressed } = usePressedTab();
  const manager = isAdmin && path.startsWith('/admin');
  const groups: Item[][] = [
    [
      { href: '/admin', key: 'home', icon: House },
      { href: '/admin/schedule', key: 'adminSchedule', icon: CalendarRange },
      {
        href: '/admin/records/calendar',
        key: 'attendance',
        icon: Clock,
        sub: [
          { href: '/admin/records/calendar', key: 'calendarView' },
          { href: '/admin/records/list', key: 'listView' },
          { href: '/admin/records', key: 'monthly' },
          { href: '/admin/missing', key: 'missing' },
        ],
      },
      { href: '/admin/leave', key: 'leaveAdmin', icon: Plane },
      { href: '/admin/inbox', key: 'requests', icon: Send, badge: inboxCount },
      { href: '/admin/notices', key: 'adminNotices', icon: Megaphone },
      { href: '/admin/payroll', key: 'payroll', icon: Wallet },
    ],
    [
      { href: '/admin/members', key: 'admin', icon: UserRoundCog, panel: MANAGE },
      { href: '/admin/settings?tab=general', key: 'config', icon: Building2, panel: SETTINGS },
    ],
  ];

  // 지금 화면 = 주소가 가장 길게 맞는 메뉴 하나 (/admin/leave/types는 「휴가」가 아니라 관리의 「휴가 유형」)
  const leaves = groups.flat().flatMap((i) => i.sub ?? i.panel?.flatMap((g) => g.items) ?? [{ href: i.href, key: i.key }]);
  // 회사 설정은 탭까지 맞춘다(?tab=). 탭이 없으면 첫 탭
  const tab = useSearchParams().get('tab');
  const here =
    path === '/admin/settings'
      ? `/admin/settings?tab=${tab === 'work' || tab === 'punch' || tab === 'break' ? tab : 'general'}`
      : leaves.filter((i) => path === i.href || path.startsWith(`${i.href}/`)).sort((a, b) => b.href.length - a.href.length)[0]?.href;
  const active = pressed ?? here;
  const panel = groups.flat().find((i) => i.panel?.some((g) => g.items.some((x) => x.href === active)))?.panel;
  // 직원 모드(/punch)에는 왼쪽 메뉴가 없다 — 상단 줄의 탭(StaffTabs)이 대신한다 (2026-10-11 의뢰인 스샷 `스샷/직원모드 *.png`)
  if (!manager) return null;

  return (
    <>
      <nav aria-label={t('menu')} className="sticky top-14 z-20 hidden h-[calc(100dvh-3.5rem)] w-49 shrink-0 flex-col bg-nav py-4 text-on-primary lg:flex">
        {groups.map((items, gi) => (
          <div key={gi} className={gi > 0 ? 'mt-8' : ''}>
            {items.map(({ href, key, icon: Icon, badge, sub, panel: p }) => {
              const kids = sub ?? p?.flatMap((g) => g.items);
              const open = kids ? kids.some((s) => s.href === active) : active === href;
              return (
                <div key={key} className="group/item relative">
                  <Link
                    href={href}
                    aria-current={open && !kids ? 'page' : undefined}
                    aria-expanded={sub ? open : undefined}
                    onClick={() => setPressed(href)}
                    className={`flex min-h-10.5 items-center gap-3.5 border-l-4 pr-3 pl-3.5 text-sm font-bold ${open ? 'border-on-primary/60 bg-on-primary/15 text-on-primary' : 'border-transparent text-on-primary hover:bg-on-primary/10'}`}
                  >
                    <Icon aria-hidden size={18} strokeWidth={2} className="shrink-0" />
                    <span className="flex-1">{t(key)}</span>
                    {!!badge && <span className="num min-w-4.5 rounded-chip bg-danger px-1 text-center text-xs leading-4.5 font-bold text-on-primary">{badge}</span>}
                    <Loading />
                  </Link>
                  {/* 하위 메뉴: 그 메뉴 안에 있으면 펼쳐 두고, 아니면 마우스를 올리거나 글쇠로 들어왔을 때 펼친다 */}
                  {sub && (
                    <div className={`grid bg-primary-deep/35 transition-[grid-template-rows,opacity] duration-200 ease-out ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 group-focus-within/item:grid-rows-[1fr] group-focus-within/item:opacity-100 group-hover/item:grid-rows-[1fr] group-hover/item:opacity-100'}`}>
                      <div className="overflow-hidden">
                        <div className="py-1">
                      {sub.map((s) => {
                        const on = active === s.href;
                        return (
                          <Link key={s.href} href={s.href} aria-current={on ? 'page' : undefined} onClick={() => setPressed(s.href)} className={`flex min-h-9 items-center pr-3 pl-15 text-sm ${on ? 'font-bold text-on-primary' : 'text-on-primary/80 hover:text-on-primary'}`}>
                            <span className="flex-1">{t(s.key)}</span>
                            <Loading />
                          </Link>
                        );
                      })}
                        </div>
                      </div>
                    </div>
                  )}
                  {/* 항목이 많은 메뉴: 마우스를 올리면 사이드 메뉴 오른쪽에 패널 (그 메뉴 안에서는 아래의 붙어 있는 패널이 대신한다) */}
                  {p && !open && (
                    <div className="invisible absolute top-0 left-full z-30 w-52 -translate-x-2 bg-nav py-3 opacity-0 shadow-card transition-[opacity,transform,visibility] duration-200 ease-out group-focus-within/item:visible group-focus-within/item:translate-x-0 group-focus-within/item:opacity-100 group-hover/item:visible group-hover/item:translate-x-0 group-hover/item:opacity-100">
                      <PanelLinks dark panel={p} active={active} onPick={setPressed} t={t} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </nav>
      {panel && (
        <nav aria-label={t('admin')} className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-52 shrink-0 flex-col overflow-y-auto bg-surface py-4 lg:flex">
          <PanelLinks panel={panel} active={active} onPick={setPressed} t={t} />
        </nav>
      )}
    </>
  );
}
