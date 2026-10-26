'use client';
// PC 위 띠의 조각들 — 공간 전환(내 화면 / 관리자 화면) · 통합설정 톱니 · 메뉴 검색 · 내 메뉴 · 본문 위 경로 (2026-10-14 결정 사항 개발-20 · 21 · 25).
// 어디가 어느 공간인지는 config/nav.ts가 정한다.
import { Check, ChevronDown, ChevronRight, LayoutGrid, Megaphone, Menu as MenuIcon, MessagesSquare, Plane, Search, Send, Settings, UserRound, Users, Wallet, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { appLeaves, appsFor, CONSOLE_HOME, locate, type NavRole, type Space } from '@/config/nav';
import { MANAGER_HOME } from '@/lib/manager-rules';
import { SEARCH_KINDS, type SearchKind } from '@/lib/search';
import { RECENT_KEY } from './DeskNav';
import { ConsoleClose } from './ConsoleSheet';
import { HelpTip } from './Help';

function useSpace(role: NavRole) {
  const path = usePathname();
  const query = useSearchParams();
  return locate(path, query, role);
}

/** 내 화면 / 관리자 화면 — 관리자 · 지점관리자에게만. 통합설정 안에서는 둘 다 꺼져 있다 */
export function SpaceSwitch({ role }: { role: NavRole }) {
  const t = useTranslations('frame');
  const { space } = useSpace(role);
  if (role === 'employee') return null;
  const tabs: { key: Space; href: string }[] = [
    { key: 'my', href: '/punch' },
    { key: 'admin', href: role === 'manager' ? MANAGER_HOME : '/admin' },
  ];
  return (
    <div role="group" aria-label={t('space.label')} className="flex overflow-hidden rounded-button border border-border">
      {tabs.map((x) => {
        const on = space === x.key;
        return (
          <Link key={x.key} href={x.href} aria-current={on ? 'true' : undefined} onClick={space === 'console' ? relock : undefined} className={`flex h-8.5 items-center px-3.5 text-sm whitespace-nowrap ${on ? 'bg-primary-tint font-bold text-primary' : 'bg-bg text-muted hover:bg-surface'}`}>
            {t(`space.${x.key}`)}
          </Link>
        );
      })}
    </div>
  );
}

/** 통합설정 톱니 — 관리자만 */
export function ConsoleLink({ role }: { role: NavRole }) {
  const t = useTranslations('frame');
  const { space } = useSpace(role);
  if (role !== 'admin') return null;
  const on = space === 'console';
  return (
    <Link href={CONSOLE_HOME} aria-label={t('space.console')} title={t('space.console')} aria-current={on ? 'true' : undefined} className={`flex size-9 shrink-0 items-center justify-center rounded-button ${on ? 'bg-primary-tint text-primary' : 'text-muted hover:bg-surface'}`}>
      <Settings aria-hidden size={20} strokeWidth={1.75} />
    </Link>
  );
}

// 「찾을 곳」 고르기 — 아이콘이 있는 팝업 (2026-10-15 의뢰인: 기본 선택 상자 대신 다우오피스 검색처럼, `스샷/스샷2/검색.png`)
const SCOPE_ICON: Record<'all' | SearchKind, LucideIcon> = { all: LayoutGrid, menu: MenuIcon, people: Users, requests: Send, leave: Plane, notices: Megaphone, messages: MessagesSquare, pay: Wallet };

/** 메뉴 검색 — 열 수 있는 모든 화면을 이름으로 찾는다. 칸을 누르면 최근에 쓴 화면이 먼저 보인다 */
export function MenuSearch({ role }: { role: NavRole }) {
  const t = useTranslations('frame');
  const router = useRouter();
  const path = usePathname();
  const box = useRef<HTMLDivElement>(null);
  const ts = useTranslations('search');
  const [q, setQ] = useState('');
  const [scope, setScope] = useState<'all' | SearchKind>('all');
  const [open, setOpen] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [pick, setPick] = useState(-1); // -1 = 「전체 검색 결과 보기」 (Enter를 누르면 통합 검색 화면으로)
  const [recent, setRecent] = useState<string[]>([]);
  const all = useMemo(
    () =>
      (['my', 'admin', 'console'] as const).flatMap((space) =>
        appsFor(space, role).flatMap((a) => appLeaves(a).map((l) => ({ href: l.href, name: t(`item.${l.key}`), where: `${t(`space.${space}`)} › ${t(space === 'console' ? `app.${a.key}` : `appFull.${a.key}`)}` }))),
      ),
    [role, t],
  );
  useEffect(() => {
    setOpen(false);
    setScopeOpen(false);
    setQ('');
  }, [path]);
  useEffect(() => {
    if (!scopeOpen) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setScopeOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setScopeOpen(false);
    window.addEventListener('mousedown', away);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', away);
      window.removeEventListener('keydown', esc);
    };
  }, [scopeOpen]);
  useEffect(() => {
    if (!open) return;
    try {
      setRecent(JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'));
    } catch {
      setRecent([]);
    }
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', away);
    return () => window.removeEventListener('mousedown', away);
  }, [open]);
  const word = q.trim().toLowerCase();
  const list = word ? (scope === 'all' || scope === 'menu' ? all.filter((x) => `${x.name} ${x.where}`.toLowerCase().includes(word)).sort((x, y) => Number(!x.name.toLowerCase().includes(word)) - Number(!y.name.toLowerCase().includes(word))).slice(0, 8) : []) : recent.flatMap((h) => all.find((x) => x.href === h) ?? []);
  // 통합 검색 (2026-10-14 의뢰인: 다우오피스 위쪽 검색) — 관리자 모드에서는 /admin/search, 그 밖에는 /punch/search
  const searchAll = () => {
    const p = new URLSearchParams({ q: q.trim() });
    if (scope !== 'all') p.set('s', scope);
    go(`${path.startsWith('/admin') ? '/admin' : '/punch'}/search?${p.toString()}`);
  };
  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };
  return (
    <div ref={box} className="relative w-full max-w-lg">
      <label className="flex h-9 items-center gap-2 rounded-chip border border-border bg-bg pr-3.5 pl-1 text-faint focus-within:border-primary">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={scopeOpen}
          aria-label={`${ts('header.scopeLabel')}: ${scope === 'all' ? ts('all') : ts(`kind.${scope}`)}`}
          onClick={(e) => {
            e.preventDefault();
            setOpen(false);
            setScopeOpen((v) => !v);
          }}
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-chip bg-surface px-2.5 text-xs font-semibold text-text hover:bg-primary-tint"
          data-scope-button
        >
          {scope === 'all' ? ts('all') : ts(`kind.${scope}`)}
          <ChevronDown aria-hidden size={14} className={`transition-transform duration-[350ms] ${scopeOpen ? 'rotate-180' : ''}`} />
        </button>
        <Search aria-hidden size={16} strokeWidth={1.75} />
        <input
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls="menu-search-list"
          aria-label={t('search.placeholder')}
          placeholder={t('search.placeholder')}
          value={q}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value);
            setPick(-1);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
            else if (e.key === 'ArrowDown') setPick((i) => Math.min(i + 1, list.length - 1));
            else if (e.key === 'ArrowUp') setPick((i) => Math.max(i - 1, word ? -1 : 0));
            else if (e.key === 'Enter' && pick >= 0 && list[pick]) go(list[pick].href);
            else if (e.key === 'Enter' && word) searchAll();
            else return;
            e.preventDefault();
          }}
          className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-faint"
        />
      </label>
      {scopeOpen && (
        <div role="menu" aria-label={ts('header.scopeLabel')} className="absolute top-11 left-0 z-40 w-96 rounded-card border border-border bg-bg p-3 shadow-pop" data-scope-menu>
          <p className="px-2 pb-2 text-xs font-semibold text-faint">{ts('header.scopeLabel')}</p>
          <div className="grid grid-cols-2 gap-1">
            {(['all', ...SEARCH_KINDS] as const).map((k) => {
              const Icon = SCOPE_ICON[k];
              const on = scope === k;
              return (
                <button
                  key={k}
                  type="button"
                  role="menuitemradio"
                  aria-checked={on}
                  onClick={() => {
                    setScope(k);
                    setScopeOpen(false);
                  }}
                  className={`flex min-h-10 items-center gap-2.5 rounded-button px-2.5 text-left text-sm ${on ? 'bg-surface font-bold text-text' : 'text-text hover:bg-surface'}`}
                >
                  <Icon aria-hidden size={18} strokeWidth={1.75} className={on ? 'text-primary' : 'text-muted'} />
                  <span className="flex-1">{k === 'all' ? ts('all') : ts(`kind.${k}`)}</span>
                  {on && <Check aria-hidden size={16} className="text-primary" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {open && !scopeOpen && (word || list.length > 0) && (
        <div id="menu-search-list" role="listbox" className="absolute inset-x-0 top-11 z-30 overflow-hidden rounded-card border border-border bg-bg py-1.5 shadow-pop">
          {!word && <p className="px-3.5 pt-1 pb-1.5 text-xs font-bold text-faint">{t('search.recent')}</p>}
          {word && (
            <button type="button" role="option" aria-selected={pick === -1} onMouseEnter={() => setPick(-1)} onClick={searchAll} className={`flex min-h-10 w-full items-center gap-2 px-3.5 text-left text-sm font-bold ${pick === -1 ? 'bg-primary-tint text-primary' : 'text-text'}`}>
              <Search aria-hidden size={14} strokeWidth={2} />
              <span className="truncate">{ts('header.allResults', { q: q.trim() })}</span>
            </button>
          )}
          {word && list.length > 0 && <p className="px-3.5 pt-2 pb-1 text-xs font-bold text-faint">{ts('header.menuHits')}</p>}
          {!word && list.length === 0 && <p className="px-3.5 py-3 text-sm text-muted">{t('search.none')}</p>}
          {list.map((x, i) => (
            <button key={x.href} type="button" role="option" aria-selected={i === pick} onMouseEnter={() => setPick(i)} onClick={() => go(x.href)} className={`flex min-h-10 w-full items-center gap-3 px-3.5 text-left text-sm ${i === pick ? 'bg-primary-tint text-primary' : 'text-text'}`}>
              <span className="font-bold">{x.name}</span>
              <span className="ml-auto truncate text-xs text-faint">{x.where}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** 폰 위 띠의 돋보기 — 지금 모드의 통합 검색 화면으로 */
export function PhoneSearchLink() {
  const t = useTranslations('search');
  const path = usePathname();
  return (
    <Link href={`${path.startsWith('/admin') ? '/admin' : '/punch'}/search`} aria-label={t('title')} className="flex size-11 items-center justify-center text-text">
      <Search aria-hidden size={22} strokeWidth={1.75} />
    </Link>
  );
}

/** 내 메뉴 — 이름 첫 글자 동그라미를 누르면 내 계정 · 언어 · 로그아웃 */
export function AccountMenu({ name, roleLabel, children }: { name: string; roleLabel: string; children: ReactNode }) {
  const t = useTranslations('frame');
  const path = usePathname();
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', away);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('mousedown', away);
      window.removeEventListener('keydown', key);
    };
  }, [open]);
  return (
    <div ref={box} className="relative">
      <button type="button" aria-label={t('account.menu')} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="ml-1 flex size-8 items-center justify-center rounded-chip bg-primary-tint text-sm font-bold text-primary">
        {[...name][0] ?? ''}
      </button>
      {open && (
        <div role="menu" className="absolute top-11 right-0 z-30 flex w-64 flex-col gap-3 rounded-card border border-border bg-bg p-4 shadow-pop">
          <p className="min-w-0">
            <span className="block truncate text-base font-bold">{name}</span>
            <span className="text-sm text-muted">{roleLabel}</span>
          </p>
          <Link href="/punch/account" role="menuitem" className="flex min-h-9 items-center gap-2 rounded-button border border-border px-3 text-sm font-medium text-text hover:bg-surface">
            <UserRound aria-hidden size={16} strokeWidth={1.75} />
            {t('account.my')}
          </Link>
          {children}
        </div>
      )}
    </div>
  );
}

/** 본문 위 경로 — 관리자 화면 · 통합설정에서 「어디에 있는지」를 한 줄로 (PC만) */
export function Crumb({ role }: { role: NavRole }) {
  const t = useTranslations('frame');
  const at = useSpace(role);
  // 통합설정은 판 머리(ConsoleGuide)에 큰 경로로 보인다 (2026-10-22)
  if (at.space === 'my' || at.space === 'console' || !at.app || !at.leaf) return null;
  const parts = [t(`space.${at.space}`), ...(at.app.section ? [t(`console.${at.app.section}`)] : []), t(`appFull.${at.app.key}`), t(`item.${at.leaf.key}`)];
  // 앱 이름과 항목 이름이 같으면(홈 · 요청함) 한 번만
  const shown = parts.filter((p, i) => i === 0 || p !== parts[i - 1]);
  const siblings = at.app ? appLeaves(at.app) : [];
  return (
    <p data-noprint className="hidden items-center gap-1 px-8 pt-5 text-xs text-faint lg:flex">
      {shown.map((p, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight aria-hidden size={12} strokeWidth={1.75} />}
          <span className={i === shown.length - 1 ? 'font-bold text-muted' : ''}>{p}</span>
        </span>
      ))}
    </p>
  );
}

/** 통합설정에서 나갈 때 다시 잠근다 (2026-10-14 DB 묶음 7) — 기다리지 않고 보낸다 */
export const relock = () => {
  void fetch('/api/console/pin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'lock' }), keepalive: true });
};

const HOW_TONE = { view: 'bg-surface text-muted', instant: 'bg-ok-tint text-ok', versioned: 'bg-primary-tint text-primary', list: 'bg-surface text-text', review: 'bg-warn-tint text-warn' } as const;

/**
 * 통합설정 표시 (2026-10-14 의뢰인: 통합설정은 관리자 화면과 엄격히 구분, 들어간 화면이 이미 적용된 건지 · 저장해야 적용되는지 한눈에)
 * ① 짙은 띠: 지금 통합설정(최고관리자 모드)에 있다 + 관리자 모드로 나가기
 * ② 「이 화면 쓰는 법」: 보기 전용 · 바로 적용 · 저장해야 적용 · 목록 · 확인 후 적용 가운데 하나 (config/nav.ts의 how)
 */
export function ConsoleGuide({ role }: { role: NavRole }) {
  const t = useTranslations('frame');
  const at = useSpace(role);
  if (at.space !== 'console') return null;
  const how = at.leaf?.how;
  const howChip = how && (
    <p className={`flex items-center gap-1 self-start rounded-button py-0.5 pr-1 pl-3 text-sm ${HOW_TONE[how]}`}>
      <span className="font-bold whitespace-nowrap">
        {t('howTitle')} · {t(`how.${how}.tag`)}
      </span>
      <HelpTip label={t('howTitle')}>{t(`how.${how}.text`)}</HelpTip>
    </p>
  );
  // PC 판 머리 (2026-10-22, 다우오피스 통합설정처럼): 경로가 곧 제목 — 「App 관리 › 근태 설정 › 근무」 크게 + 쓰는 법 + ✕
  const parts = at.app ? [t(`console.${at.app.section ?? 'apps'}`), t(`app.${at.app.key}`), ...(at.leaf ? [t(`item.${at.leaf.key}`)] : [])] : [t('console.all')];
  const shown = parts.filter((p, i) => i === 0 || p !== parts[i - 1]);
  const siblings = at.app ? appLeaves(at.app) : [];
  return (
    <>
      <div data-noprint className="glass sticky top-0 z-10 hidden items-center gap-4 border-b px-8 py-4 lg:flex">
        <p className="flex min-w-0 flex-1 items-center gap-x-2 overflow-hidden text-xl font-medium tracking-tight whitespace-nowrap xl:text-2xl">
          {shown.map((p, i) => (
            <span key={i} className={`flex items-center gap-2 ${i === shown.length - 1 ? 'min-w-0' : 'shrink-0'}`}>
              {i > 0 && <ChevronRight aria-hidden size={20} strokeWidth={1.75} className="shrink-0 text-faint" />}
              <span className={i === shown.length - 1 ? 'truncate font-bold text-text' : 'text-muted'}>{p}</span>
            </span>
          ))}
        </p>
        {howChip}
        <span className="hidden rounded-chip bg-primary-tint px-3 py-1 text-xs font-bold whitespace-nowrap text-primary xl:inline">{t('console.band')}</span>
        <ConsoleClose onLeave={relock} />
      </div>
      {/* 폰: PC 판 머리와 같은 구성 (2026-10-22 의뢰인: 「모바일이랑 PC랑 틀린 부분이 많다」) — 짙은 띠를 빼고
          작은 경로 + 지금 화면 이름(누르면 같은 묶음의 메뉴 — PC 가운데 칸) + ✕(관리자 모드로) · 아래 쓰는 법 */}
      <div data-noprint data-console-phone className="relative z-20 flex flex-col gap-2 border-b border-border bg-bg px-4 pt-3 pb-3 lg:hidden">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 truncate text-xs text-muted">
              <span className="shrink-0 rounded-chip bg-primary-tint px-2 py-0.5 font-bold text-primary">{t('console.title')}</span>
              {shown.length > 1 && <span className="truncate">{shown.slice(0, -1).join(' › ')}</span>}
            </p>
            {siblings.length > 1 ? (
              <details className="group/sib relative mt-1">
                <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1 text-xl font-bold tracking-tight [&::-webkit-details-marker]:hidden">
                  <span className="truncate">{shown[shown.length - 1]}</span>
                  <ChevronDown aria-hidden size={20} className="shrink-0 text-muted transition-transform group-open/sib:rotate-180" />
                </summary>
                <nav aria-label={shown[shown.length - 1]} className="absolute top-full left-0 z-30 mt-1 flex max-h-96 w-80 max-w-[calc(100vw-2rem)] flex-col overflow-y-auto rounded-card border border-border bg-bg p-2 shadow-sheet">
                  {at.app!.groups.map((g, gi) => (
                    <div key={g.key ?? gi} className="pb-1">
                      {g.key && <p className="px-2 pt-2 pb-1 text-xs font-bold text-faint">{t(`group.${g.key}`)}</p>}
                      {g.items.map((x) => (
                        <Link key={x.href} href={x.href} onClick={(e) => e.currentTarget.closest("details")?.removeAttribute("open")} aria-current={x.href === at.leaf?.href ? "page" : undefined} className={`flex min-h-11 items-center rounded-button px-3 text-base ${x.href === at.leaf?.href ? 'bg-primary-tint font-bold text-primary' : 'text-text active:bg-surface'}`}>
                          {t(`item.${x.key}`)}
                        </Link>
                      ))}
                    </div>
                  ))}
                </nav>
              </details>
            ) : (
              <p className="mt-1 truncate text-xl font-bold tracking-tight">{shown[shown.length - 1]}</p>
            )}
          </div>
          <ConsoleClose onLeave={relock} />
        </div>
        {howChip}
      </div>
    </>
  );
}
