// 직원 「근무일정」 — 내 근태현황 화면을 주간 보기로 연다 (2026-10-15 의뢰인: 목록형이 아니라 주 · 월 달력 모양으로, `스샷/스샷2/근태1.png` · `근태2.png`).
// 화면 내용은 records/MyAttendance.tsx — 출퇴근기록(월간이 먼저)과 같은 화면이다. 앞날 칸에는 그날 일정(시각)이 흐리게 보인다.
import { CalendarPlus } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MineBar } from '@/components/MineBar';
import { PageShell } from '@/components/ui';
import { getMe } from '@/lib/auth';
import { MyAttendance } from '../records/MyAttendance';

export default async function MySchedulePage({ searchParams }: { searchParams: Promise<{ v?: string; d?: string; m?: string }> }) {
  const me = await getMe();
  if (!me) redirect('/login');
  const [t, ts, tm, sp] = await Promise.all([getTranslations('myAtt'), getTranslations('schedule'), getTranslations('common'), searchParams]);
  return (
    <PageShell wide>
      <MineBar menu={tm('menu')} title={ts('title')} side={me.role === 'admin' ? { href: '/admin/schedule', label: t('allStaff') } : undefined} />
      <MyAttendance
        me={me}
        sp={sp}
        base="/punch/schedule"
        defaultView="week"
        extra={
          <Link href="/punch/schedule/request" className="inline-flex min-h-9 items-center gap-1 font-semibold text-primary">
            <CalendarPlus aria-hidden size={16} />
            {ts('request')}
          </Link>
        }
      />
    </PageShell>
  );
}
