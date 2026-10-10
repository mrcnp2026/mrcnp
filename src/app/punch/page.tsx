// 직원 홈 (PWA 진입점, 부록 R-10-1): 날짜 → 미기록 배너 → "오늘 근무" 카드(큰 버튼) → 이번 주 막대 → 근무노트.
// 상단 바·하단 탭은 layout.tsx(components/AppFrame).
import { getFormatter, getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageShell } from '@/components/ui';
import { LABOR } from '@/config/labor-rules';
import { OFFICE } from '@/config/office';
import { loadEmployeeToday } from '@/lib/attendance-data';
import { getMe } from '@/lib/auth';
import { isPhoneUserAgent } from '@/lib/passkey';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadEmployeeRecent } from '@/lib/employee-data';
import { kstDateTime } from '@/lib/time';
import { loadWorkRequests } from '@/lib/work-data';
import { workStatusOn } from '@/lib/work-requests';
import { MissingBanner } from './MissingBanner';
import { NoteBox } from './NoteBox';
import { TodayCard } from './TodayCard';
import { WeekBar } from './WeekBar';

export default async function PunchPage() {
  const me = await getMe();
  if (!me) redirect('/login');
  const t = await getTranslations('home');
  const tw = await getTranslations('work');
  const f = await getFormatter();
  const now = new Date();
  const [today, recent, { data: key }] = await Promise.all([
    loadEmployeeToday(me.id, now),
    loadEmployeeRecent(me.id, now),
    // 출퇴근 기기 (등록한 1대). 없으면 홈의 버튼 자리에 등록 안내가 나온다
    createAdminClient().from('user_passkeys').select('credential_id, device_label').eq('employee_id', me.id).is('revoked_at', null).maybeSingle(),
  ]);
  const hm = (time: string) => f.dateTime(kstDateTime(today.workDate, time), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

  return (
      <PageShell wide>
        {/* 날짜 한 줄 — 인사말·내 계정·로그아웃은 왼쪽 위 메뉴로 옮겼다 (2026-10-10 의뢰인: 시프티처럼 간결하게) */}
        <p className="px-1 pt-1 text-sm text-muted">{f.dateTime(kstDateTime(today.workDate, '12:00'), { dateStyle: 'full' })}</p>

        {/* PC: 왼쪽 = 오늘 근무, 오른쪽 = 이번 주·근무노트 (2026-10-06 의뢰인) · 폰: 한 칸 */}
        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4">
        <div className="flex flex-col gap-3 lg:gap-4">
        <MissingBanner items={recent.missing} />

        <TodayCard
          schedule={today.rule ? t('schedule', { start: hm(today.rule.startTime), end: hm(today.rule.endTime) }) : null}
          endTime={today.rule ? hm(today.rule.endTime) : null}
          status={today.status}
          firstIn={today.firstIn}
          firstInVerified={today.firstInVerified}
          lastOut={today.lastOut}
          isOpen={today.isOpen}
          lateMinutes={today.lateMinutes}
          practice={today.practice}
          device={key ? { credentialId: key.credential_id, label: key.device_label } : null}
          phone={isPhoneUserAgent((await headers()).get('user-agent'))}
        />

        {/* 사무실 밖에서 찍혔는데 승인된 외근이 없으면 신청 안내 (②-3 7-11) */}
        {today.firstInVerified === false && !workStatusOn(today.workDate, me.id, await loadWorkRequests({ employeeId: me.id, from: today.workDate, to: today.workDate })) && (
          <Link href={`/punch/leave?workDate=${today.workDate}#work`} className="flex min-h-11 items-center justify-between gap-2 rounded-card border border-warn bg-warn-tint px-4 py-3 text-sm text-warn">
            <span>{tw('outsideHint')}</span>
            <span className="shrink-0 font-semibold">{tw('outsideLink')} ›</span>
          </Link>
        )}

        </div>
        <div className="flex flex-col gap-3 lg:gap-4">
        <WeekBar week={today.week} regularHours={LABOR.weeklyRegularLimitMin / 60} limitHours={OFFICE.weeklyLimitHours} />

        <NoteBox initial={today.note?.body ?? null} />
        </div>
        </div>

      </PageShell>
  );
}
