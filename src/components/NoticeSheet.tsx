'use client';
// 공지 팝업 (②-5 7-15 요점 18~22): 아래에서 올라오는 판 + 맨 아래 폭 전체 「확인」.
// 언어는 상단 언어 버튼을 따른다 — 서버가 그 언어의 번역을 골라 넘긴다 (없으면 한국어 원문).
// 출퇴근 화면(/punch)에서는 출퇴근을 찍은 다음에 띄운다 — 버튼을 가리지 않게 (요점 18). 공지 목록 화면에서는 띄우지 않는다.
// 「오늘 하루 보지 않기」는 이 브라우저에만 기억한다.
import { Megaphone } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { callApi } from './client-api';
import { NoticeBody } from './NoticeBody';
import { Button, Chip } from './ui';

export type SheetNotice = {
  id: string;
  version: number;
  important: boolean;
  display: { locale: string; title: string; body: string; machine: boolean; stale: boolean; translated: boolean };
  original: { title: string; body: string };
};

export const PUNCHED_EVENT = 'attendance:punched';
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
const snoozeKey = (n: SheetNotice) => `notice-snooze:${n.id}:${n.version}:${today()}`;

function snoozed(n: SheetNotice) {
  try {
    return localStorage.getItem(snoozeKey(n)) === '1';
  } catch {
    return false; // 저장이 막혀 있으면 팝업이 계속 뜰 뿐이다
  }
}

export function NoticeSheet({ items }: { items: SheetNotice[] }) {
  const t = useTranslations('notices');
  const tc = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const [queue, setQueue] = useState<SheetNotice[]>([]);
  const path = usePathname();
  const [punched, setPunched] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => setQueue(items.filter((n) => n.important || !snoozed(n))), [items]);
  useEffect(() => {
    const on = () => setPunched(true);
    window.addEventListener(PUNCHED_EVENT, on);
    return () => window.removeEventListener(PUNCHED_EVENT, on);
  }, []);

  const n = queue[0];
  if (!n || path === '/punch/notices' || (path === '/punch' && !punched)) return null;

  const next = () => {
    setShowOriginal(false);
    const rest = queue.slice(1);
    setQueue(rest);
    if (!rest.length) router.refresh();
  };
  async function confirm() {
    setBusy(true);
    await callApi(`/api/notices/${n.id}/confirm`, { locale }); // 실패해도 다음에 다시 뜰 뿐이다 — 막지 않는다
    setBusy(false);
    next();
  }
  function snooze() {
    try {
      localStorage.setItem(snoozeKey(n), '1');
    } catch {
      // 저장이 막혀 있으면 기억하지 못할 뿐이다
    }
    next();
  }

  const shown = showOriginal
    ? { title: n.original.title, body: n.original.body, lang: 'ko' }
    : { title: n.display.title, body: n.display.body, lang: n.display.locale };
  return (
    <div className="fixed inset-0 z-30 flex items-end bg-text/40 pt-12" role="dialog" aria-modal="true" aria-labelledby="notice-title">
      <div className="mx-auto flex max-h-full w-full max-w-md flex-col rounded-t-card bg-bg shadow-card">
        <div className="flex flex-col gap-3 overflow-y-auto p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-button bg-primary-tint text-primary">
              <Megaphone aria-hidden size={20} strokeWidth={1.75} />
            </span>
            <span className="text-sm font-semibold text-muted">{t('title')}</span>
            {n.important && <Chip tone="warn">{t('important')}</Chip>}
            {queue.length > 1 && <span className="num ml-auto text-xs text-faint">{t('more', { n: queue.length - 1 })}</span>}
          </div>
          <h2 id="notice-title" lang={shown.lang} className="text-xl font-semibold break-words text-primary-deep">
            {shown.title}
          </h2>
          <NoticeBody text={shown.body} lang={shown.lang} />
          {n.display.translated && !showOriginal && (
            <div className="flex flex-col gap-1 border-t border-border pt-2 text-xs text-faint">
              {n.display.machine && <span>{t('machine')}</span>}
              {n.display.stale && <span className="text-warn">{t('stale')}</span>}
              <span>{tc('translationNotice')}</span>
            </div>
          )}
          {n.display.translated && (
            <button type="button" onClick={() => setShowOriginal(!showOriginal)} className="min-h-11 self-start text-sm font-semibold text-primary">
              {showOriginal ? t('showTranslation') : t('showOriginal')}
            </button>
          )}
        </div>
        <div className="flex flex-col gap-1 border-t border-border p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {!n.important && (
            <button type="button" onClick={snooze} className="min-h-11 text-sm text-muted">
              {t('snooze')}
            </button>
          )}
          <Button disabled={busy} onClick={confirm} className="min-h-14 w-full">
            {t('confirm')}
          </Button>
        </div>
      </div>
    </div>
  );
}
