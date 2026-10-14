// 로그인한 뒤의 화면 틀 — 직원 화면(/punch)과 관리 화면(/admin)이 같은 틀을 쓴다 (2026-10-10 의뢰인: 시프티처럼).
// 폰: 상단 바(메뉴 버튼 · 로고 · 공지 종) + 본문 + 하단 탭
// PC(1024px~): 위 띠 + 앱 띠 + 메뉴 판 + 본문 — 직원 · 관리자가 같은 틀, 공간은 셋(내 화면 / 관리자 화면 / 통합설정). 2026-10-14 결정 사항 개발-20 · 21 · 25, 메뉴는 config/nav.ts
import { Bell } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { CONSENT } from '@/config/consent';
import { languageOptions } from '@/i18n/locales';
import type { Me } from '@/lib/auth';
import { hasConsent } from '@/lib/consent';
import { visibleNoticesNow } from '@/lib/notices';
import { pendingCounts } from '@/lib/period-data';
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
  const t = await getTranslations('home');
  const ts = await getTranslations('side');
  const tf = await getTranslations('frame');
  const role = me.role === 'admin' ? 'admin' : branchManager ? 'manager' : 'employee';
  const [consented, inboxCount, notices] = await Promise.all([
    hasConsent(me.id), // 관리자도 직원이다 — 같은 동의 창
    isAdmin ? pendingCounts().then((c) => c.total) : 0,
    visibleNoticesNow(me.id, await getLocale()),
  ]);
  const unread = notices.filter((n) => !n.confirmed).length;
  const languages = languageOptions();
  return (
    <>
      {/* PC 위 띠: 로고 · 메뉴 검색 · 공간 전환(내 화면 / 관리자 화면) · 알림 · 통합설정 · 내 메뉴 */}
      <header className="sticky top-0 z-20 hidden h-14 items-center gap-4 border-b border-border bg-bg px-5 lg:flex">
        <div className="flex w-66 shrink-0 items-center">
          <Logo height={28} priority />
        </div>
        <MenuSearch role={role} />
        <div className="ml-auto flex items-center gap-1.5">
          <SpaceSwitch role={role} />
          <Link href="/punch/notices" aria-label={t('notices', { n: unread })} title={tf('bell')} className="relative ml-1.5 flex size-9 shrink-0 items-center justify-center rounded-button text-muted hover:bg-surface">
            <Bell aria-hidden size={20} strokeWidth={1.75} />
            {unread > 0 && <span className="num absolute -top-0.5 -right-0.5 flex min-w-4.5 items-center justify-center rounded-chip bg-danger px-1 text-xs leading-4.5 font-bold text-on-primary">{unread}</span>}
          </Link>
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
        <div className="min-w-0 flex-1 pb-[calc(4rem+env(safe-area-inset-bottom))] lg:min-h-[calc(100dvh-3.5rem)] lg:bg-bg lg:pb-0">
          <FrameHeader>
            <TopBar
              className="lg:hidden"
              left={<MenuDrawer name={me.name} role={role} languages={languages} />}
              right={
                <Link href="/punch/notices" aria-label={t('notices', { n: unread })} className="relative -mr-2 flex size-11 shrink-0 items-center justify-center rounded-button text-text">
                  <Bell aria-hidden size={22} strokeWidth={1.75} />
                  {unread > 0 && <span className="num absolute top-0.5 right-0.5 flex min-w-5 items-center justify-center rounded-chip bg-primary px-1 text-xs leading-5 font-semibold text-on-primary">{unread}</span>}
                </Link>
              }
            />
          </FrameHeader>
          <ConsoleGuide role={role} />
          <Crumb role={role} />
          {children}
        </div>
      </div>
      <BottomTabs isAdmin={isAdmin} inboxCount={inboxCount} />
      {consented ? overlay : <ConsentGate version={CONSENT.version} languages={languages} />}
    </>
  );
}
