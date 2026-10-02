// 직원 홈 (PWA 진입점, 부록 R-10-1): 상단 바 → 인사 + 지금 시각 → 미기록 배너 → "오늘 근무" 카드(큰 버튼) → 이번 주 막대 → 근무노트.
// 하단 탭은 layout.tsx.
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { Bell, LayoutDashboard } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AddToHomeIcon } from '@/components/AddToHome';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { LiveClock } from '@/components/LiveClock';
import { SignOutButton } from '@/components/SignOutButton';
import { TopBar } from '@/components/TopBar';
import { PageShell } from '@/components/ui';
import { LABOR } from '@/config/labor-rules';
import { OFFICE } from '@/config/office';
import { languageOptions } from '@/i18n/locales';
import { loadEmployeeToday } from '@/lib/attendance-data';
import { getMe } from '@/lib/auth';
import { loadEmployeeRecent } from '@/lib/employee-data';
import { visibleNoticesFor } from '@/lib/notices';
import { kstDateTime } from '@/lib/time';
import { MissingBanner } from './MissingBanner';
import { NoteBox } from './NoteBox';
import { TodayCard } from './TodayCard';
import { WeekBar } from './WeekBar';

export default async function PunchPage() {
  const me = await getMe();
  if (!me) redirect('/login');
  const t = await getTranslations('home');
  const f = await getFormatter();
  const now = new Date();
  const [today, recent, notices] = await Promise.all([loadEmployeeToday(me.id, now), loadEmployeeRecent(me.id, now), visibleNoticesFor(me.id, await getLocale(), now)]);
  const unread = notices.filter((n) => !n.confirmed).length;
  const hm = (time: string) => f.dateTime(kstDateTime(today.workDate, time), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

  return (
    <>
      <TopBar
        variant="mark"
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
        <section className="flex items-end justify-between gap-2 px-1">
          <div className="min-w-0">
            <p className="text-sm text-muted">{f.dateTime(kstDateTime(today.workDate, '12:00'), { dateStyle: 'full' })}</p>
            <p className="text-xl font-semibold text-primary-deep">{t('hello', { name: me.name })}</p>
          </div>
          <p className="shrink-0 text-3xl font-bold text-primary-deep" aria-label={t('now')}>
            <LiveClock initial={now.toISOString()} />
          </p>
        </section>

        <MissingBanner items={recent.missing} />

        <TodayCard
          schedule={today.rule ? t('schedule', { start: hm(today.rule.startTime), end: hm(today.rule.endTime) }) : null}
          status={today.status}
          firstIn={today.firstIn}
          firstInVerified={today.firstInVerified}
          lastOut={today.lastOut}
          isOpen={today.isOpen}
          lateMinutes={today.lateMinutes}
          practice={today.practice}
        />

        <WeekBar week={today.week} regularHours={LABOR.weeklyRegularLimitMin / 60} limitHours={OFFICE.weeklyLimitHours} />

        <NoteBox initial={today.note?.body ?? null} />

        <SignOutButton />
      </PageShell>
    </>
  );
}
