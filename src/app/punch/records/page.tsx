// 직원 "내 기록" — 최근 14일. 정정된 기록은 원본과 함께 "정정됨"으로 보인다 (R-10-8: 기록 상태를 숨기지 않는다).
// 연장 확인 요청이 대기 중이면 사유를 적을 수 있다 (6장: 서버 API로만).
import { getFormatter, getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Card, Chip, PageShell } from '@/components/ui';
import { getMe } from '@/lib/auth';
import { loadEmployeeRecent } from '@/lib/employee-data';
import { ReasonForm } from './ReasonForm';

export default async function MyRecordsPage() {
  const me = await getMe();
  if (!me) redirect('/login');
  const t = await getTranslations('records');
  const th = await getTranslations('home');
  const f = await getFormatter();
  const r = await loadEmployeeRecent(me.id, new Date());
  const hm = (d: Date) => f.dateTime(d, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const dur = (min: number) => t('hm', { h: Math.floor(min / 60), m: min % 60 });
  const days = [...r.days].reverse().filter((d) => d.pairs.length > 0 || r.events.some((e) => e.workDate === d.workDate));

  return (
    <PageShell>
      <h1 className="text-2xl font-semibold text-primary-deep">{t('title')}</h1>
      {!r.hasRule && <p className="text-sm text-faint">{th('noRule')}</p>}
      {days.length === 0 && <p className="text-muted">{t('empty')}</p>}
      <ul className="flex flex-col gap-3">
        {days.map((d) => {
          const req = r.overtime.find((o) => o.workDate === d.workDate);
          const corrected = r.corrections.some((c) => c.workDate === d.workDate && c.status === 'approved');
          const pendingCorr = r.corrections.some((c) => c.workDate === d.workDate && c.status === 'pending');
          return (
            <li key={d.workDate}>
              <Card className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold">{f.dateTime(new Date(`${d.workDate}T12:00:00+09:00`), { month: 'short', day: 'numeric', weekday: 'short' })}</span>
                  <span className="num text-sm text-muted">{dur(d.netMinutes)}</span>
                </div>
                <p className="num text-sm">
                  {d.pairs.map((p, i) => (
                    <span key={i} className="mr-3 inline-block">
                      {p.in ? hm(p.in) : t('missingTime')} – {p.out ? hm(p.out) : t('missingTime')}
                    </span>
                  ))}
                </p>
                <div className="flex flex-wrap gap-2">
                  {corrected && <Chip tone="info">{t('corrected')}</Chip>}
                  {pendingCorr && <Chip>{t('correctionPending')}</Chip>}
                  {d.overtimeMinutes + d.holidayMinutes > 0 && (
                    <span className="num text-xs text-muted">{t('overtimeLine', { o: dur(d.overtimeMinutes), n: dur(d.nightMinutes), h: dur(d.holidayMinutes) })}</span>
                  )}
                  {req && <Chip tone={req.status === 'approved' ? 'ok' : req.status === 'rejected' ? 'neutral' : 'warn'}>{t(`overtime.${req.status}`)}</Chip>}
                </div>
                {req?.status === 'pending' && <ReasonForm id={req.id} initial={req.reason} />}
              </Card>
            </li>
          );
        })}
      </ul>
    </PageShell>
  );
}
