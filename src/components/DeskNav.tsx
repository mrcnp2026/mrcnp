'use client';
// PC(1024px~) 왼쪽 틀 — 앱 띠(아이콘 + 짧은 이름) + 메뉴 판(앱 이름 → 묶음 제목 → 항목). 직원 · 관리자가 같은 틀을 쓴다 (2026-10-14 결정 사항 개발-21).
// 통합설정에서는 앱 띠 자리에 「회사설정 / App 관리」 묶음 목록이 놓인다 (개발-20, 문서 07 6장).
// 무엇이 어디에 있는지는 config/nav.ts 한곳에서 정한다. 폰에서는 보이지 않는다(하단 탭 + 서랍 메뉴).
import { LayoutGrid } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link, { useLinkStatus } from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { appHref, appLeaves, appsFor, CONSOLE_HOME, locate, locateHref, type App, type NavRole } from '@/config/nav';
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

function Panel({ app, title, active, inboxCount, onPick, t }: { app: App; title: string; active?: string; inboxCount: number; onPick: (href: string) => void; t: (k: string) => string }) {
  return (
    <nav aria-label={title} className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-58 shrink-0 overflow-y-auto border-r border-border bg-bg px-3.5 py-5 lg:block">
      <h2 className="px-1.5 pb-3 text-xl font-bold tracking-tight">{title}</h2>
      {app.groups.map((g, gi) => (
        <div key={g.key ?? gi} className="pb-2">
          {g.key && <p className="px-2 pt-3 pb-1 text-xs font-bold text-faint">{t(`group.${g.key}`)}</p>}
          {g.items.map((s) => {
            const on = active === s.href;
            return (
              <Link key={s.href} href={s.href} aria-current={on ? 'page' : undefined} onClick={() => onPick(s.href)} className={`flex min-h-9 items-center gap-2 rounded-button px-2.5 text-sm ${on ? 'bg-primary-tint font-bold text-primary' : 'text-text hover:bg-surface'}`}>
                <span className="flex-1">{t(`item.${s.key}`)}</span>
                {s.badge === 'inbox' && inboxCount > 0 && <Count n={inboxCount} />}
                <Loading />
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function DeskNav({ role, inboxCount = 0 }: { role: NavRole; inboxCount?: number }) {
  const t = useTranslations('frame');
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

  if (at.space === 'console') {
    const sections = (['company', 'apps'] as const).map((s) => ({ s, apps: apps.filter((a) => a.section === s) }));
    const allOn = !at.app;
    return (
      <>
        <nav aria-label={t('space.console')} className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-58 shrink-0 overflow-y-auto border-r border-border bg-bg px-3.5 py-6 lg:block">
          <h2 className="px-2 pb-4 text-2xl font-extrabold tracking-tight">{t('space.console')}</h2>
          <Link href={CONSOLE_HOME} aria-current={allOn ? 'page' : undefined} onClick={() => setPressed(CONSOLE_HOME)} className={`flex min-h-10 items-center gap-2.5 rounded-button px-2.5 text-sm font-bold ${allOn ? 'bg-primary-tint text-primary' : 'text-text hover:bg-surface'}`}>
            <LayoutGrid aria-hidden size={18} strokeWidth={1.75} />
            <span className="flex-1">{t('console.all')}</span>
            <Loading />
          </Link>
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
        {at.app && <Panel app={at.app} title={t(`app.${at.app.key}`)} active={active} inboxCount={inboxCount} onPick={setPressed} t={t} />}
      </>
    );
  }

  return (
    <>
      <nav aria-label={t(`space.${at.space}`)} className="sticky top-14 z-10 hidden h-[calc(100dvh-3.5rem)] w-18 shrink-0 flex-col items-center gap-0.5 overflow-y-auto border-r border-border bg-rail py-2.5 lg:flex">
        {apps.map((a) => {
          const on = at.app?.key === a.key;
          const Icon = a.icon;
          const href = appHref(a);
          const badge = inboxCount > 0 && appLeaves(a).some((l) => l.badge === 'inbox');
          return (
            <Link key={a.key} href={href} aria-current={on ? 'true' : undefined} title={t(`appFull.${a.key}`)} onClick={() => setPressed(href)} className={`relative flex w-15 flex-col items-center gap-1 rounded-card pt-2 pb-1.5 text-xs ${on ? 'font-bold text-primary' : 'font-medium text-muted hover:bg-bg'}`}>
              <span className={`flex size-8 items-center justify-center rounded-button ${on ? 'bg-primary text-on-primary' : ''}`}>
                <Icon aria-hidden size={18} strokeWidth={on ? 2.25 : 1.75} />
              </span>
              <span className="whitespace-nowrap">{t(`app.${a.key}`)}</span>
              {badge && (
                <span className="absolute top-0.5 right-1">
                  <Count n={inboxCount} />
                </span>
              )}
              <span className="absolute top-1/2 right-0 -translate-y-1/2">
                <Loading />
              </span>
            </Link>
          );
        })}
      </nav>
      {/* 항목이 하나뿐인 앱(홈 · 요청 …)은 메뉴 판 없이 본문을 넓게 쓴다 */}
      {at.app && appLeaves(at.app).length > 1 && <Panel app={at.app} title={t(`appFull.${at.app.key}`)} active={active} inboxCount={inboxCount} onPick={setPressed} t={t} />}
    </>
  );
}
