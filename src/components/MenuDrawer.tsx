'use client';
// 폰 왼쪽 위 메뉴 버튼 + 왼쪽에서 열리는 메뉴 (2026-10-10 의뢰인: 시프티처럼 메뉴는 왼쪽 위 버튼 하나로).
// 하단 탭(홈·요청·근무일정·출퇴근기록·휴가)에 없는 화면을 모은다 — 이름 · 묶음은 PC 틀과 같은 표(config/nav.ts)에서 읽는다:
//   내 화면(탭에 없는 것) → 관리자 화면의 앱마다 한 묶음 → 통합설정(전체 메뉴 한 장으로 들어간다).
// 상단 바에 늘어서 있던 언어·홈 화면에 추가·로그아웃도 여기에 있다.
// 움직임 없이 나타났다 사라진다 (R-10-8). Esc·바깥 누르기·화면 이동으로 닫힌다.
// 메뉴는 body에 직접 붙인다 — 상단 바 안에 두면 상단 바의 겹침 순서에 갇혀 하단 탭이 메뉴 아래쪽(로그아웃)을 가린다.
import { LayoutDashboard, Menu, Settings, UserRound, X, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { appLeaves, appsFor, CONSOLE_HOME, locate, MY_APPS, type NavRole } from '@/config/nav';
import { AddToHomeButton } from './AddToHome';
import { LanguageSwitcher } from './LanguageSwitcher';
import { OPEN_MENU_EVENT } from './MenuButton';
import { SignOutButton } from './SignOutButton';

type Item = { href: string; label: string };
type Group = { key: string; title: string; icon: LucideIcon; items: Item[] };

// 하단 탭이 이미 맡은 내 화면
const IN_TABS = ['/punch', '/punch/schedule', '/punch/records', '/punch/leave', '/punch/requests'];

export function MenuDrawer({ name, role, languages }: { name: string; role: NavRole; languages: { code: string; name: string }[] }) {
  const t = useTranslations('side');
  const tf = useTranslations('frame');
  const path = usePathname();
  const query = useSearchParams();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  // 목록 위 줄의 ☰(MenuButton)가 보내는 신호
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_MENU_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_MENU_EVENT, onOpen);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden'; // 메뉴 뒤의 화면이 같이 밀리지 않게
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  const adminApps = appsFor('admin', role);
  const single = adminApps.filter((a) => appLeaves(a).length === 1);
  const groups: Group[] = [
    { key: 'my', title: tf('space.my'), icon: UserRound, items: MY_APPS.flatMap(appLeaves).filter((l) => !IN_TABS.includes(l.href)).map((l) => ({ href: l.href, label: tf(`item.${l.key}`) })) },
    // 관리자 화면: 항목이 하나뿐인 앱(홈 · 요청함)은 한 묶음으로 모으고, 나머지는 앱마다 한 묶음. 지점관리자에게는 열 수 있는 화면만
    ...(single.length ? [{ key: 'admin', title: tf('space.admin'), icon: LayoutDashboard, items: single.flatMap(appLeaves).map((l) => ({ href: l.href, label: tf(`item.${l.key}`) })) }] : []),
    ...adminApps.filter((a) => appLeaves(a).length > 1).map((a) => ({ key: a.key, title: tf(`appFull.${a.key}`), icon: a.icon, items: appLeaves(a).map((l) => ({ href: l.href, label: tf(`item.${l.key}`) })) })),
    ...(role === 'admin' ? [{ key: 'console', title: tf('space.console'), icon: Settings, items: [{ href: CONSOLE_HOME, label: tf('console.all') }] }] : []),
  ];
  const at = locate(path, query, role);
  const here = at.leaf?.href ?? (at.space === 'console' ? CONSOLE_HOME : undefined);

  return (
    <>
      <button type="button" data-menu-open aria-label={t('menu')} aria-expanded={open} onClick={() => setOpen(true)} className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-button text-text">
        <Menu aria-hidden size={24} strokeWidth={1.75} />
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <nav role="dialog" aria-modal="true" aria-label={t('menu')} className="flex h-dvh w-5/6 max-w-xs flex-col bg-bg pt-[env(safe-area-inset-top)]">
            <div className="flex items-start justify-between gap-2 bg-surface px-5 pt-4 pb-4">
              <p className="min-w-0">
                <span className="block truncate text-xl font-extrabold tracking-tight">{name}</span>
                <span className="text-sm text-muted">{t(role === 'manager' ? 'roleManager' : role === 'admin' ? 'roleAdmin' : 'roleEmployee')}</span>
              </p>
              <button type="button" aria-label={t('close')} onClick={() => setOpen(false)} className="-mt-1 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-button text-primary">
                <X aria-hidden size={24} strokeWidth={1.75} />
              </button>
            </div>
            <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-2 py-3">
              {groups.map(({ key, title, icon: Icon, items }) => (
                <div key={key} className="flex flex-col border-t border-border pt-3 first:border-t-0 first:pt-0">
                  <p className="flex items-center gap-2 px-2 pb-1 text-sm font-extrabold tracking-tight text-text">
                    <Icon aria-hidden size={18} strokeWidth={2} className="shrink-0 text-primary" />
                    {title}
                  </p>
                  {items.map(({ href, label }) => {
                    const on = here === href;
                    return (
                      <Link
                        key={href}
                        href={href}
                        aria-current={on ? 'page' : undefined}
                        onClick={() => setOpen(false)}
                        className={`ml-3 flex min-h-11 items-center rounded-button border-l-4 px-3 ${on ? 'border-primary bg-primary-tint font-bold text-primary' : 'border-transparent text-text active:bg-primary-tint active:text-primary'}`}
                      >
                        {label}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-2 border-t border-border p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              <div className="flex justify-center">
                <LanguageSwitcher options={languages} />
              </div>
              <AddToHomeButton />
              <SignOutButton />
            </div>
          </nav>
          <button type="button" tabIndex={-1} aria-label={t('close')} onClick={() => setOpen(false)} className="flex-1 bg-text opacity-40" />
        </div>,
        document.body,
      )}
    </>
  );
}
