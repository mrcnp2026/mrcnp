'use client';
// 폰 왼쪽 위 메뉴 버튼 + 왼쪽에서 열리는 메뉴 (2026-10-10 의뢰인: 시프티처럼 메뉴는 왼쪽 위 버튼 하나로).
// 하단 탭(홈·요청·출퇴근기록·휴가)에 없는 화면을 모은다 — 이름·묶음은 PC 왼쪽 메뉴(SideNav)와 같다.
// 상단 바에 늘어서 있던 언어·홈 화면에 추가·로그아웃도 여기로 옮겼다.
// 움직임 없이 나타났다 사라진다 (R-10-8). Esc·바깥 누르기·화면 이동으로 닫힌다.
// 메뉴는 body에 직접 붙인다 — 상단 바 안에 두면 상단 바의 겹침 순서에 갇혀 하단 탭이 메뉴 아래쪽(로그아웃)을 가린다.
import { BriefcaseBusiness, ClipboardX, CalendarClock, LayoutDashboard, MapPin, Megaphone, Menu, Network, Settings, UserRound, Users, Wallet, X, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AddToHomeButton } from './AddToHome';
import { LanguageSwitcher } from './LanguageSwitcher';
import { OPEN_MENU_EVENT } from './MenuButton';
import { SignOutButton } from './SignOutButton';

type Item = { href: string; key: string; icon: LucideIcon };
type Group = { key: string; items: Item[] };

const MY: Group = {
  key: 'my',
  items: [
    { href: '/punch/account', key: 'account', icon: UserRound },
    { href: '/punch/notices', key: 'notices', icon: Megaphone },
  ],
};
const ADMIN: Group[] = [
  { key: 'manage', items: [{ href: '/admin', key: 'board', icon: LayoutDashboard }, { href: '/admin/missing', key: 'missing', icon: ClipboardX }] },
  {
    key: 'people',
    items: [
      { href: '/admin/members', key: 'members', icon: Users },
      { href: '/admin/branches', key: 'branches', icon: Network },
      { href: '/admin/places', key: 'places', icon: MapPin },
      { href: '/admin/jobs', key: 'jobs', icon: BriefcaseBusiness },
      { href: '/admin/shifts', key: 'shifts', icon: CalendarClock },
    ],
  },
  {
    key: 'office',
    items: [
      { href: '/admin/payroll', key: 'payroll', icon: Wallet },
      { href: '/admin/notices', key: 'adminNotices', icon: Megaphone },
    ],
  },
  { key: 'settings', items: [{ href: '/admin/settings', key: 'config', icon: Settings }] },
];

export function MenuDrawer({ name, isAdmin, languages }: { name: string; isAdmin: boolean; languages: { code: string; name: string }[] }) {
  const t = useTranslations('side');
  const path = usePathname();
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

  const groups = isAdmin ? [MY, ...ADMIN] : [MY];
  // 지금 화면 = 주소가 가장 길게 맞는 메뉴 하나 (/admin/members/groups는 「직원 목록」이 아니라 「조직도」)
  const here = groups
    .flatMap((g) => g.items)
    .filter((i) => path === i.href || path.startsWith(`${i.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

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
                <span className="text-sm text-muted">{t(isAdmin ? 'roleAdmin' : 'roleEmployee')}</span>
              </p>
              <button type="button" aria-label={t('close')} onClick={() => setOpen(false)} className="-mt-1 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-button text-primary">
                <X aria-hidden size={24} strokeWidth={1.75} />
              </button>
            </div>
            <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-2 py-3">
              {groups.map((g) => (
                <div key={g.key} className="flex flex-col border-t border-border pt-3 first:border-t-0 first:pt-0">
                  <p className="flex items-center gap-2 px-2 pb-1 text-sm font-extrabold tracking-tight text-text">
                    <span aria-hidden className="h-4 w-1 shrink-0 rounded-chip bg-primary" />
                    {t(g.key)}
                  </p>
                  {g.items.map(({ href, key, icon: Icon }) => {
                    const on = here === href;
                    return (
                      <Link
                        key={href}
                        href={href}
                        aria-current={on ? 'page' : undefined}
                        onClick={() => setOpen(false)}
                        className={`ml-3 flex min-h-12 items-center gap-4 rounded-button border-l-4 px-3 ${on ? 'border-primary bg-primary-tint font-bold text-primary' : 'border-transparent text-text active:bg-primary-tint active:text-primary'}`}
                      >
                        <Icon aria-hidden size={22} strokeWidth={on ? 2.25 : 1.75} className={`shrink-0 ${on ? '' : 'text-muted'}`} />
                        {t(key)}
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
