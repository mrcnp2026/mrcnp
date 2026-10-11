'use client';
// PC(1024px~) 관리자 화면의 왼쪽 메뉴 — 폰에서는 보이지 않는다(폰은 하단 탭 + 서랍 메뉴). 직원 화면(/punch)은 왼쪽 메뉴 없이 상단 탭(StaffTabs).
// 시프티 PC의 구성을 따른다 (2026-10-11 의뢰인 스샷 88장 — `스샷/홈.png` · `근무일정 달력형 주 단위.png` · `휴가내역.png` · `스케줄 패턴.png` · `관리-회사설정.png`):
//   · 짙은 남색 196px · 한 줄 메뉴(아이콘 + 흰 글자) · 묶음 사이는 간격으로만 나눔
//   · 근무일정 · 출퇴근기록 · 휴가: 마우스를 올리면 하위 메뉴가 **아래로** 스르륵 펼쳐진다. 그 메뉴 안에 있을 때는 펼쳐진 채로 있다
//   · 관리 · 회사 설정: 마우스를 올려도 펼치지 않는다 — 눌러서 들어가면 사이드 메뉴 옆에 흰 둘째 메뉴가 붙는다 (2026-10-11 시프티 실측 · 의뢰인 "두 개는 클릭")
import { Building2, CalendarRange, Clock, House, Megaphone, Plane, Send, UserRoundCog, Wallet, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link, { useLinkStatus } from 'next/link';
import { useSearchParams } from 'next/navigation';
import { usePressedTab } from './NavTab';

type Leaf = { href: string; key: string };
type Panel = { key: string; items: Leaf[] }[];
type Item = { href: string; key: string; icon: LucideIcon; badge?: number; sub?: Leaf[]; panel?: Panel };

// 스르륵: 시프티와 같은 박자 — 천천히 시작해 빨라졌다가 천천히 멎는다(ease-in-out). 2026-10-11 시프티 실측: 0.35초 ease-in-out.
// 의뢰인 2026-10-11: "출퇴근기록 · 휴가가 열리는 모습을 그대로" — 열림 · 닫힘 모두 0.35초 ease-in-out, 머뭇거림 없음. 확 튀어나오는 곡선(ease-out 계열)은 쓰지 않는다
const EASE = 'ease-in-out';

/** 누른 메뉴의 다음 화면을 불러오는 동안 오른쪽 끝에 막대 (2026-10-06 의뢰인: 눌러도 진행 중인지 모르겠다) */
function Loading({ dark = false }: { dark?: boolean }) {
  const { pending } = useLinkStatus();
  return <span aria-hidden className={`h-4 w-1 shrink-0 rounded-chip ${dark ? 'bg-primary' : 'bg-on-primary'} ${pending ? 'opacity-100' : 'opacity-0'}`} />;
}

// 「관리」의 둘째 메뉴 — 시프티와 같은 묶음 이름 · 순서 (기본 / 근무일정 / 휴가 / 요청 / 메시지)
const MANAGE: Panel = [
  {
    key: 'gBasic',
    items: [
      { href: '/admin/members', key: 'members' },
      { href: '/admin/branches', key: 'branches' },
      { href: '/admin/places', key: 'places' },
      { href: '/admin/jobs', key: 'jobs' },
      { href: '/admin/manage/work-info', key: 'workInfo' },
    ],
  },
  {
    key: 'gSchedule',
    items: [
      { href: '/admin/manage/shift-kinds', key: 'shiftKinds' },
      { href: '/admin/shifts', key: 'shifts' },
    ],
  },
  {
    key: 'gLeave',
    items: [
      { href: '/admin/leave/types', key: 'leaveTypes' },
      { href: '/admin/manage/leave-groups', key: 'leaveGroups' },
      { href: '/admin/manage/accrual-rule', key: 'accrualRule' },
    ],
  },
  { key: 'gRequest', items: [{ href: '/admin/manage/approval-rules', key: 'approvalRules' }] },
  {
    key: 'gMessage',
    items: [
      { href: '/admin/manage/message-templates', key: 'messageTemplates' },
      { href: '/admin/manage/message-rules', key: 'messageRules' },
    ],
  },
];

// 「회사 설정」의 둘째 메뉴 — 시프티의 탭 이름 · 순서. 탭은 주소의 ?tab= 로 고른다(없으면 일반)
const SETTING_TABS = ['general', 'notify', 'access', 'branch', 'staff', 'work', 'punch', 'break', 'leave', 'request', 'message', 'esign', 'closing', 'report', 'pay', 'security', 'advanced'] as const;
const SETTINGS: Panel = [{ key: 'config', items: SETTING_TABS.map((x) => ({ href: x === 'general' ? '/admin/settings' : `/admin/settings?tab=${x}`, key: `s_${x}` })) }];

function PanelLinks({ panel, active, onPick, t }: { panel: Panel; active: string | undefined; onPick: (href: string) => void; t: (k: string) => string }) {
  return (
    <>
      {panel.map((g) => (
        <div key={g.key} className="pb-3">
          <p className="px-6 pt-2 pb-1 text-xs font-bold text-primary">{t(g.key)}</p>
          {g.items.map((s) => {
            const on = active === s.href;
            return (
              <Link key={s.href} href={s.href} aria-current={on ? 'page' : undefined} onClick={() => onPick(s.href)} className={`flex min-h-9 items-center pr-3 pl-6 text-sm ${on ? 'bg-border font-bold text-text' : 'text-muted hover:bg-border/60 hover:text-text'}`}>
                <span className="flex-1">{t(s.key)}</span>
                <Loading dark />
              </Link>
            );
          })}
        </div>
      ))}
    </>
  );
}

export function SideNav({ isAdmin, inboxCount = 0 }: { isAdmin: boolean; inboxCount?: number }) {
  const t = useTranslations('side');
  const { path, pressed, setPressed } = usePressedTab();
  const query = useSearchParams();
  const manager = isAdmin && path.startsWith('/admin');
  const groups: Item[][] = [
    [
      { href: '/admin', key: 'home', icon: House },
      {
        href: '/admin/schedule',
        key: 'adminSchedule',
        icon: CalendarRange,
        sub: [
          { href: '/admin/schedule', key: 'calendarView' },
          { href: '/admin/schedule?v=list', key: 'listView' },
        ],
      },
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
      {
        href: '/admin/leave',
        key: 'leaveAdmin',
        icon: Plane,
        sub: [
          { href: '/admin/leave', key: 'leaveHistory' },
          { href: '/admin/leave?v=accrual', key: 'leaveAccrual' },
        ],
      },
      { href: '/admin/inbox', key: 'requests', icon: Send, badge: inboxCount },
      { href: '/admin/notices', key: 'adminNotices', icon: Megaphone },
      { href: '/admin/payroll', key: 'payroll', icon: Wallet },
    ],
    [
      { href: '/admin/members', key: 'admin', icon: UserRoundCog, panel: MANAGE },
      { href: '/admin/settings', key: 'config', icon: Building2, panel: SETTINGS },
    ],
  ];

  // 지금 화면 = 주소가 가장 잘 맞는 메뉴 하나. 주소의 길(path)이 길게 맞을수록, 그리고 ?v= · ?tab= 까지 맞으면 그쪽이 이긴다
  // (/admin/leave/types는 「휴가」가 아니라 관리의 「휴가 유형」, /admin/schedule?v=list는 「목록형」)
  const leaves = groups.flat().flatMap((i) => i.sub ?? i.panel?.flatMap((g) => g.items) ?? [{ href: i.href, key: i.key }]);
  const score = (href: string) => {
    const [p, qs] = href.split('?');
    if (path !== p && !path.startsWith(`${p}/`)) return -1;
    if (!qs) return p.length * 2;
    if (path !== p) return -1;
    return [...new URLSearchParams(qs)].every(([k, v]) => query.get(k) === v) ? p.length * 2 + 1 : -1;
  };
  const here = leaves.map((i) => ({ href: i.href, s: score(i.href) })).filter((x) => x.s >= 0).sort((a, b) => b.s - a.s)[0]?.href;
  const active = pressed ?? here;
  const panel = groups.flat().find((i) => i.panel?.some((g) => g.items.some((x) => x.href === active)))?.panel;
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
                    className={`flex min-h-10.5 items-center gap-3.5 border-l-4 pr-3 pl-3.5 text-sm font-bold transition-colors duration-200 ${open ? 'border-on-primary/60 bg-on-primary/15 text-on-primary' : 'border-transparent text-on-primary hover:bg-on-primary/10'}`}
                  >
                    <Icon aria-hidden size={18} strokeWidth={2} className="shrink-0" />
                    <span className="flex-1">{t(key)}</span>
                    {!!badge && <span className="num min-w-4.5 rounded-chip bg-danger px-1 text-center text-xs leading-4.5 font-bold text-on-primary">{badge}</span>}
                    <Loading />
                  </Link>
                  {/* 아래로 펼침: 높이가 스르륵 열리고 글자가 살짝 내려오며 나타난다. 그 메뉴 안에 있으면 펼쳐 둔다 */}
                  {sub && (
                    <div className={`grid bg-primary-deep/35 transition-[grid-template-rows] duration-350 ${EASE} ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr] group-focus-within/item:grid-rows-[1fr] group-hover/item:grid-rows-[1fr]'}`}>
                      <div className="overflow-hidden">
                        <div className="py-1">
                          {sub.map((s) => {
                            const on = active === s.href;
                            return (
                              <Link key={s.href} href={s.href} aria-current={on ? 'page' : undefined} onClick={() => setPressed(s.href)} className={`flex min-h-9 items-center pr-3 pl-15 text-sm transition-colors duration-200 ${on ? 'font-bold text-on-primary' : 'text-on-primary/80 hover:text-on-primary'}`}>
                                <span className="flex-1">{t(s.key)}</span>
                                <Loading />
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </nav>
      {panel && (
        <nav aria-label={t('admin')} className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-56 shrink-0 flex-col overflow-y-auto border-r border-border bg-bg py-4 lg:flex">
          <PanelLinks panel={panel} active={active} onPick={setPressed} t={t} />
        </nav>
      )}
    </>
  );
}
