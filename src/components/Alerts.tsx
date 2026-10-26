'use client';
// 알림 숫자 한곳 (2026-10-14 의뢰인: 요청 · 공지가 있으면 종에 표시, 처리하면 숫자가 바로 바뀌어야 한다)
// 처음 값은 화면 틀(AppFrame)이 서버에서 세어 넘기고, 화면이 뜰 때 · 화면을 옮길 때마다 · 1분마다 · 창으로 돌아올 때 /api/me/alerts로 다시 센다.
// 종 아이콘(AlertBell)과 요청 배지(앱 띠 · 하단 탭)가 같은 숫자를 쓴다.
import { Bell, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

// decided: 내 요청 중 처리된 것(「요청」 화면을 마지막으로 연 뒤) — 메뉴 · 종 숫자에 같이 (2026-10-19)
// inquiry: 문의하기 — 안 본 답 + (답할 수 있는 관리자는) 답 안 한 받은 문의. 종 숫자 · 앱 아이콘 숫자에도 같이 센다 (2026-10-26 의뢰인: 종에 알림이 없다)
export type AlertCounts = { notices: number; messages: number; requests: number; decided: number; inquiry: number };
const Ctx = createContext<AlertCounts>({ notices: 0, messages: 0, requests: 0, decided: 0, inquiry: 0 });
export const useAlerts = () => useContext(Ctx);

/** 메뉴 항목의 숫자 (config/nav.ts의 badge) — 처리할 요청 숫자는 관리자 · 지점관리자에게만 (서버가 0으로 보낸다) */
export function badgeCount(c: AlertCounts, badge: 'inbox' | 'notices' | 'messages' | 'decided' | 'inquiry' | undefined): number {
  if (badge === 'inbox') return c.requests;
  if (badge === 'notices') return c.notices;
  if (badge === 'messages') return c.messages;
  if (badge === 'decided') return c.decided;
  if (badge === 'inquiry') return c.inquiry;
  return 0;
}

export function AlertsProvider({ initial, children }: { initial: AlertCounts; children: ReactNode }) {
  const [counts, setCounts] = useState(initial);
  const path = usePathname();
  const reload = useCallback(async () => {
    try {
      const r = await fetch('/api/me/alerts', { cache: 'no-store' });
      if (r.ok) setCounts(await r.json());
    } catch {
      // 잠깐 연결이 끊겨도 앞의 숫자를 그대로 둔다
    }
  }, []);
  // 처음 뜰 때도 다시 센다 (2026-10-18 의뢰인: 최고관리자로 들어오니 직원 화면 종에 처리할 요청 3건이 안 나오고, 관리자 화면을 한 번 연 뒤에야 나왔다).
  // 브라우저가 예전에 열어 둔 화면을 그대로 되살리면(뒤로 가기 · 폰에서 앱 다시 열기) 서버가 센 처음 값이 옛날 숫자다.
  useEffect(() => {
    void reload();
  }, [path, reload]);
  useEffect(() => {
    const id = window.setInterval(reload, 60_000);
    const onFocus = () => document.visibilityState === 'visible' && reload();
    // 되살린 화면(bfcache)은 visibilitychange가 오지 않을 수 있다 — pageshow로 잡는다
    const onShow = (e: PageTransitionEvent) => e.persisted && reload();
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', reload);
    window.addEventListener('pageshow', onShow);
    window.addEventListener(ALERTS_RELOAD_EVENT, reload);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', reload);
      window.removeEventListener('pageshow', onShow);
      window.removeEventListener(ALERTS_RELOAD_EVENT, reload);
    };
  }, [reload]);
  // 앱 아이콘 숫자 (2026-10-21 의뢰인: 카카오톡처럼) — 종과 같은 숫자. 홈 화면에 설치한 앱에서만 보인다(아이폰 · PC 크롬/엣지).
  // 앱이 닫혀 있을 때는 폰 알림을 받는 순간 서비스 워커(public/sw.js)가 다시 세어 바꾼다
  useEffect(() => {
    const n = counts.notices + counts.messages + counts.decided + counts.requests + counts.inquiry; // requests는 승인할 사람이 아니면 서버가 0으로 보낸다
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => unknown; clearAppBadge?: () => unknown };
    try {
      void Promise.resolve(n > 0 ? nav.setAppBadge?.(n) : nav.clearAppBadge?.()).catch(() => {});
    } catch {
      // 숫자를 못 다는 기기 — 그대로 둔다
    }
  }, [counts]);
  return <Ctx.Provider value={counts}>{children}</Ctx.Provider>;
}

/** 승인 · 거절 · 읽음처럼 숫자가 바뀌는 일을 한 뒤 부른다 — 화면을 옮기지 않아도 바로 다시 센다 */
export const ALERTS_RELOAD_EVENT = 'alerts-reload';
export const reloadAlerts = () => window.dispatchEvent(new Event(ALERTS_RELOAD_EVENT));

/** 종 — 공지 · 메시지 · 처리할 요청을 더한 숫자, 누르면 무엇이 몇 건인지 */
export function AlertBell({ approver, size = 'pc' }: { approver: boolean; size?: 'pc' | 'phone' }) {
  const t = useTranslations('alerts');
  const c = useAlerts();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
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
  const total = c.notices + c.messages + c.decided + c.inquiry + (approver ? c.requests : 0);
  const rows = [
    { key: 'notices', n: c.notices, href: '/punch/notices' },
    { key: 'messages', n: c.messages, href: '/punch/messages' },
    { key: 'decided', n: c.decided, href: '/punch/requests?tab=done' }, // 내 요청 중 처리된 것 (2026-10-19)
    ...(approver ? [{ key: 'requests', n: c.requests, href: '/admin/inbox' }] : []),
    { key: 'inquiry', n: c.inquiry, href: approver ? '/admin/inquiry' : '/punch/inquiry' }, // 문의하기: 안 본 답 + 답 안 한 받은 문의 (2026-10-26)
  ];
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-label={t('label', { n: total })}
        aria-expanded={open}
        data-alert-bell
        onClick={() => setOpen((o) => !o)}
        className={`relative flex shrink-0 items-center justify-center rounded-button ${size === 'pc' ? 'size-9 text-muted hover:bg-surface' : '-mr-2 size-11 text-text'}`}
      >
        <Bell aria-hidden size={size === 'pc' ? 20 : 22} strokeWidth={1.75} />
        {total > 0 && <span className="num absolute -top-0.5 -right-0.5 flex min-w-4.5 items-center justify-center rounded-chip bg-danger px-1 text-xs leading-4.5 font-bold text-on-primary">{total}</span>}
      </button>
      {open && (
        <div role="menu" className="absolute top-11 right-0 z-30 w-72 rounded-card border border-border bg-bg p-2 shadow-pop">
          <p className="px-2 pt-1 pb-2 text-sm font-bold">{t('title')}</p>
          {rows.map((r) => (
            <Link key={r.key} href={r.href} role="menuitem" className="flex min-h-11 items-center gap-2 rounded-button px-2 text-sm hover:bg-surface">
              <span className="flex-1">{t(r.key)}</span>
              <span className={`num min-w-6 rounded-chip px-2 text-center text-xs font-bold ${r.n > 0 ? 'bg-danger text-on-primary' : 'bg-surface text-faint'}`}>{r.n}</span>
              <ChevronRight aria-hidden size={14} className="text-faint" />
            </Link>
          ))}
          {total === 0 && <p className="px-2 pb-1 text-xs text-faint">{t('none')}</p>}
        </div>
      )}
    </div>
  );
}
