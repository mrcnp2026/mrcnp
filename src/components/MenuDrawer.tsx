'use client';
// 폰 왼쪽 위 메뉴 버튼 + 왼쪽에서 열리는 메뉴 (2026-10-10 의뢰인: 시프티처럼 메뉴는 왼쪽 위 버튼 하나로).
// 2026-10-15 다시 짬 (의뢰인: 「메뉴가 너무 많아 한참 내려야 한다」 — `모바일 사용성 분석 (2026-10-15).md`):
//   ① 맨 위 [직원 모드 | 관리자 모드] — 지금 모드의 메뉴만 보인다(둘이 섞여 같은 이름이 두 번 나오던 것을 없앰)
//   ② 앱마다 한 줄, 누르면 펼친다 — 지금 있는 앱만 펼쳐 둔다. 항목이 하나뿐인 앱은 바로 그 화면으로
//   ③ 맨 위 「메뉴 찾기」 — 쳐 넣으면 그 모드의 항목을 한 목록으로
//   ④ 언어 · 로그아웃은 맨 아래 한 줄로 작게, 홈 화면에 추가는 아직 안 했을 때만 작은 단추로
//   ⑤ 관리자 · 지점관리자는 그 위에 「폰 알림」 켜기 · 끄기 한 줄 (2026-10-16, components/PushToggle)
// 이름 · 묶음은 PC 틀과 같은 표(config/nav.ts)에서 읽는다. 통합설정은 관리자 모드 맨 아래 한 줄(전체 메뉴 한 장으로 들어간다).
// 왼쪽에서 밀려 나오고 닫을 때 밀려 들어간다(2026-10-17 의뢰인, R-10-8을 바꿈). Esc · 바깥 누르기 · 화면 이동으로 닫힌다. body에 직접 붙인다(하단 탭이 가리지 않게).
import { useSystemNav } from '@/components/SystemNav';
import { Activity, ChevronDown, Menu, Search, Settings, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { appLeaves, appsFor, CONSOLE_HOME, locate, type App, type NavRole } from '@/config/nav';
import { AddToHomeButton } from './AddToHome';
import { badgeCount, useAlerts } from './Alerts';
import { LanguageSwitcher } from './LanguageSwitcher';
import { OPEN_MENU_EVENT } from './MenuButton';
import { PushToggle } from './PushToggle';
import { SignOutButton } from './SignOutButton';

// 맨 위는 [직원 모드 | 관리자 모드] 둘만 (2026-10-19 의뢰인). 통합설정은 관리자 모드 맨 아래 톱니바퀴 한 줄 —
// 누르면 숫자 잠금을 거쳐 통합설정 전체 메뉴로 들어간다. 통합설정 안에서는 서랍에 통합설정 메뉴만 보이고 위 두 버튼 모두 파란불이 꺼진다.
// 거기서 「관리자 모드」를 누르면 오늘 현황부터 관리자 메뉴로 돌아가고 통합설정은 다시 톱니바퀴 한 줄만 남는다.
type View = 'my' | 'admin' | 'console';

export function MenuDrawer({ name, role, languages, ops = false }: { name: string; role: NavRole; languages: { code: string; name: string }[]; ops?: boolean }) {
  const counts = useAlerts(); // 메뉴 옆 숫자 — PC 왼쪽 띠와 같은 숫자 (2026-10-19 의뢰인)
  const pill = (n: number) => (n > 0 ? <span className="num ml-auto min-w-5 shrink-0 rounded-chip bg-danger px-1.5 text-center text-xs leading-5 font-bold text-on-primary">{n}</span> : null);
  const t = useTranslations('side');
  const tf = useTranslations('frame');
  const path = usePathname();
  const query = useSearchParams();
  const at = locate(path, query, role);
  const here = at.leaf?.href ?? (at.space === 'console' ? CONSOLE_HOME : undefined);
  const staff = role !== 'employee';
  const nowView: View = role === 'admin' && at.space === 'console' ? 'console' : staff && at.space !== 'my' ? 'admin' : 'my';
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  // 닫기: 왼쪽으로 밀려 들어간 뒤에 없앤다 (2026-10-17 의뢰인: 오른쪽 빈 곳을 눌러 닫을 때 갑자기 사라졌다)
  const close = () => {
    if (closing) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return setOpen(false);
    setClosing(true);
    setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 210);
  };
  const [view, setView] = useState<View>(nowView);
  const [q, setQ] = useState('');
  const [unfold, setUnfold] = useState<Set<string>>(new Set());
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden'; // 메뉴 뒤의 화면이 같이 밀리지 않게
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);
  // 열 때마다: 지금 모드 · 지금 앱만 펼친 채로, 찾기 칸은 비운다
  const openDrawer = () => {
    setView(nowView);
    setQ('');
    setUnfold(new Set(at.app ? [at.app.key] : []));
    setOpen(true);
  };
  const closeRef = useRef(close);
  const opener = useRef(openDrawer);
  useEffect(() => {
    opener.current = openDrawer;
    closeRef.current = close;
  });
  // 목록 위 줄의 ☰(MenuButton)가 보내는 신호
  useEffect(() => {
    const onOpen = () => opener.current();
    window.addEventListener(OPEN_MENU_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_MENU_EVENT, onOpen);
  }, []);

  const system = useSystemNav();
  const apps: App[] = appsFor(view, role, system);
  // 통합설정 앱 이름은 app.* 에만 있다 (appFull.* 로 찾으면 「frame.appFull.cBasic」 같은 영어 열쇠가 그대로 나왔다)
  const appName = (a: App) => tf(view === 'console' ? `app.${a.key}` : `appFull.${a.key}`);
  const word = q.trim().toLowerCase();
  const found = word
    ? apps.flatMap((a) => a.groups.flatMap((g) => g.items.filter((l) => !l.pcOnly).map((l) => ({ href: l.href, label: tf(`item.${l.key}`), where: g.key ? `${appName(a)} › ${tf(`group.${g.key}`)}` : appName(a) })))).filter((x) => `${x.label} ${x.where}`.toLowerCase().includes(word))
    : [];
  // 한 번에 하나만 펼친다 — 다른 메뉴를 펼치면 앞의 것은 저절로 접힌다 (2026-10-19 의뢰인)
  const toggle = (k: string) => setUnfold((s) => (s.has(k) ? new Set() : new Set([k])));
  const row = (on: boolean) => `flex min-h-11 items-center rounded-button px-3 ${on ? 'bg-primary-tint font-bold text-primary' : 'text-text active:bg-primary-tint active:text-primary'}`;

  return (
    <>
      <button type="button" data-menu-open aria-label={t('menu')} aria-expanded={open} onClick={openDrawer} className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-button text-text">
        <Menu aria-hidden size={24} strokeWidth={1.75} />
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-40 flex lg:hidden">
            <nav role="dialog" aria-modal="true" aria-label={t('menu')} className={`${closing ? 'drawer-out' : 'drawer-in'} flex h-dvh w-5/6 max-w-xs flex-col bg-bg pt-[env(safe-area-inset-top)] shadow-card`}>
              <div className="flex flex-col gap-3 bg-surface px-4 pt-3 pb-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 pl-1">
                    <span className="block truncate text-lg font-extrabold tracking-tight">{name}</span>
                    <span className="text-xs text-muted">{t(role === 'manager' ? 'roleManager' : role === 'admin' ? 'roleAdmin' : 'roleEmployee')}</span>
                  </p>
                  <button type="button" aria-label={t('close')} onClick={close} className="-mt-1 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-button text-primary">
                    <X aria-hidden size={24} strokeWidth={1.75} />
                  </button>
                </div>
                {staff && (
                  <div role="tablist" aria-label={t('modes')} className="grid grid-cols-2 rounded-button bg-bg p-1 text-sm font-bold" data-drawer-modes>
                    {(['my', 'admin'] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        role="tab"
                        aria-selected={view === v}
                        onClick={() => {
                          setView(v);
                          setQ('');
                        }}
                        className={`min-h-9 rounded-button ${view === v ? 'bg-primary text-on-primary' : 'text-muted'}`}
                      >
                        {tf(`space.${v}`)}
                      </button>
                    ))}
                  </div>
                )}
                <label className="flex h-10 items-center gap-2 rounded-button border border-border bg-bg px-3 text-faint focus-within:border-primary">
                  <Search aria-hidden size={16} strokeWidth={1.75} />
                  <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('findMenu')} aria-label={t('findMenu')} className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-faint" />
                </label>
              </div>
              <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-2" data-drawer-list>
                {word ? (
                  found.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-faint">{t('noMenu')}</p>
                  ) : (
                    found.map((x) => (
                      <Link key={x.href} href={x.href} onClick={() => setOpen(false)} aria-current={here === x.href ? 'page' : undefined} className={`${row(here === x.href)} justify-between gap-2`}>
                        <span>{x.label}</span>
                        <span className="truncate text-xs font-normal text-faint">{x.where}</span>
                      </Link>
                    ))
                  )
                ) : (
                  <>
                    {/* 통합설정 안: 맨 위 제목 줄(누르면 통합설정 전체 메뉴) 아래로 통합설정 메뉴만 */}
                    {view === 'console' && (
                      <Link href={CONSOLE_HOME} onClick={() => setOpen(false)} aria-current={here === CONSOLE_HOME ? 'page' : undefined} className={`${row(here === CONSOLE_HOME)} mb-1 gap-3 rounded-b-none border-b border-border font-bold`} data-drawer-console>
                        <Settings aria-hidden size={18} strokeWidth={2} className="shrink-0 text-primary" />
                        {tf('space.console')}
                      </Link>
                    )}
                    {apps.map((a) => {
                      const leaves = appLeaves(a).filter((l) => !l.pcOnly);
                      const Icon = a.icon;
                      const mine = leaves.some((l) => l.href === here);
                      // 항목이 하나뿐인 앱은 펼치지 않고 바로 그 화면으로
                      if (leaves.length === 1)
                        return (
                          <Link key={a.key} href={leaves[0].href} onClick={() => setOpen(false)} aria-current={mine ? 'page' : undefined} className={`${row(mine)} gap-3 font-bold`}>
                            <Icon aria-hidden size={18} strokeWidth={2} className="shrink-0 text-primary" />
                            {appName(a)}
                            {pill(badgeCount(counts, leaves[0].badge))}
                          </Link>
                        );
                      const isOpen = unfold.has(a.key);
                      return (
                        <div key={a.key} className="flex flex-col">
                          <button type="button" aria-expanded={isOpen} onClick={() => toggle(a.key)} className={`flex min-h-11 items-center gap-3 rounded-button px-3 text-left font-bold active:bg-primary-tint ${mine ? 'text-primary' : 'text-text'}`}>
                            <Icon aria-hidden size={18} strokeWidth={2} className="shrink-0 text-primary" />
                            <span className="flex-1">{appName(a)}</span>
                            {pill(leaves.reduce((n, l) => n + badgeCount(counts, l.badge), 0))}
                            <ChevronDown aria-hidden size={16} className={`shrink-0 text-faint transition-transform duration-[350ms] ease-in-out ${isOpen ? 'rotate-180' : ''}`} />
                          </button>
                          {isOpen && (
                            <div className="flex flex-col pb-1 pl-8">
                              {/* PC 왼쪽 메뉴와 같게 (2026-10-22 의뢰인: 「모바일이 PC 메뉴와 같지 않다」 · 「출퇴근은 어디냐」) — 묶음 이름(근무일정 · 출퇴근기록 · 점검 · 마감)을
                                  누르지 않는 굵은 제목으로 보이고, 그 아래 메뉴. 메뉴 이름은 「출퇴근 달력」처럼 그것만 봐도 알게 했다. 항목이 하나뿐인 묶음도 묶음 이름으로 줄이지 않는다 */}
                              {a.groups.map((g, gi) => {
                                const items = g.items.filter((l) => !l.pcOnly);
                                if (items.length === 0) return null;
                                const dupe = (l: { key: string }) => a.groups.some((o) => o !== g && o.items.some((x) => tf(`item.${x.key}`) === tf(`item.${l.key}`)));
                                const label = (l: { key: string }) => (g.key && dupe(l) ? `${tf(`group.${g.key}`)} ${tf(`item.${l.key}`)}` : tf(`item.${l.key}`));
                                if (!g.key) return items.map((l) => (
                                  <Link key={l.href} href={l.href} onClick={() => setOpen(false)} aria-current={here === l.href ? 'page' : undefined} className={`${row(here === l.href)} text-base`}>
                                    {tf(`item.${l.key}`)}
                                    {pill(badgeCount(counts, l.badge))}
                                  </Link>
                                ));
                                return (
                                  <div key={g.key} className={`flex flex-col ${gi > 0 ? 'mt-1 border-t border-border pt-1' : ''}`}>
                                    <p className="px-3 pt-2 pb-1 text-sm font-bold text-text">{tf(`group.${g.key}`)}</p>
                                    {items.map((l) => (
                                      <Link key={l.href} href={l.href} onClick={() => setOpen(false)} aria-current={here === l.href ? 'page' : undefined} className={`${row(here === l.href)} text-base`}>
                                        {label(l)}
                                      </Link>
                                    ))}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {/* 관리자 모드 맨 아래 톱니바퀴 「통합설정」 */}
                    {view === 'admin' && role === 'admin' && (
                      <Link href={CONSOLE_HOME} onClick={() => setOpen(false)} className={`${row(false)} mt-1 gap-3 rounded-t-none border-t border-border font-bold`} data-drawer-console>
                        <Settings aria-hidden size={18} strokeWidth={2} className="shrink-0 text-primary" />
                        {tf('space.console')}
                      </Link>
                    )}
                  </>
                )}
              </div>
              <div className="flex flex-col gap-2 border-t border-border px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
                {ops && (
                  <Link href="/admin/ops" onClick={() => setOpen(false)} className="flex min-h-11 items-center gap-3 rounded-button border border-border px-3 text-sm font-semibold text-text">
                    <Activity aria-hidden size={18} strokeWidth={2} className="shrink-0 text-primary" />
                    {tf('account.ops')}
                  </Link>
                )}
                <AddToHomeButton compact />
                <PushToggle audience={staff ? 'staff' : 'employee'} />
                <div className="flex items-center justify-between gap-2">
                  <LanguageSwitcher options={languages} />
                  <SignOutButton compact />
                </div>
              </div>
            </nav>
            <button type="button" tabIndex={-1} aria-label={t('close')} onClick={close} className={`${closing ? 'fade-to' : 'fade-from'} flex-1 bg-text opacity-40`} />
          </div>,
          document.body,
        )}
    </>
  );
}
