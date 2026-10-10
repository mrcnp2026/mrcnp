// 근무일정 — 내 일정 (의뢰인 2026-10-10 2단계: 시프티의 「근무일정 › 내 일정」처럼) — 이번 주와 다음 주, 날짜마다 내 일정.
// 그날 일정 = 날짜별로 넣은 일정(특근·잔업) → 없으면 평소 틀 → 없으면 회사 규칙. 하루 전부 휴가인 날은 「휴가」.
// 보기만 한다 — 일정을 바꿔 달라는 요청은 요청 통합(할일 7번) 때 붙인다.
import { Plane } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { RowList } from '@/components/list';
import { MineBar } from '@/components/MineBar';
import { Chip, PageShell } from '@/components/ui';
import { getMe } from '@/lib/auth';
import { addDays, weekStartOf } from '@/lib/calendar';
import { isFullDayLeave } from '@/lib/leave';
import { leaveDaysFor, loadPeriod } from '@/lib/period-data';
import { SHIFT_COLOR_CLASS, spanMinutes } from '@/lib/shifts';
import { kstDateTime, toKstDate } from '@/lib/time';

export default async function MySchedulePage() {
  const me = await getMe();
  if (!me) redirect('/login');
  const [t, tk, tm, f] = await Promise.all([getTranslations('schedule'), getTranslations('admin.shifts.kinds'), getTranslations('common'), getFormatter()]);
  const today = toKstDate(new Date());
  const from = weekStartOf(today);
  const to = addDays(from, 13);
  const data = await loadPeriod(from, to);
  const leave = leaveDaysFor(data, me.id);
  const days = [...Array(14)].map((_, i) => addDays(from, i)).map((d) => ({ d, off: isFullDayLeave(leave.get(d)), items: data.planFor(me.id, d).items }));
  const weeks = [days.slice(0, 7), days.slice(7)];
  const total = (w: typeof days) => w.filter((x) => !x.off).reduce((a, x) => a + x.items.reduce((b, it) => b + spanMinutes(it), 0), 0);

  return (
    <PageShell>
      <MineBar menu={tm('menu')} title={t('title')} side={me.role === 'admin' ? { href: '/admin/schedule', label: t('mine') } : undefined} />
      <h1 className="sr-only px-1 lg:not-sr-only lg:text-2xl lg:font-extrabold lg:tracking-tight">{t('title')}</h1>
      {!data.rule && <p className="rounded-card bg-bg p-5 text-sm text-faint">{t('noRule')}</p>}
      {weeks.map((w, i) => (
        <section key={w[0].d} className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-medium text-muted">{t(i === 0 ? 'thisWeek' : 'nextWeek')}</h2>
            <p className="num text-sm text-muted">{t('planned', { h: Math.floor(total(w) / 60), m: total(w) % 60 })}</p>
          </div>
          <RowList>
            {w.map(({ d, off, items }) => (
              <li key={d} className={`flex min-h-14 items-center gap-3 px-5 py-2 ${d === today ? 'bg-primary-tint' : ''}`}>
                <span className={`num w-20 shrink-0 text-sm font-semibold ${d === today ? 'text-primary' : ''}`}>{f.dateTime(kstDateTime(d, '12:00'), { month: 'numeric', day: 'numeric', weekday: 'short' })}</span>
                {off ? (
                  <span className="flex items-center gap-2 text-sm text-muted">
                    <Plane aria-hidden size={18} className="text-primary" />
                    {t('onLeave')}
                  </span>
                ) : items.length === 0 ? (
                  <span className="text-sm text-faint">{t('none')}</span>
                ) : (
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    {items.map((it) => (
                      <span key={`${it.shiftId ?? it.source}${it.startTime}`} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span aria-hidden className={`h-5 w-1 shrink-0 rounded-chip ${it.color ? SHIFT_COLOR_CLASS[it.color] : 'bg-border'}`} />
                        <span className="num font-bold whitespace-nowrap">
                          {it.startTime} - {it.endTime}
                        </span>
                        {it.name && <span className="min-w-0 truncate text-sm text-muted">{it.name}</span>}
                        {it.kind !== 'none' && <Chip tone={it.kind === 'holiday' ? 'warn' : 'info'}>{tk(it.kind)}</Chip>}
                      </span>
                    ))}
                  </span>
                )}
              </li>
            ))}
          </RowList>
        </section>
      ))}
      <p className="px-1 text-sm text-faint">{t('hint')}</p>
    </PageShell>
  );
}
