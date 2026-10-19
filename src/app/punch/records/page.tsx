// 직원 「출퇴근기록」 — 내 근태현황 화면을 **주간 보기로 연다** (2026-10-16 의뢰인: 메뉴를 누르면 주간이 기본. 월간 달력은 위의 [주간 | 월간]으로 — 2026-10-15에는 월간이 기본이었다).
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
import { NoteBox } from '../NoteBox';
import { OFFICE } from '@/config/office';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';
import { companyProfile } from '@/lib/company';
import { ChevronDown } from 'lucide-react';

export default async function MyRecordsPage({ searchParams }: { searchParams: Promise<{ v?: string; d?: string; m?: string }> }) {
  const me = await getMe();
  if (!me) redirect('/login');
  const [t, tm, tc, ts, sp] = await Promise.all([getTranslations('myAtt'), getTranslations('common'), getTranslations('corrections'), getTranslations('schedule'), searchParams]);
  // 오늘 근무노트 — 홈에서 이리로 옮겼다 (2026-10-18 의뢰인: 매일 쓰는 칸이 아니라 첫 화면에 둘 필요가 없다). 비어 있으면 한 줄로 접혀 있다
  const policy = (await companyProfile()).policy.trim(); // 회사 근태 방침 — 맨 위 접힌 한 줄 (2026-10-18 의뢰인, 통합설정 › 회사 기본설정)
  const { data: notes } = await createAdminClient().from('work_notes').select('body').eq('employee_id', me.id).eq('work_date', toKstDate(new Date())).eq('is_test', OFFICE.practiceMode).order('created_at', { ascending: false }).limit(1);
  return (
    <PageShell wide>
      <MineBar menu={tm('menu')} title={t('title')} side={me.role === 'admin' ? { href: '/admin/records/list', label: t('allStaff') } : undefined} />
      {policy && (
        <details className="group rounded-card bg-bg px-4">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold">
            {t('policy')}
            <ChevronDown aria-hidden size={16} className="shrink-0 text-muted transition-transform group-open:rotate-180" />
          </summary>
          <p className="pb-3 text-sm whitespace-pre-wrap break-words text-muted">{policy}</p>
        </details>
      )}
      <MyAttendance
        me={me}
        sp={sp}
        base="/punch/records"
        defaultView="week"
        extra={
          <Link href="/punch/schedule/request" className="inline-flex min-h-9 items-center gap-1 font-semibold text-primary">
            <CalendarPlus aria-hidden size={16} />
            {ts('request')}
          </Link>
        }
      />
      <NoteBox initial={(notes?.[0]?.body as string | undefined) ?? null} />
      <Fab label={tc('title')} href="/punch/corrections?new=1" />
    </PageShell>
  );
}
