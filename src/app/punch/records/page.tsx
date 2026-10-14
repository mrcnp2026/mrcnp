// 직원 「출퇴근기록」 — 내 근태현황 화면을 월간 보기로 연다 (2026-10-15 의뢰인: 목록형이 아니라 달력 모양으로, `스샷/스샷2/근태1.png` · `근태2.png`).
// 화면 내용은 MyAttendance.tsx — 근무일정(/punch/schedule, 주간이 먼저)과 같은 화면이다.
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Fab } from '@/components/Fab';
import { MineBar } from '@/components/MineBar';
import { PageShell } from '@/components/ui';
import { getMe } from '@/lib/auth';
import { MyAttendance } from './MyAttendance';

export default async function MyRecordsPage({ searchParams }: { searchParams: Promise<{ v?: string; d?: string; m?: string }> }) {
  const me = await getMe();
  if (!me) redirect('/login');
  const [t, tm, tc, sp] = await Promise.all([getTranslations('myAtt'), getTranslations('common'), getTranslations('corrections'), searchParams]);
  return (
    <PageShell wide>
      <MineBar menu={tm('menu')} title={t('title')} side={me.role === 'admin' ? { href: '/admin/records/list', label: t('allStaff') } : undefined} />
      <MyAttendance me={me} sp={sp} base="/punch/records" defaultView="month" />
      <Fab label={tc('title')} href="/punch/corrections?new=1" />
    </PageShell>
  );
}
