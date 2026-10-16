// 로그인한 뒤의 화면 틀 — 직원 화면(/punch)과 관리 화면(/admin)이 같은 틀을 쓴다 (2026-10-10 의뢰인: 시프티처럼).
// 폰: 상단 바(메뉴 버튼 · 로고 · 공지 종) + 본문 + 하단 탭
// PC(1024px~): 위 띠 + 앱 띠 + 메뉴 판 + 본문 — 직원 · 관리자가 같은 틀, 공간은 셋(내 화면 / 관리자 화면 / 통합설정). 2026-10-14 결정 사항 개발-20 · 21 · 25, 메뉴는 config/nav.ts
import { PageEnter } from './PageEnter';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { CONSENT } from '@/config/consent';
import { languageOptions } from '@/i18n/locales';
import type { Me } from '@/lib/auth';
import { hasConsent } from '@/lib/consent';
import { visibleNoticesNow } from '@/lib/notices';
import { pendingCounts } from '@/lib/period-data';
import { unreadCount } from '@/lib/work-messages';
import { AlertBell, AlertsProvider } from './Alerts';
import { PhoneSearchLink } from './DeskTop';
import { BottomTabs } from './BottomTabs';
import { ConsentGate } from './ConsentGate';
import { DeskNav } from './DeskNav';
import { AccountMenu, ConsoleGuide, ConsoleLink, Crumb, MenuSearch, SpaceSwitch } from './DeskTop';
import { FrameHeader } from './FrameHeader';
import { LanguageSwitcher } from './LanguageSwitcher';
import { Logo } from './Logo';
import { MenuDrawer } from './MenuDrawer';
import { SignOutButton } from './SignOutButton';
import { TopBar } from './TopBar';

/** overlay: 동의를 마친 사람에게만 띄우는 것(공지 팝업) — 동의 창이 먼저다 (2026-10-05) */
export async function AppFrame({ me, children, overlay }: { me: Me; children: ReactNode; overlay?: ReactNode }) {
  const branchManager = me.role === 'manager'; // 지점관리자: 관리 화면 틀은 같고 메뉴만 허용한 것으로 줄인다 (manager-rules.ts)
  const isAdmin = me.role === 'admin' || branchManager;
  const ts = await getTranslations('side');
  const role = me.role === 'admin' ? 'admin' : branchManager ? 'manager' : 'employee';
  const [consented, inboxCount, notices, unreadMsg] = await Promise.all([
    hasConsent(me.id), // 관리자도 직원이다 — 같은 동의 창
    isAdmin ? pendingCounts().then((c) => c.total) : 0,
    visibleNoticesNow(me.id, await getLocale()),
    unreadCount(me.id),
  ]);
  const unread = notices.filter((n) => !n.confirmed).length;
  const languages = languageOptions();
  return (
    <AlertsProvider initial={{ notices: unread, messages: unreadMsg, requests: inboxCount }}>
      {/* PC 위 띠: 로고 · 메뉴 검색 · 공간 전환(내 화면 / 관리자 화면) · 알림 · 통합설정 · 내 메뉴 */}
      <header className="sticky top-0 z-20 hidden h-14 items-center gap-4 border-b border-border bg-bg px-5 lg:flex">
        <div className="flex w-66 shrink-0 items-center">
          <Logo height={28} priority />
        </div>
        {/* 검색창은 가운데 (2026-10-16 의뢰인: 직원 모드에서 오른쪽 버튼이 적어 왼쪽으로 쏠려 보였다) */}
        <div className="flex min-w-0 flex-1 justify-center">
          <MenuSearch role={role} />
        </div>
        <div className="flex shrink-0 items-center justify-end gap-1.5 lg:min-w-66">
          <SpaceSwitch role={role} />
          <span className="ml-1.5">
            <AlertBell approver={isAdmin} />
          </span>
          <ConsoleLink role={role} />
          <AccountMenu name={me.name} roleLabel={ts(branchManager ? 'roleManager' : isAdmin ? 'roleAdmin' : 'roleEmployee')}>
            <LanguageSwitcher options={languages} />
            <SignOutButton />
          </AccountMenu>
        </div>
      </header>
      <div className="lg:flex">
        <DeskNav role={role} inboxCount={inboxCount} />
        {/* 폰에서는 하단 탭 바 높이 + 아이폰 하단 여백만큼 비운다 */}
        <div data-page-root className="min-w-0 flex-1 pb-[calc(4rem+env(safe-area-inset-bottom))] lg:min-h-[calc(100dvh-3.5rem)] lg:bg-bg lg:pb-0">
          <FrameHeader>
            <TopBar
              className="lg:hidden"
              left={<MenuDrawer name={me.name} role={role} languages={languages} />}
              right={
                <>
                  <PhoneSearchLink />
                  <AlertBell approver={isAdmin} size="phone" />
                </>
              }
            />
          </FrameHeader>
          <ConsoleGuide role={role} />
          <Crumb role={role} />
          <PageEnter />
          {children}
        </div>
      </div>
      <BottomTabs role={role} />
      {consented ? overlay : <ConsentGate version={CONSENT.version} languages={languages} />}
    </AlertsProvider>
  );
}
