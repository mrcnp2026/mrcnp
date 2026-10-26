'use client';
// 통합설정을 판(팝업)으로 (2026-10-22 의뢰인: 다우오피스 통합설정처럼 「열리는 방식이 팝업이자나, 이 팝업 자체도 좋아」 — 결정 사항 개발-52).
// PC(1024px~)에서 통합설정 화면은 보던 화면 위로 올라온 판 안에 그린다: 위 40px · 아래 24px · 좌우 여백(넓은 화면은 가로 1920px까지 — 2026-10-22 의뢰인 「좌우로 좀 더 넓게」 · 「더 넓게」) · 네 모서리 둥글게 · 뒤는 어둡게.
// 2026-10-22 의뢰인: 「가로 비율이 커서 넓게 퍼져 보인다, 팝업 느낌을 살리려면 좌우 여백을」
// ✕(ConsoleClose)는 통합설정에 들어오기 직전에 보던 화면으로 돌아간다 — 그 주소(거르기 · 쪽 번호가 담긴 쿼리 포함)를 이 탭에 기억해 둔다.
// 폰은 예전 그대로(판 없이 보통 화면). 어느 화면이 통합설정인지는 config/nav.ts가 정한다.
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { locate, type NavRole } from '@/config/nav';

const RETURN_KEY = 'console-return';

export function SpaceShell({ role, children }: { role: NavRole; children: ReactNode }) {
  const path = usePathname();
  const query = useSearchParams();
  const { space } = locate(path, query, role);
  const sheet = space === 'console';
  const qs = query.toString();
  useEffect(() => {
    if (sheet) return;
    try {
      sessionStorage.setItem(RETURN_KEY, qs ? `${path}?${qs}` : path);
    } catch {
      // 저장이 막혀 있으면 ✕가 관리자 홈으로 간다
    }
  }, [sheet, path, qs]);
  if (!sheet) return <div className="lg:flex">{children}</div>;
  return (
    <>
      {/* 막 · 판은 맨 위 머리(높이 14) 아래에서 시작 (2026-10-22 의뢰인: 「통합설정에 들어가면 위쪽이 블러 처리된다」 — 막이 머리까지 덮어 흐려 보였다) */}
      <div aria-hidden className="fade-from fixed inset-x-0 top-14 bottom-0 z-30 hidden bg-text/40 lg:block" />
      <div data-console-sheet className="sheet-up lg:glass-sheet lg:fixed lg:inset-x-3 lg:top-17 lg:bottom-4 lg:z-40 lg:flex lg:overflow-hidden lg:rounded-3xl lg:shadow-sheet xl:inset-x-4 2xl:inset-x-[max(1.5rem,calc((100%-1920px)/2))]">
        {children}
      </div>
    </>
  );
}

/** 판 닫기 ✕ — 들어오기 직전 화면으로. onLeave: 통합설정 다시 잠그기 */
export function ConsoleClose({ onLeave }: { onLeave: () => void }) {
  const t = useTranslations('frame');
  const [href, setHref] = useState('/admin');
  useEffect(() => {
    try {
      const v = sessionStorage.getItem(RETURN_KEY);
      if (v && v.startsWith('/')) setHref(v);
    } catch {
      // 위와 같음
    }
  }, []);
  return (
    <Link href={href} onClick={onLeave} aria-label={t('console.close')} title={t('console.close')} className="flex size-10 shrink-0 items-center justify-center rounded-chip text-muted hover:bg-surface hover:text-text">
      <X aria-hidden size={22} strokeWidth={1.75} />
    </Link>
  );
}
