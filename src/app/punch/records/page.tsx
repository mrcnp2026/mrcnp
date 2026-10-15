// 직원 「출퇴근기록」 — 내 근태현황 화면을 월간 보기로 연다 (2026-10-15 의뢰인: 목록형이 아니라 달력 모양으로, `스샷/스샷2/근태1.png` · `근태2.png`).
// 화면 내용은 MyAttendance.tsx. 직원 모드의 근무일정 메뉴는 없앴고(개발-37) 일정 요청 단추가 여기 있다. /punch/schedule은 주간 보기로 보낸다.
import { CalendarPlus } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Fab } from '@/components/Fab';
import { MineBar } from '@/components/MineBar';
import { PageShell } from '@/components/ui';
import { getMe } from '@/lib/auth';
import { MyAttendance } from './MyAttendance';

export default async function MyRecordsPage({ searchParams }: { searchParams: Promise<{ v?: string; d?: string; m?: string }> }) {
  const me = await getMe();
  if (!me) redirect('/login');
  const [t, tm, tc, ts, sp] = await Promise.all([getTranslations('myAtt'), getTranslations('common'), getTranslations('corrections'), getTranslations('schedule'), searchParams]);
  return (
    <PageShell wide>
      <MineBar menu={tm('menu')} title={t('title')} side={me.role === 'admin' ? { href: '/admin/records/list', label: t('allStaff') } : undefined} />
      <MyAttendance
        me={me}
        sp={sp}
        base="/punch/records"
        defaultView="month"
        extra={
          <Link href="/punch/schedule/request" className="inline-flex min-h-9 items-center gap-1 font-semibold text-primary">
            <CalendarPlus aria-hidden size={16} />
            {ts('request')}
          </Link>
        }
      />
      <Fab label={tc('title')} href="/punch/corrections?new=1" />
    </PageShell>
  );
}
