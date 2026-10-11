'use client';
// PC 상단 줄의 모드 전환 버튼 — 관리자이면서 직원인 사람이 두 모습을 오간다 (2026-10-11 의뢰인: 시프티처럼).
// 관리자 화면(/admin)에서는 [직원 모드로 전환] → 내 출퇴근 홈, 직원 화면(/punch)에서는 [관리자 모드로 전환] → 관리자 홈.
import { ArrowRightLeft } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function ModeSwitch({ toEmployee, toManager }: { toEmployee: string; toManager: string }) {
  const manager = usePathname().startsWith('/admin');
  return (
    <Link href={manager ? '/punch' : '/admin'} className="inline-flex min-h-8 items-center gap-1.5 rounded-button border border-border bg-bg px-3 text-sm font-medium whitespace-nowrap text-muted hover:bg-surface">
      <ArrowRightLeft aria-hidden size={16} strokeWidth={1.75} />
      {manager ? toEmployee : toManager}
    </Link>
  );
}
