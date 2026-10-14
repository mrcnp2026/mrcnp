'use client';
// PC 위 띠의 조각들 — 공간 전환(내 화면 / 관리자 화면) · 통합설정 톱니 · 메뉴 검색 · 내 메뉴 · 본문 위 경로 (2026-10-14 결정 사항 개발-20 · 21 · 25).
// 어디가 어느 공간인지는 config/nav.ts가 정한다.
import { ChevronRight, Search, Settings, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { appLeaves, appsFor, CONSOLE_HOME, locate, type NavRole, type Space } from '@/config/nav';
import { MANAGER_HOME } from '@/lib/manager-rules';
import { RECENT_KEY } from './DeskNav';

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
          <Link key={x.key} href={x.href} aria-current={on ? 'true' : undefined} className={`flex h-8.5 items-center px-3.5 text-sm whitespace-nowrap ${on ? 'bg-primary-tint font-bold text-primary' : 'bg-bg text-muted hover:bg-surface'}`}>
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

/** 메뉴 검색 — 열 수 있는 모든 화면을 이름으로 찾는다. 칸을 누르면 최근에 쓴 화면이 먼저 보인다 */
export function MenuSearch({ role }: { role: NavRole }) {
  const t = useTranslations('frame');
  const router = useRouter();
  const path = usePathname();
  const box = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState(0);
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
    setQ('');
  }, [path]);
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
  const list = word ? all.filter((x) => `${x.name} ${x.where}`.toLowerCase().includes(word)).slice(0, 8) : recent.flatMap((h) => all.find((x) => x.href === h) ?? []);
  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };
  return (
    <div ref={box} className="relative w-full max-w-md">
      <label className="flex h-9 items-center gap-2 rounded-chip border border-border bg-bg px-3.5 text-faint focus-within:border-primary">
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
            setPick(0);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
            else if (e.key === 'ArrowDown') setPick((i) => Math.min(i + 1, list.length - 1));
            else if (e.key === 'ArrowUp') setPick((i) => Math.max(i - 1, 0));
            else if (e.key === 'Enter' && list[pick]) go(list[pick].href);
            else return;
            e.preventDefault();
          }}
          className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-faint"
        />
      </label>
      {open && (word || list.length > 0) && (
        <div id="menu-search-list" role="listbox" className="absolute inset-x-0 top-11 z-30 overflow-hidden rounded-card border border-border bg-bg py-1.5 shadow-pop">
          {!word && <p className="px-3.5 pt-1 pb-1.5 text-xs font-bold text-faint">{t('search.recent')}</p>}
          {list.length === 0 && <p className="px-3.5 py-3 text-sm text-muted">{t('search.none')}</p>}
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
  if (at.space === 'my' || !at.app || !at.leaf) return null;
  const parts = [t(`space.${at.space}`), ...(at.app.section ? [t(`console.${at.app.section}`)] : []), t(at.space === 'console' ? `app.${at.app.key}` : `appFull.${at.app.key}`), t(`item.${at.leaf.key}`)];
  // 앱 이름과 항목 이름이 같으면(홈 · 요청함) 한 번만
  const shown = parts.filter((p, i) => i === 0 || p !== parts[i - 1]);
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
