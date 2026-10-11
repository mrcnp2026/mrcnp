// 로그인한 뒤의 화면 틀 — 직원 화면(/punch)과 관리 화면(/admin)이 같은 틀을 쓴다 (2026-10-10 의뢰인: 시프티처럼).
// 폰: 상단 바(메뉴 버튼 · 로고 · 공지 종) + 본문 + 하단 탭
// PC(1024px~): 흰 상단 줄(로고 · 공지 · 언어 · 로그아웃) + 짙은 남색 왼쪽 메뉴 + 넓은 본문 — 시프티 PC 구성 (2026-10-11, `pc용/시프티 PC 화면 기록.md`).
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
import { FrameHeader } from './FrameHeader';
import { LanguageSwitcher } from './LanguageSwitcher';
import { Logo } from './Logo';
import { MenuDrawer } from './MenuDrawer';
import { ModeSwitch } from './ModeSwitch';
import { SideNav } from './SideNav';
import { SignOutButton } from './SignOutButton';
import { TopBar } from './TopBar';

/** overlay: 동의를 마친 사람에게만 띄우는 것(공지 팝업) — 동의 창이 먼저다 (2026-10-05) */
export async function AppFrame({ me, children, overlay }: { me: Me; children: ReactNode; overlay?: ReactNode }) {
  const isAdmin = me.role === 'admin';
  const t = await getTranslations('home');
  const ts = await getTranslations('side');
  const [consented, inboxCount, notices] = await Promise.all([
    hasConsent(me.id), // 관리자도 직원이다 — 같은 동의 창
    isAdmin ? pendingCounts().then((c) => c.total) : 0,
    visibleNoticesNow(me.id, await getLocale()),
  ]);
  const unread = notices.filter((n) => !n.confirmed).length;
  const languages = languageOptions();
  return (
    <>
      {/* PC 상단 줄: 화면 전체 폭, 왼쪽 메뉴 위에 놓인다 */}
      <header className="sticky top-0 z-20 hidden h-14 items-center gap-3 border-b border-border bg-bg px-5 shadow-card lg:flex">
        <Logo height={30} priority />
        <div className="ml-auto flex items-center gap-2">
          <Link href="/punch/notices" aria-label={t('notices', { n: unread })} className="relative flex size-9 shrink-0 items-center justify-center rounded-button text-muted hover:bg-surface">
            <Bell aria-hidden size={20} strokeWidth={1.75} />
            {unread > 0 && <span className="num absolute -top-0.5 -right-0.5 flex min-w-4.5 items-center justify-center rounded-chip bg-danger px-1 text-xs leading-4.5 font-bold text-on-primary">{unread}</span>}
          </Link>
          <LanguageSwitcher options={languages} />
          {isAdmin && <ModeSwitch toEmployee={ts('toEmployee')} toManager={ts('toManager')} />}
          <div className="w-auto">
            <SignOutButton />
          </div>
        </div>
      </header>
      <div className="lg:flex">
        <SideNav isAdmin={isAdmin} inboxCount={inboxCount} />
        {/* 폰에서는 하단 탭 바 높이 + 아이폰 하단 여백만큼 비운다 */}
        <div className="min-w-0 flex-1 pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0">
          <FrameHeader>
            <TopBar
              className="lg:hidden"
              left={<MenuDrawer name={me.name} isAdmin={isAdmin} languages={languages} />}
              right={
                <Link href="/punch/notices" aria-label={t('notices', { n: unread })} className="relative -mr-2 flex size-11 shrink-0 items-center justify-center rounded-button text-text">
                  <Bell aria-hidden size={22} strokeWidth={1.75} />
                  {unread > 0 && <span className="num absolute top-0.5 right-0.5 flex min-w-5 items-center justify-center rounded-chip bg-primary px-1 text-xs leading-5 font-semibold text-on-primary">{unread}</span>}
                </Link>
              }
            />
          </FrameHeader>
          {children}
        </div>
      </div>
      <BottomTabs isAdmin={isAdmin} inboxCount={inboxCount} />
      {consented ? overlay : <ConsentGate version={CONSENT.version} languages={languages} />}
    </>
  );
}
