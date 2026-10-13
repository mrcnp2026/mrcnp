'use client';
// PC 직원 모드의 상단 탭 — 시프티 PC의 직원 모드에는 왼쪽 메뉴가 없고 상단 줄에 탭 네 개가 있다
// (2026-10-11 의뢰인 스샷 `스샷/직원모드 홈.png` · `직원모드 출퇴근기록.png` · `직원모드 요청내역.png` · `직원모드 메세지.png`).
// 지금 탭은 파란 글자 + 아래 파란 줄. 관리자 화면(/admin)에서는 보이지 않는다(그쪽은 왼쪽 메뉴).
import Link, { useLinkStatus } from 'next/link';
import { usePressedTab } from './NavTab';

const TABS: { href: string; key: string; also: string[] }[] = [
  { href: '/punch', key: 'tSchedule', also: ['/punch/schedule', '/punch/leave', '/punch/home-settings'] },
  { href: '/punch/records', key: 'tRecords', also: ['/punch/corrections'] },
  { href: '/punch/requests', key: 'tRequests', also: [] },
  { href: '/punch/notices', key: 'tMessages', also: [] },
  { href: '/punch/payslips', key: 'tPayslips', also: [] },
];

function Loading() {
  const { pending } = useLinkStatus();
  return <span aria-hidden className={`absolute inset-x-0 bottom-0 h-0.5 bg-primary ${pending ? 'opacity-60' : 'opacity-0'}`} />;
}

export function StaffTabs({ labels }: { labels: Record<string, string> }) {
  const { path, pressed, setPressed } = usePressedTab();
  if (path.startsWith('/admin')) return null;
  const here = TABS.find((x) => x.href !== '/punch' && (path === x.href || path.startsWith(`${x.href}/`) || x.also.some((a) => path === a || path.startsWith(`${a}/`))))?.href ?? (path.startsWith('/punch/account') ? null : '/punch');
  const active = pressed ?? here;
  return (
    <nav aria-label={labels.menu} className="ml-16 flex h-full items-stretch">
      {TABS.map((x) => {
        const on = active === x.href;
        return (
          <Link key={x.href} href={x.href} aria-current={on ? 'page' : undefined} onClick={() => setPressed(x.href)} className={`relative flex items-center px-5 text-sm font-bold whitespace-nowrap ${on ? 'border-b-2 border-primary text-primary' : 'border-b-2 border-transparent text-text hover:text-primary'}`}>
            {labels[x.key]}
            <Loading />
          </Link>
        );
      })}
    </nav>
  );
}
