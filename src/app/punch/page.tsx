// 직원 홈 (PWA 진입점, 부록 R-10-1): "오늘 근무" 카드 1장 + 큰 버튼 + 이번 주 막대 + 근무노트.
// 미기록 배너(7-8)는 게이트 7에서 카드 위에 붙는다. 직원 하단 탭은 두 번째 탭(내 기록)이 생길 때 만든다 (5장 규칙 3).
import { getFormatter, getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { SignOutButton } from '@/components/SignOutButton';
import { PageShell } from '@/components/ui';
import { LABOR } from '@/config/labor-rules';
import { OFFICE } from '@/config/office';
import { languageOptions } from '@/i18n/locales';
import { loadEmployeeToday } from '@/lib/attendance-data';
import { getMe } from '@/lib/auth';
import { kstDateTime } from '@/lib/time';
import { NoteBox } from './NoteBox';
import { TodayCard } from './TodayCard';
import { WeekBar } from './WeekBar';

export default async function PunchPage() {
  const me = await getMe();
  if (!me) redirect('/login');
  const t = await getTranslations('home');
  const f = await getFormatter();
  const today = await loadEmployeeToday(me.id, new Date());
  const hm = (time: string) => f.dateTime(kstDateTime(today.workDate, time), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

  return (
    <PageShell>
      <header className="flex items-center justify-between gap-2">
        <LanguageSwitcher options={languageOptions()} />
        <SignOutButton />
      </header>
      <p className="text-xl font-semibold">{t('hello', { name: me.name })}</p>

      <TodayCard
        dateLabel={f.dateTime(kstDateTime(today.workDate, '12:00'), { dateStyle: 'full' })}
        schedule={today.rule ? t('schedule', { start: hm(today.rule.startTime), end: hm(today.rule.endTime) }) : null}
        status={today.status}
        firstIn={today.firstIn}
        firstInVerified={today.firstInVerified}
        lastOut={today.lastOut}
        isOpen={today.isOpen}
        lateMinutes={today.lateMinutes}
        practice={today.practice}
      />

      <WeekBar
        week={today.week}
        regularHours={LABOR.weeklyRegularLimitMin / 60}
        limitHours={OFFICE.weeklyLimitHours}
      />

      <NoteBox initial={today.note?.body ?? null} />
    </PageShell>
  );
}
