// 「현재 근무 상황」 카드 — 관리자 홈 (의뢰인 2026-10-11: 시프티 홈처럼). 색 점 + 이름 + 인원수, 마지막으로 불러온 시각, 새로 고침, [자세히 보기](현황판).
// 근무중 · 무일정 · 간주근로 · 지각 · 휴가. 시프티의 「휴게」「조퇴」 칸은 기준이 정해지지 않아 없다 (결정 문서 알-2).
import { RefreshCw } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Card } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { resolveDayType } from '@/config/labor-rules';
import { workSituation } from '@/lib/home';
import { judgeLateness } from '@/lib/lateness';
import { isFullDayLeave } from '@/lib/leave';
import { daysFor, leaveDaysFor, loadPeriod } from '@/lib/period-data';

const DOT = { working: 'bg-ok', unscheduled: 'bg-warn', deemed: 'bg-text', late: 'bg-danger', leave: 'bg-primary' } as const;

export async function SituationCard({ today, now }: { today: string; now: Date }) {
  const [t, f, data] = await Promise.all([getTranslations('home.situation'), getFormatter(), loadPeriod(today, today, OFFICE.practiceMode)]);
  const people = data.people.filter((p) => p.active && !p.employeeNo?.startsWith('e2e-'));
  const rows = people.map((p) => {
    const real = data.events.some((e) => e.employeeId === p.id && e.workDate === today) || data.corrections.some((c) => c.employeeId === p.id && c.workDate === today && c.status === 'approved');
    const day = data.rule ? daysFor(data, p.id, today, today)[0] : undefined;
    const plan = data.planFor(p.id, today);
    const rule = data.ruleFor(p.id, today);
    const firstIn = real ? day?.pairs.map((x) => x.in).filter((x): x is Date => !!x).sort((a, b) => a.getTime() - b.getTime())[0] : undefined;
    const workday = !!rule && !!data.rule && resolveDayType(today, data.ruleAt(today) ?? data.rule, data.holidays) === 'workday';
    return {
      working: real && !!day?.pairs.some((x) => x.in && !x.out),
      hasPlan: plan.items.length > 0,
      deemed: !real && !!plan.deemed,
      late: !!firstIn && workday && !!rule && judgeLateness({ punchedAt: firstIn, workDate: today, rule, isHoliday: false }).verdict === 'late',
      onLeave: isFullDayLeave(leaveDaysFor(data, p.id).get(today)),
    };
  });
  const s = workSituation(rows);
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold">{t('title')}</h2>
        <span className="num text-sm text-muted">{t('people', { n: people.length })}</span>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
        {(['working', 'unscheduled', 'deemed', 'late', 'leave'] as const).map((k) => (
          <div key={k} className="flex min-h-9 items-center gap-2">
            <span aria-hidden className={`size-2.5 shrink-0 rounded-chip ${DOT[k]}`} />
            <dt className="flex-1 text-sm">{t(k)}</dt>
            <dd className="num font-bold">{s[k]}</dd>
          </div>
        ))}
      </dl>
      <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
        <Link href="/punch" aria-label={t('refresh')} className="num inline-flex min-h-11 items-center gap-2 text-sm text-muted">
          <RefreshCw aria-hidden size={16} strokeWidth={2} />
          {t('updated', { time: f.dateTime(now, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) })}
        </Link>
        <Link href="/admin" className="inline-flex min-h-11 items-center text-sm font-bold text-primary">
          {t('more')} ›
        </Link>
      </div>
    </Card>
  );
}
