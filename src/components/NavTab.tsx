'use client';
// 하단 탭(직원·관리자 공용) — 누르는 즉시 반응이 보이게 (2026-10-02 의뢰인: "눌러도 아무 작동을 안 하는 것처럼 보인다").
// ① 누르는 순간 그 탭이 선택된 모양 (부모가 "방금 누른 탭"을 기억했다가 화면이 바뀌면 지운다 — 두 탭이 동시에 켜지지 않게)
// ② 다음 화면을 불러오는 동안 아이콘 아래 작은 막대 (useLinkStatus)
// 움직임은 150ms 이내 색·투명도만 (R-10-8), 움직임 줄이기 설정이면 globals.css가 끈다.
import type { LucideIcon } from 'lucide-react';
import Link, { useLinkStatus } from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

function Pending() {
  const { pending } = useLinkStatus();
  return <span aria-hidden className={`h-0.5 w-6 rounded-chip bg-primary ${pending ? 'opacity-100' : 'opacity-0'}`} />;
}

/** 방금 누른 탭 — 화면 주소가 바뀌면 지운다 */
export function usePressedTab() {
  const path = usePathname();
  const [pressed, setPressed] = useState<string | null>(null);
  useEffect(() => setPressed(null), [path]);
  return { path, pressed, setPressed };
}

export function NavTab({
  href,
  label,
  icon: Icon,
  active,
  onPress,
  badge,
  wideRow = false,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  onPress: () => void;
  badge?: ReactNode;
  wideRow?: boolean; // 넓은 화면 왼쪽 메뉴 모양 (관리자)
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      onClick={onPress}
      className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs ${
        wideRow ? 'lg:flex-row lg:justify-start lg:gap-2 lg:rounded-button lg:px-3 lg:text-base' : ''
      } ${active ? `font-semibold text-primary-deep ${wideRow ? 'lg:bg-primary-tint' : ''}` : 'text-muted'}`}
    >
      <span className="relative">
        <Icon aria-hidden size={22} strokeWidth={active ? 2.25 : 1.75} />
        {badge}
      </span>
      <span>{label}</span>
      <Pending />
    </Link>
  );
}
