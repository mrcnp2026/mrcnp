// 보기 범위 — 관리자가 같은 탭 안에서 「내 것 / 전체」를 오간다 (2026-10-10 의뢰인: 시프티의 「내 기록」 버튼처럼).
// 폰에서만 보인다 — PC는 왼쪽 메뉴에 두 화면이 따로 있다. 직원에게는 그리지 않는다(부르는 쪽이 관리자일 때만 넣는다).
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

const HREF = {
  requests: { mine: '/punch/corrections', all: '/admin/inbox' },
  schedule: { mine: '/punch/schedule', all: '/admin/schedule' },
  attendance: { mine: '/punch/records', all: '/admin/records' },
  leave: { mine: '/punch/leave', all: '/admin/leave' },
} as const;

export async function ScopeSwitch({ kind, current }: { kind: keyof typeof HREF; current: 'mine' | 'all' }) {
  const t = await getTranslations('nav.scope');
  return (
    <nav aria-label={t('label')} className="grid grid-cols-2 rounded-card bg-bg p-1 lg:hidden">
      {(['all', 'mine'] as const).map((k) => (
        <Link
          key={k}
          href={HREF[kind][k]}
          aria-current={current === k ? 'page' : undefined}
          className={`flex min-h-11 items-center justify-center rounded-button text-sm font-bold ${current === k ? 'bg-primary-tint text-primary' : 'text-muted'}`}
        >
          {t(`${kind}.${k}`)}
        </Link>
      ))}
    </nav>
  );
}
