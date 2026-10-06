// 직원 홈 (PWA 진입점, 부록 R-10-1): 상단 바 → 인사 + 지금 시각 → 미기록 배너 → "오늘 근무" 카드(큰 버튼) → 이번 주 막대 → 근무노트.
// 하단 탭은 layout.tsx.
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { Bell, LayoutDashboard, UserRound } from 'lucide-react';
import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AddToHomeIcon } from '@/components/AddToHome';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { SignOutButton } from '@/components/SignOutButton';
import { TopBar } from '@/components/TopBar';
import { PageShell } from '@/components/ui';
import { LABOR } from '@/config/labor-rules';
import { OFFICE } from '@/config/office';
import { languageOptions } from '@/i18n/locales';
import { loadEmployeeToday } from '@/lib/attendance-data';
import { getMe } from '@/lib/auth';
import { isPhoneUserAgent } from '@/lib/passkey';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadEmployeeRecent } from '@/lib/employee-data';
import { visibleNoticesNow } from '@/lib/notices';
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
  const tc = await getTranslations('common');
  const f = await getFormatter();
  const now = new Date();
  const [today, recent, notices, { data: key }] = await Promise.all([
    loadEmployeeToday(me.id, now),
    loadEmployeeRecent(me.id, now),
    visibleNoticesNow(me.id, await getLocale()),
    // 출퇴근 기기 (등록한 1대). 없으면 홈의 버튼 자리에 등록 안내가 나온다
    createAdminClient().from('user_passkeys').select('credential_id, device_label').eq('employee_id', me.id).is('revoked_at', null).maybeSingle(),
  ]);
  const unread = notices.filter((n) => !n.confirmed).length;
  const hm = (time: string) => f.dateTime(kstDateTime(today.workDate, time), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

  return (
    <>
      <TopBar
        right={
          <>
            {me.role === 'admin' && (
              <Link href="/admin" aria-label={t('toAdmin')} className="flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-button text-sm font-semibold text-primary">
                <LayoutDashboard aria-hidden size={18} strokeWidth={1.75} />
                <span className="hidden sm:inline">{t('toAdmin')}</span>
              </Link>
            )}
            <Link href="/punch/notices" aria-label={t('notices', { n: unread })} className="relative flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-button text-primary">
              <Bell aria-hidden size={20} strokeWidth={1.75} />
              {unread > 0 && (
                <span className="num absolute top-0.5 right-0.5 flex min-w-5 items-center justify-center rounded-chip bg-primary px-1 text-xs leading-5 font-semibold text-on-primary">{unread}</span>
              )}
            </Link>
            <AddToHomeIcon />
            <LanguageSwitcher options={languageOptions()} />
          </>
        }
      />
      <PageShell>
        {/* 인사 — 토스풍: 날짜는 작게, 인사는 두 줄로 크게 (2026-10-02 의뢰인 선택 시안) */}
        <section className="px-1 pt-2 pb-2">
          <p className="text-sm text-muted">{f.dateTime(kstDateTime(today.workDate, '12:00'), { dateStyle: 'full' })}</p>
          <h1 className="mt-1 text-2xl leading-snug font-extrabold tracking-tight">
            {t('helloName', { name: me.name })}
            <br />
            {t(today.status === 'off' ? 'greetOff' : today.isOpen ? 'greetWorking' : today.lastOut ? 'greetDone' : 'greetBefore')}
          </h1>
        </section>

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

        <WeekBar week={today.week} regularHours={LABOR.weeklyRegularLimitMin / 60} limitHours={OFFICE.weeklyLimitHours} />

        <NoteBox initial={today.note?.body ?? null} />

        <Link href="/punch/account" className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-button border border-border bg-bg px-4 text-sm text-muted">
          <UserRound aria-hidden size={18} strokeWidth={1.75} />
          {tc('account')}
        </Link>
        <SignOutButton />
      </PageShell>
    </>
  );
}
