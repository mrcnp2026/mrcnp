'use client';
// 폰(< 1024px) 하단 탭 — 모드마다 다른 5칸 (2026-10-15 의뢰인: 「모바일에서 쓰기 너무 힘들다」 — `모바일 사용성 분석 (2026-10-15).md` B).
//   직원 모드:   홈 · 출퇴근 · 휴가 · 요청 · 내 급여
//   관리자 모드: 현황 · 요청(배지) · 근태 · 휴가 · 전체(관리자 앱 + 통합설정을 아이콘 격자 한 장으로 — 다우오피스 · 시프티 폰 앱 방식)
// 어느 모드인지는 지금 주소로 정한다(config/nav.ts의 locate — PC 틀과 같은 표). 근무일정 · 공지 · 조직도 등은 왼쪽 위 메뉴(MenuDrawer).
// 예전(2026-10-10~10-14)에는 직원 · 관리자가 같은 5칸을 썼고, 관리자 모드에서 「홈」이 직원 홈으로 가던 문제가 있었다.
import { BellRing, Building2, CalendarDays, ChartPie, Clock, House, LayoutGrid, type LucideIcon, Network, Plane, Settings, Wallet, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { appHref, appsFor, CONSOLE_HOME, locate, type NavRole } from '@/config/nav';
import { useAlerts } from './Alerts';
import { NavTab, usePressedTab } from './NavTab';

type Tab = { key: string; icon: LucideIcon; href: string; apps: string[]; also?: string[] };
const MY_TABS: Tab[] = [
  { key: 'home', icon: House, href: '/punch', apps: ['home'] },
  { key: 'punch', icon: Clock, href: '/punch/records', apps: ['records'] },
  { key: 'leave', icon: CalendarDays, href: '/punch/leave', apps: ['leave'] },
  { key: 'requests', icon: BellRing, href: '/punch/requests', apps: ['requests'], also: ['/punch/corrections'] }, // 정정 요청 양식도 요청 탭 아래다
  { key: 'myPay', icon: Wallet, href: '/punch/payslips', apps: ['pay'] },
];
const ADMIN_TABS: Tab[] = [
  { key: 'status', icon: ChartPie, href: '/admin', apps: ['mHome'] },
  { key: 'requests', icon: BellRing, href: '/admin/inbox', apps: ['mRequests'] },
  { key: 'work', icon: Clock, href: '/admin/records/list', apps: ['mAttendance'] }, // 근태 = 날짜별 기록 목록부터 (일정 · 마감은 그 앱 안 메뉴)
  { key: 'leave', icon: CalendarDays, href: '/admin/leave', apps: ['mLeave'] },
];

// 통합설정 안: 자주 쓰는 기준 넷 + 전체(통합설정 앱 격자) — 관리자 모드로는 위 띠의 [관리자 모드]나 전체 격자의 맨 끝으로 (2026-10-18 의뢰인)
const CONSOLE_TABS: Tab[] = [
  { key: 'cBasic', icon: Building2, href: '/admin/settings', apps: ['cBasic'] },
  { key: 'cOrg', icon: Network, href: '/admin/branches', apps: ['cOrg'] },
  { key: 'cWork', icon: Clock, href: '/admin/places', apps: ['aAttendance'] },
  { key: 'cLeave', icon: Plane, href: '/admin/leave/types', apps: ['aLeave'] },
];

export function BottomTabs({ role }: { role: NavRole; inboxCount?: number }) {
  const counts = useAlerts(); // 화면을 옮길 때마다 다시 센 숫자
  const t = useTranslations('nav');
  const tf = useTranslations('frame');
  const query = useSearchParams();
  const { path, pressed, setPressed } = usePressedTab();
  const [grid, setGrid] = useState(false);
  useEffect(() => setGrid(false), [path]);
  useEffect(() => {
    if (!grid) return;
    document.body.dataset.allApps = '1'; // 전체 격자 위로 + 버튼이 겹치지 않게 (globals.css)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setGrid(false);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      delete document.body.dataset.allApps;
    };
  }, [grid]);

  const at = locate(path, query, role);
  // 표에 없는 화면(검색 등)은 주소 앞부분으로 모드를 정한다
  const adminMode = role !== 'employee' && (at.leaf ? at.space !== 'my' : path === '/admin' || path.startsWith('/admin/'));
  const consoleMode = role === 'admin' && at.space === 'console';
  const allApps = consoleMode ? appsFor('console', role) : adminMode ? appsFor('admin', role) : [];
  // 지점관리자는 열 수 있는 앱의 탭만 (현황 · 관리 화면은 관리자 전용 — manager-rules.ts)
  const tabs = consoleMode ? CONSOLE_TABS : adminMode ? ADMIN_TABS.filter((x) => allApps.some((a) => x.apps.includes(a.key))) : MY_TABS;
  const appKey = at.leaf ? at.app?.key : undefined;
  const under = (h: string) => path === h || path.startsWith(`${h}/`);
  const activeKey = (tabs.find((x) => x.also?.some(under)) ?? tabs.find((x) => !!appKey && x.apps.includes(appKey)))?.key;
  const inTabs = !!activeKey;
  const allOn = adminMode && (grid || (!pressed && !inTabs && !!at.leaf));

  return (
    <>
      <nav className="glass-dark fixed inset-x-0 bottom-0 z-20 pb-[env(safe-area-inset-bottom)] lg:hidden" data-tabs={consoleMode ? 'console' : adminMode ? 'admin' : 'my'}>
        <ul className="mx-auto flex max-w-md">
          {tabs.map(({ key, icon, href }) => {
            const here = key === activeKey;
            return (
              <li key={key} className="flex-1">
                <NavTab
                  dark
                  href={href}
                  label={t(`tab.${key}`)}
                  icon={icon}
                  active={!grid && (pressed ? pressed === href : here)}
                  onPress={() => setPressed(href)}
                  badge={(() => {
                    // 요청 탭: 관리자 모드 = 처리할 요청 · 직원 모드 = 처리된 내 요청 (2026-10-19 의뢰인)
                    const n = key === 'requests' ? (adminMode ? counts.requests : counts.decided) : 0;
                    return n > 0 ? <span className="num absolute -top-2 -right-3 min-w-5 rounded-chip bg-danger px-1 text-center text-xs leading-5 font-bold text-on-primary">{n}</span> : null;
                  })()}
                />
              </li>
            );
          })}
          {adminMode && (
            <li className="flex-1">
              <button
                type="button"
                aria-expanded={grid}
                onClick={() => setGrid((g) => !g)}
                className={`relative flex min-h-16 w-full flex-col items-center justify-center gap-1 text-xs text-on-primary ${allOn ? 'font-bold' : 'opacity-60'}`}
              >
                <LayoutGrid aria-hidden size={22} strokeWidth={allOn ? 2.25 : 1.75} />
                <span>{t('tab.all')}</span>
              </button>
            </li>
          )}
        </ul>
      </nav>
      {grid &&
        createPortal(
          <div className="fixed inset-0 z-10 flex flex-col justify-end lg:hidden">
            <button type="button" tabIndex={-1} aria-label={t('tab.close')} onClick={() => setGrid(false)} className="fade-from flex-1 bg-text opacity-40" />
            <div role="dialog" aria-modal="true" aria-label={t('tab.allTitle')} className="sheet-up relative rounded-t-card bg-surface px-4 pt-4 pb-[calc(5rem+env(safe-area-inset-bottom))]" data-all-apps>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-base font-bold">{t('tab.allTitle')}</p>
                <button type="button" aria-label={t('tab.close')} onClick={() => setGrid(false)} className="-mr-2 flex size-11 items-center justify-center rounded-button text-muted">
                  <X aria-hidden size={22} strokeWidth={1.75} />
                </button>
              </div>
              <ul className="grid grid-cols-4 gap-y-3">
                {allApps.map((a) => {
                  const Icon = a.icon;
                  const on = a.key === appKey;
                  return (
                    <li key={a.key}>
                      <Link href={appHref(a)} onClick={() => setGrid(false)} aria-current={on ? 'page' : undefined} className="flex flex-col items-center gap-1.5 rounded-button px-1 py-2 text-center text-xs active:bg-primary-tint">
                        <span className={`flex size-12 items-center justify-center rounded-card ${on ? 'bg-primary text-on-primary' : 'bg-primary-tint text-primary'}`}>
                          <Icon aria-hidden size={22} strokeWidth={2} />
                        </span>
                        <span className={on ? 'font-bold' : ''}>{tf(consoleMode ? `app.${a.key}` : `appFull.${a.key}`)}</span>
                      </Link>
                    </li>
                  );
                })}
                {role === 'admin' && (
                  <li>
                    {/* 통합설정 안에서는 맨 끝이 「관리자 모드」로 돌아가는 길 */}
                    <Link href={consoleMode ? '/admin' : CONSOLE_HOME} onClick={() => setGrid(false)} className="flex flex-col items-center gap-1.5 rounded-button px-1 py-2 text-center text-xs active:bg-primary-tint">
                      <span className="flex size-12 items-center justify-center rounded-card bg-bg text-muted">
                        {consoleMode ? <ChartPie aria-hidden size={22} strokeWidth={2} /> : <Settings aria-hidden size={22} strokeWidth={2} />}
                      </span>
                      <span>{tf(consoleMode ? 'space.admin' : 'space.console')}</span>
                    </Link>
                  </li>
                )}
              </ul>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
