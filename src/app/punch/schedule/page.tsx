// 근무일정 — 내 일정 (의뢰인 2026-10-10 2단계: 시프티의 「근무일정 › 내 일정」처럼) — 이번 주와 다음 주, 날짜마다 내 일정.
// 그날 일정 = 날짜별로 넣은 일정(특근·잔업) → 없으면 평소 틀 → 없으면 회사 규칙. 하루 전부 휴가인 날은 「휴가」.
// 보기만 한다 — 일정을 바꿔 달라는 요청은 요청 통합(할일 7번) 때 붙인다.
import { Plane } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
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
    <PageShell wide>
      <MineBar menu={tm('menu')} title={t('title')} side={me.role === 'admin' ? { href: '/admin/schedule', label: t('mine') } : undefined} />
      <h1 className="sr-only px-1 lg:not-sr-only lg:text-2xl lg:font-extrabold lg:tracking-tight">{t('title')}</h1>
      {!data.rule && <p className="rounded-card bg-bg p-5 text-sm text-faint">{t('noRule')}</p>}
      {weeks.map((w, i) => (
        <section key={w[0].d} className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-medium text-muted">{t(i === 0 ? 'thisWeek' : 'nextWeek')}</h2>
            <p className="num text-sm text-muted">{t('planned', { h: Math.floor(total(w) / 60), m: total(w) % 60 })}</p>
          </div>
          {/* 전체 목록과 같은 모양 (2026-10-11 의뢰인: 시프티의 「내 일정」) — 날짜 머리줄(그날 계획) + 일정 한 건이 한 줄. 휴가는 비행기, 일정 없는 날은 흐린 한 줄 */}
          <div className="-mx-4 flex flex-col lg:mx-0">
            {w.map(({ d, off, items }) => {
              const planned = items.reduce((a, it) => a + spanMinutes(it), 0);
              return (
                <section key={d}>
                  <h3 className={`num flex items-center justify-between gap-2 border-b border-border px-5 py-3 font-bold ${d === today ? 'bg-primary-tint text-primary' : 'bg-surface'}`}>
                    <span>
                      {f.dateTime(kstDateTime(d, '12:00'), { month: 'long', day: 'numeric', weekday: 'short' })}
                      {d === today && <span className="ml-2 text-sm font-medium">{t('today')}</span>}
                    </span>
                    {!off && items.length > 0 && <span className="shrink-0 text-sm">{t('hm', { h: Math.floor(planned / 60), m: planned % 60 })}</span>}
                  </h3>
                  <ul className="divide-y divide-border border-b border-border bg-bg">
                    {off ? (
                      <li className="flex min-h-14 items-center gap-3 px-5">
                        <span className="flex w-14 shrink-0 justify-center">
                          <Plane aria-hidden size={20} className="text-primary" />
                        </span>
                        <span className="font-bold">{t('onLeave')}</span>
                      </li>
                    ) : items.length === 0 ? (
                      <li className="flex min-h-12 items-center px-5 text-sm text-faint">{t('none')}</li>
                    ) : (
                      items.map((it) => (
                        <li key={`${it.shiftId ?? it.source}${it.startTime}`} className="flex min-h-16 items-center gap-3 py-2 pr-4 pl-5">
                          <span className="num flex w-14 shrink-0 flex-col text-sm leading-snug">
                            <span className="font-semibold">{it.startTime}</span>
                            <span className="text-muted">{it.endTime}</span>
                          </span>
                          <span aria-hidden className={`w-1 shrink-0 self-stretch rounded-chip ${it.color ? SHIFT_COLOR_CLASS[it.color] : 'bg-border'}`} />
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate font-bold">{it.name ?? t('regular')}</span>
                            {it.note && <span className="truncate text-sm text-muted">{it.note}</span>}
                          </span>
                          {it.kind !== 'none' && <Chip tone={it.kind === 'holiday' ? 'warn' : 'info'}>{tk(it.kind)}</Chip>}
                        </li>
                      ))
                    )}
                  </ul>
                </section>
              );
            })}
          </div>
        </section>
      ))}
      <Link href="/punch/schedule/request" className="inline-flex min-h-11 items-center justify-center rounded-button border border-primary bg-bg px-4 text-sm font-bold text-primary">
        {t('request')}
      </Link>
      <p className="px-1 text-sm text-faint">{t('hint')}</p>
    </PageShell>
  );
}
