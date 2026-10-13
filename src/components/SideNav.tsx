'use client';
// PC(1024px~) 관리자 화면의 왼쪽 메뉴 — 폰에서는 보이지 않는다(폰은 하단 탭 + 서랍 메뉴). 직원 화면(/punch)은 왼쪽 메뉴 없이 상단 탭(StaffTabs).
// 시프티 PC의 구성을 따른다 (2026-10-11 의뢰인 스샷 88장 — `스샷/홈.png` · `근무일정 달력형 주 단위.png` · `휴가내역.png` · `스케줄 패턴.png` · `관리-회사설정.png`):
//   · 짙은 남색 196px · 한 줄 메뉴(아이콘 + 흰 글자) · 묶음 사이는 간격으로만 나눔
//   · 근무일정 · 출퇴근기록 · 휴가: 마우스를 올리면 하위 메뉴가 **아래로** 스르륵 펼쳐진다. 그 메뉴 안에 있을 때는 펼쳐진 채로 있다
//   · 관리 · 회사 설정: 마우스를 올려도 펼치지 않는다 — 눌러서 들어가면 사이드 메뉴 옆에 흰 둘째 메뉴가 붙는다 (2026-10-11 시프티 실측 · 의뢰인 "두 개는 클릭")
import { Building2, CalendarRange, ChartColumn, Clock, House, Lock, Megaphone, PanelLeftClose, PanelLeftOpen, Plane, Send, UserRoundCog, Wallet, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { managerCanOpen } from '@/lib/manager-rules';
import Link, { useLinkStatus } from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
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
      { href: '/admin/manage/schedule-patterns', key: 'schedulePatterns' },
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
  { key: 'gReport', items: [{ href: '/admin/manage/report-templates', key: 'reportTemplates' }] },
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

export function SideNav({ isAdmin, branchManager = false, inboxCount = 0 }: { isAdmin: boolean; branchManager?: boolean; inboxCount?: number }) {
  const t = useTranslations('side');
  const { path, pressed, setPressed } = usePressedTab();
  const query = useSearchParams();
  const manager = isAdmin && path.startsWith('/admin');
  // 좁은 메뉴(아이콘 + 짧은 이름)가 기본, 맨 아래 「와이드 메뉴」를 누르면 이름이 아이콘 오른쪽으로 옮겨 가며 넓게 열린다 (2026-10-13 의뢰인: 다우오피스 왼쪽 메뉴처럼, 서랍이 열리듯 부드럽게)
  // 고른 모양은 이 브라우저에 기억한다. 처음 그릴 때는 움직임 없이 그 모양으로 바로 놓는다(ready 전에는 transition을 끈다)
  const [wide, setWide] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem('nav-wide') === '1') setWide(true);
    } catch {
      // 저장이 막혀 있으면 기억하지 못할 뿐이다
    }
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const toggleWide = () => {
    setWide((w) => {
      try {
        localStorage.setItem('nav-wide', w ? '0' : '1');
      } catch {
        // 위와 같음
      }
      return !w;
    });
  };
  const allGroups: Item[][] = [
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
          { href: '/admin/anomalies', key: 'anomalies' },
        ],
      },
      {
        href: '/admin/leave',
        key: 'leaveAdmin',
        icon: Plane,
        sub: [
          { href: '/admin/leave', key: 'leaveHistory' },
          { href: '/admin/leave?v=accrual', key: 'leaveAccrual' },
          { href: '/admin/leave/ledger', key: 'leaveLedger' },
        ],
      },
      { href: '/admin/inbox', key: 'requests', icon: Send, badge: inboxCount },
      { href: '/admin/notices', key: 'adminNotices', icon: Megaphone },
      { href: '/admin/closing', key: 'closing', icon: Lock },
      { href: '/admin/manage/report-snapshots', key: 'reports', icon: ChartColumn },
      { href: '/admin/payroll', key: 'payroll', icon: Wallet },
    ],
    [
      { href: '/admin/members', key: 'admin', icon: UserRoundCog, panel: MANAGE },
      { href: '/admin/settings', key: 'config', icon: Building2, panel: SETTINGS },
    ],
  ];

  // 지점관리자에게는 열 수 있는 화면만 보인다 (받은 연차 입력 · 관리 · 회사 설정 등은 없다)
  const mayOpen = (href: string) => managerCanOpen(href.split('?')[0]) && !href.includes('v=accrual');
  const groups: Item[][] = !branchManager
    ? allGroups
    : allGroups
        .map((items) =>
          items.flatMap((i): Item[] => {
            if (i.panel) return [];
            if (!i.sub) return mayOpen(i.href) ? [i] : [];
            const kept = i.sub.filter((x) => mayOpen(x.href));
            return kept.length ? [{ ...i, href: kept.some((x) => x.href === i.href) ? i.href : kept[0].href, sub: kept }] : [];
          }),
        )
        .filter((items) => items.length > 0);

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
  const owner = groups.flat().find((i) => (i.sub ?? i.panel?.flatMap((g) => g.items))?.some((x) => x.href === active));
  // 둘째 메뉴(흰 칸): 관리 · 회사 설정은 늘, 근무일정 · 출퇴근기록 · 휴가의 하위 메뉴는 좁은 메뉴일 때 여기에 보인다(넓은 메뉴에서는 그 자리 아래로 펼친다)
  const panel: Panel | undefined = owner?.panel ?? (owner?.sub && !wide ? [{ key: owner.key, items: owner.sub }] : undefined);
  // 닫히는 동안에도 내용이 남아 있어야 서랍처럼 닫힌다
  const [lastPanel, setLastPanel] = useState<Panel | undefined>(panel);
  if (panel && panel !== lastPanel && JSON.stringify(panel) !== JSON.stringify(lastPanel)) setLastPanel(panel);
  if (!manager) return null;
  // 전역 규칙(globals.css의 `* { transition-duration }` · 버튼/링크의 ease-out)이 층 밖에 있어 보통 클래스를 이긴다 — 메뉴 서랍은 !로 0.35초 ease-in-out을 지킨다
  const move = ready ? 'transition-all! duration-350! ease-in-out!' : '';
  const Toggle = wide ? PanelLeftClose : PanelLeftOpen;

  return (
    <>
      <nav aria-label={t('menu')} className={`sticky top-14 z-20 hidden h-[calc(100dvh-3.5rem)] shrink-0 flex-col overflow-x-hidden overflow-y-auto bg-nav py-4 text-on-primary lg:flex ${move} ${wide ? 'w-49' : 'w-19'}`}>
        {groups.map((items, gi) => (
          <div key={gi} className={`${move} ${gi > 0 ? (wide ? 'mt-8' : 'mt-4') : ''}`}>
            {items.map(({ href, key, icon: Icon, badge, sub, panel: p }) => {
              const kids = sub ?? p?.flatMap((g) => g.items);
              const open = kids ? kids.some((s) => s.href === active) : active === href;
              return (
                <div key={key} className="group/item relative">
                  <Link
                    href={href}
                    aria-label={t(key)}
                    aria-current={open && !kids ? 'page' : undefined}
                    aria-expanded={sub && wide ? open : undefined}
                    onClick={() => setPressed(href)}
                    className={`relative block w-full overflow-hidden border-l-4 text-sm font-bold ${move} ${wide ? 'h-10.5' : 'h-14'} ${open ? 'border-on-primary/60 bg-on-primary/15 text-on-primary' : 'border-transparent text-on-primary hover:bg-on-primary/10'}`}
                  >
                    <Icon aria-hidden size={18} strokeWidth={2} className={`absolute ${move} ${wide ? 'top-3 left-3.5' : 'top-2.5 left-6.5'}`} />
                    {/* 좁을 때: 아이콘 아래 짧은 이름 · 넓을 때: 아이콘 오른쪽 온전한 이름 — 한쪽이 옆으로 밀리며 사라지고 다른 쪽이 나타난다 */}
                    <span aria-hidden className={`absolute inset-x-0 bottom-1.5 text-center text-xs font-medium whitespace-nowrap ${move} ${wide ? 'translate-x-6 opacity-0' : 'opacity-100'}`}>
                      {t(`short.${key}`)}
                    </span>
                    <span aria-hidden className={`absolute top-1/2 left-11.5 -translate-y-1/2 whitespace-nowrap ${move} ${wide ? 'opacity-100' : '-translate-x-4 opacity-0'}`}>
                      {t(key)}
                    </span>
                    {!!badge && <span className={`num absolute min-w-4.5 rounded-chip bg-danger px-1 text-center text-xs leading-4.5 font-bold text-on-primary ${move} ${wide ? 'top-3 right-5' : 'top-1 right-2.5'}`}>{badge}</span>}
                    <span className="absolute top-1/2 right-1 -translate-y-1/2">
                      <Loading />
                    </span>
                  </Link>
                  {/* 넓은 메뉴에서만 아래로 펼침: 높이가 스르륵 열린다. 그 메뉴 안에 있으면 펼쳐 둔다 */}
                  {sub && (
                    <div className={`grid bg-primary-deep/35 transition-[grid-template-rows] duration-350! ${EASE} ${!wide ? 'grid-rows-[0fr]' : open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr] group-focus-within/item:grid-rows-[1fr] group-hover/item:grid-rows-[1fr]'}`}>
                      <div className="overflow-hidden">
                        <div className="py-1">
                          {sub.map((s) => {
                            const on = active === s.href;
                            return (
                              <Link key={s.href} href={s.href} tabIndex={wide ? undefined : -1} aria-current={on ? 'page' : undefined} onClick={() => setPressed(s.href)} className={`flex min-h-9 items-center pr-3 pl-15 text-sm whitespace-nowrap transition-colors duration-200 ${on ? 'font-bold text-on-primary' : 'text-on-primary/80 hover:text-on-primary'}`}>
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
        <button type="button" onClick={toggleWide} aria-pressed={wide} aria-label={t(wide ? 'narrowMenu' : 'wideMenu')} className={`relative mt-auto block w-full shrink-0 overflow-hidden border-l-4 border-transparent text-sm font-bold text-on-primary/80 hover:bg-on-primary/10 hover:text-on-primary ${move} ${wide ? 'h-10.5' : 'h-14'}`}>
          <Toggle aria-hidden size={18} strokeWidth={2} className={`absolute ${move} ${wide ? 'top-3 left-3.5' : 'top-2.5 left-6.5'}`} />
          <span aria-hidden className={`absolute inset-x-0 bottom-1.5 text-center text-xs font-medium whitespace-nowrap ${move} ${wide ? 'translate-x-6 opacity-0' : 'opacity-100'}`}>
            {t('short.wideMenu')}
          </span>
          <span aria-hidden className={`absolute top-1/2 left-11.5 -translate-y-1/2 whitespace-nowrap ${move} ${wide ? 'opacity-100' : '-translate-x-4 opacity-0'}`}>
            {t('narrowMenu')}
          </span>
        </button>
      </nav>
      {/* 둘째 메뉴도 서랍처럼: 폭이 0에서 열리고 닫힌다 */}
      <nav aria-label={t('admin')} aria-hidden={panel ? undefined : true} className={`sticky top-14 hidden h-[calc(100dvh-3.5rem)] shrink-0 overflow-hidden bg-bg lg:block ${move} ${panel ? 'w-56 border-r border-border' : 'w-0'}`}>
        <div className="h-full w-56 overflow-y-auto py-4">{lastPanel && <PanelLinks panel={panel ?? lastPanel} active={active} onPick={setPressed} t={t} />}</div>
      </nav>
    </>
  );
}
