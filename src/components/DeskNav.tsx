'use client';
// PC(1024px~) 왼쪽 틀 — 앱 띠(아이콘 + 짧은 이름) + 메뉴 판(앱 이름 → 묶음 제목 → 항목). 직원 · 관리자가 같은 틀을 쓴다 (2026-10-14 결정 사항 개발-21).
// 통합설정에서는 앱 띠 자리에 「회사설정 / App 관리」 묶음 목록이 놓인다 (개발-20, 문서 07 6장).
// 무엇이 어디에 있는지는 config/nav.ts 한곳에서 정한다. 폰에서는 보이지 않는다(하단 탭 + 서랍 메뉴).
import { History, LayoutGrid, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link, { useLinkStatus } from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { appHref, appLeaves, appsFor, CONSOLE_HOME, locate, locateHref, type App, type NavRole } from '@/config/nav';
import { badgeCount, useAlerts, type AlertCounts } from './Alerts';
import { usePressedTab } from './NavTab';

export const RECENT_KEY = 'nav-recent';

/** 누른 메뉴의 다음 화면을 불러오는 동안 작은 막대 (2026-10-06 의뢰인: 눌러도 진행 중인지 모르겠다) */
function Loading() {
  const { pending } = useLinkStatus();
  return <span aria-hidden className={`h-4 w-1 shrink-0 rounded-chip bg-primary ${pending ? 'opacity-100' : 'opacity-0'}`} />;
}

function Count({ n }: { n: number }) {
  return <span className="num min-w-5 rounded-chip bg-danger px-1.5 text-center text-xs leading-5 font-bold text-on-primary">{n}</span>;
}

function Panel({ app, title, active, counts, onPick, t }: { app: App; title: string; active?: string; counts: AlertCounts; onPick: (href: string) => void; t: (k: string) => string }) {
  return (
    <nav aria-label={title} className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-58 shrink-0 overflow-y-auto border-r glass px-3.5 py-5 lg:block">
      <h2 className="px-1.5 pb-3 text-xl font-bold tracking-tight">{title}</h2>
      {app.groups.map((g, gi) => (
        // 묶음 이름을 또렷하게 + 묶음 사이 줄 (2026-10-22 의뢰인: 「근무일정 밑에 달력형 · 목록형 · 월 집계 — 출퇴근은 어디냐」 — 옅은 작은 글씨라 묶음이 안 보였다)
        <div key={g.key ?? gi} className={`pb-2 ${gi > 0 && g.key ? 'mt-2 border-t border-border pt-1' : ''}`}>
          {g.key && <p className="px-2 pt-3 pb-1.5 text-sm font-bold text-text">{t(`group.${g.key}`)}</p>}
          {g.items.map((s) => {
            const on = active === s.href;
            return (
              <Link key={s.href} href={s.href} aria-current={on ? 'page' : undefined} onClick={() => onPick(s.href)} className={`flex min-h-9 items-center gap-2 rounded-button px-2.5 text-sm ${on ? 'bg-primary-tint font-bold text-primary' : 'text-text hover:bg-surface'}`}>
                <span className="flex-1">{t(`item.${s.key}`)}</span>
                {badgeCount(counts, s.badge) > 0 && <Count n={badgeCount(counts, s.badge)} />}
                <Loading />
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function DeskNav({ role, initialWide = false }: { role: NavRole; inboxCount?: number; initialWide?: boolean }) {
  const t = useTranslations('frame');
  const counts = useAlerts(); // 화면을 옮길 때마다 다시 센 숫자 (components/Alerts) — 메뉴마다 badge로 고른다 (2026-10-19)
  const { path, pressed, setPressed } = usePressedTab();
  const query = useSearchParams();
  const here = locate(path, query, role);
  const at = (pressed ? locateHref(pressed, role) : undefined) ?? here;
  const active = at.leaf?.href;

  // 최근 사용 — 메뉴 검색 칸을 누르면 보인다. 이 브라우저에만 기억한다
  const hereHref = here.leaf?.href;
  useEffect(() => {
    if (!hereHref) return;
    try {
      const old: string[] = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
      localStorage.setItem(RECENT_KEY, JSON.stringify([hereHref, ...old.filter((h) => h !== hereHref)].slice(0, 6)));
    } catch {
      // 저장이 막혀 있으면 기억하지 못할 뿐이다
    }
  }, [hereHref]);

  const apps = appsFor(at.space, role);

  // 통합설정 왼쪽 판의 「최근 사용한 메뉴」 (2026-10-22, 다우오피스 통합설정의 My) — 위에서 기억한 최근 화면 가운데 통합설정 것만 넷까지
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => {
    if (at.space !== 'console') return;
    try {
      const old: string[] = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
      setRecent(old.filter((h) => h !== hereHref && locateHref(h, role)?.space === 'console').slice(0, 4));
    } catch {
      setRecent([]);
    }
  }, [at.space, hereHref, role]);

  // 와이드 메뉴 (2026-10-13 의뢰인 결정 사항 개발-18을 새 틀에 다시 살림, 2026-10-14):
  // 앱 띠 맨 아래 단추로 좁게(아이콘 + 짧은 이름) ↔ 넓게(아이콘 옆 온전한 이름). 서랍처럼 0.35초 ease-in-out. 고른 모양은 이 브라우저에 기억한다
  const [wide, setWide] = useState(initialWide); // 서버가 쿠키로 처음부터 고른 폭을 그린다 — 예전에는 좁게 그렸다가 넓게 바뀌며 화면이 흔들렸다 (2026-10-26)
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem('nav-wide') === '1' && !initialWide) {
        setWide(true);
        document.cookie = 'nav-wide=1; path=/; max-age=31536000; samesite=lax';
      }
    } catch {
      // 저장이 막혀 있으면 기억하지 못할 뿐이다
    }
    const id = requestAnimationFrame(() => setReady(true)); // 처음 그릴 때는 움직이지 않고 고른 모양으로 바로 놓는다
    return () => cancelAnimationFrame(id);
  }, []);
  const toggleWide = () =>
    setWide((w) => {
      try {
        localStorage.setItem('nav-wide', w ? '0' : '1');
        document.cookie = `nav-wide=${w ? '0' : '1'}; path=/; max-age=31536000; samesite=lax`;
      } catch {
        // 위와 같음
      }
      return !w;
    });
  // 전역 규칙(globals.css의 transition)이 보통 클래스를 이긴다 — 서랍 움직임은 !로 0.35초 ease-in-out을 지킨다
  const move = ready ? 'transition-all! duration-350! ease-in-out!' : '';
  const Toggle = wide ? PanelLeftClose : PanelLeftOpen;

  if (at.space === 'console') {
    const sections = (['company', 'apps'] as const).map((s) => ({ s, apps: apps.filter((a) => a.section === s) }));
    const allOn = !at.app;
    return (
      <>
        <nav aria-label={t('space.console')} className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-58 shrink-0 overflow-y-auto border-r glass px-3.5 py-6 lg:block">
          <h2 className="px-2 pb-4 text-2xl font-extrabold tracking-tight">{t('space.console')}</h2>
          <Link href={CONSOLE_HOME} aria-current={allOn ? 'page' : undefined} onClick={() => setPressed(CONSOLE_HOME)} className={`flex min-h-10 items-center gap-2.5 rounded-button px-2.5 text-sm font-bold ${allOn ? 'bg-primary-tint text-primary' : 'text-text hover:bg-surface'}`}>
            <LayoutGrid aria-hidden size={18} strokeWidth={1.75} />
            <span className="flex-1">{t('console.all')}</span>
            <Loading />
          </Link>
          {recent.length > 0 && (
            <div className="pt-5">
              <p className="flex items-center gap-1.5 px-2 pb-1 text-xs font-bold text-faint">
                <History aria-hidden size={14} strokeWidth={1.75} />
                {t('console.recent')}
              </p>
              {recent.map((h) => {
                const leaf = locateHref(h, role)?.leaf;
                return leaf ? (
                  <Link key={h} href={h} onClick={() => setPressed(h)} className="flex min-h-9 items-center gap-2 rounded-button px-2.5 text-sm text-muted hover:bg-surface hover:text-text">
                    <span className="flex-1 truncate">{t(`item.${leaf.key}`)}</span>
                    <Loading />
                  </Link>
                ) : null;
              })}
            </div>
          )}
          {sections.map(({ s, apps: list }) => (
            <div key={s} className="pt-5">
              <p className="px-2 pb-1 text-xs font-bold text-faint">{t(`console.${s}`)}</p>
              {list.map((a) => {
                const on = at.app?.key === a.key;
                const Icon = a.icon;
                return (
                  <Link key={a.key} href={appHref(a)} aria-current={on ? 'true' : undefined} onClick={() => setPressed(appHref(a))} className={`flex min-h-10 items-center gap-2.5 rounded-button px-2.5 text-sm ${on ? 'bg-primary-tint font-bold text-primary' : 'text-text hover:bg-surface'}`}>
                    <Icon aria-hidden size={18} strokeWidth={1.75} className={on ? '' : 'text-muted'} />
                    <span className="flex-1">{t(`app.${a.key}`)}</span>
                    <Loading />
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        {at.app && <Panel app={at.app} title={t(`app.${at.app.key}`)} active={active} counts={counts} onPick={setPressed} t={t} />}
      </>
    );
  }

  return (
    <>
      <nav aria-label={t(`space.${at.space}`)} className={`sticky top-14 z-10 hidden h-[calc(100dvh-3.5rem)] shrink-0 flex-col gap-0.5 overflow-x-hidden overflow-y-auto border-r border-border bg-rail px-1.5 py-2.5 lg:flex ${move} ${wide ? 'w-49' : 'w-18'}`}>
        {apps.map((a) => {
          const on = at.app?.key === a.key;
          const Icon = a.icon;
          const href = appHref(a);
          const appCount = appLeaves(a).reduce((n, l) => n + badgeCount(counts, l.badge), 0); // 앱 띠 숫자 = 그 앱 메뉴 숫자의 합
          return (
            <Link key={a.key} href={href} aria-current={on ? 'true' : undefined} aria-label={t(`appFull.${a.key}`)} title={wide ? undefined : t(`appFull.${a.key}`)} onClick={() => setPressed(href)} className={`relative block w-full shrink-0 overflow-hidden rounded-card ${move} ${wide ? 'h-10.5' : 'h-15'} ${on ? 'font-bold text-primary' : 'font-medium text-muted hover:bg-bg'} ${on && wide ? 'bg-primary-tint' : ''}`}>
              <span className={`absolute flex size-8 items-center justify-center rounded-button ${move} ${wide ? 'top-1.25 left-1.5' : 'top-1.5 left-3.5'} ${on && !wide ? 'bg-primary text-on-primary' : ''}`}>
                <Icon aria-hidden size={18} strokeWidth={on ? 2.25 : 1.75} />
              </span>
              {/* 좁을 때: 아이콘 아래 짧은 이름 · 넓을 때: 아이콘 오른쪽 온전한 이름 — 한쪽이 옆으로 밀리며 사라지고 다른 쪽이 나타난다 */}
              <span aria-hidden className={`absolute inset-x-0 bottom-1 text-center text-xs whitespace-nowrap ${move} ${wide ? 'translate-x-6 opacity-0' : 'opacity-100'}`}>
                {t(`app.${a.key}`)}
              </span>
              <span aria-hidden className={`absolute top-1/2 left-11.5 -translate-y-1/2 text-sm whitespace-nowrap ${move} ${wide ? 'opacity-100' : '-translate-x-4 opacity-0'}`}>
                {t(`appFull.${a.key}`)}
              </span>
              {appCount > 0 && (
                <span className={`absolute ${move} ${wide ? 'top-3 right-2.5' : 'top-0.5 right-1'}`}>
                  <Count n={appCount} />
                </span>
              )}
              <span className="absolute top-1/2 right-0 -translate-y-1/2">
                <Loading />
              </span>
            </Link>
          );
        })}
        <button type="button" onClick={toggleWide} aria-pressed={wide} aria-label={t(wide ? 'narrowMenu' : 'wideMenu')} title={t(wide ? 'narrowMenu' : 'wideMenu')} className={`relative mt-auto block w-full shrink-0 overflow-hidden rounded-card text-muted hover:bg-bg hover:text-text ${move} ${wide ? 'h-10.5' : 'h-15'}`}>
          <span className={`absolute flex size-8 items-center justify-center ${move} ${wide ? 'top-1.25 left-1.5' : 'top-1.5 left-3.5'}`}>
            <Toggle aria-hidden size={18} strokeWidth={1.75} />
          </span>
          <span aria-hidden className={`absolute inset-x-0 bottom-1 text-center text-xs whitespace-nowrap ${move} ${wide ? 'translate-x-6 opacity-0' : 'opacity-100'}`}>
            {t('wideShort')}
          </span>
          <span aria-hidden className={`absolute top-1/2 left-11.5 -translate-y-1/2 text-sm whitespace-nowrap ${move} ${wide ? 'opacity-100' : '-translate-x-4 opacity-0'}`}>
            {t('narrowMenu')}
          </span>
        </button>
      </nav>
      {/* 항목이 하나뿐인 앱(홈 · 요청 …)은 메뉴 판 없이 본문을 넓게 쓴다 */}
      {at.app && appLeaves(at.app).length > 1 && <Panel app={at.app} title={t(`appFull.${at.app.key}`)} active={active} counts={counts} onPick={setPressed} t={t} />}
    </>
  );
}
