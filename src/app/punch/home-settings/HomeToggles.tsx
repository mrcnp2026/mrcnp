'use client';
// 홈 설정 — 카드 켜고 끄기 (2026-10-11). 꺼 둔 카드 이름을 쿠키에 적는다 (이 기기에만 — 서버에 저장하지 않는다).
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { HOME_COOKIE, homeCookieValue, type HomeCard } from '@/lib/home';

export function HomeToggles({ cards, initial }: { cards: HomeCard[]; initial: HomeCard[] }) {
  const t = useTranslations('home.settings');
  const router = useRouter();
  const [on, setOn] = useState<Set<HomeCard>>(new Set(initial));
  const flip = (k: HomeCard) => {
    const next = new Set(on);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setOn(next);
    try {
      document.cookie = `${HOME_COOKIE}=${encodeURIComponent(homeCookieValue(next))}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    } catch {
      // 쿠키를 못 쓰는 환경이면 이번 화면에서만 바뀐다
    }
    router.refresh();
  };
  return (
    <ul className="-mx-4 divide-y divide-border border-y border-border bg-bg lg:mx-0 lg:rounded-card lg:border">
      {cards.map((k) => (
        <li key={k}>
          <label className="flex min-h-14 items-center gap-3 px-5">
            <span className="flex-1 font-bold">{t(`card.${k}`)}</span>
            <input type="checkbox" role="switch" checked={on.has(k)} onChange={() => flip(k)} className="size-6 shrink-0 accent-primary" />
          </label>
        </li>
      ))}
    </ul>
  );
}
