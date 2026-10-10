// 근무일정 생성 요청 (의뢰인 2026-10-11: 시프티의 「근무일정 요청」처럼) — 직원이 특근·잔업·하루만 다른 시각을 요청하고 관리자가 승인하면 일정이 된다.
// 위: 양식. 아래: 대기 중인 내 요청(취소할 수 있다). 처리된 것은 「요청」 탭의 목록에 나온다.
import { getFormatter, getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { DetailBar } from '@/components/detail';
import { Card, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { getMe } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { kstDateTime, toKstDate } from '@/lib/time';
import { CancelShiftRequest, ShiftRequestForm } from './ShiftRequestForm';

export default async function ShiftRequestPage() {
  const me = await getMe();
  if (!me) redirect('/login');
  const [t, f] = await Promise.all([getTranslations('scheduleRequest'), getFormatter()]);
  const db = createAdminClient();
  const [{ data: tpl }, { data: mine }] = await Promise.all([
    db.from('shift_templates').select('id, name, start_time, end_time, kind').eq('active', true).order('name'),
    db.from('shift_requests').select('id, work_date, start_time, end_time, reason').eq('employee_id', me.id).eq('status', 'pending').eq('is_test', OFFICE.practiceMode).order('work_date'),
  ]);
  const templates = (tpl ?? []).filter((x) => x.kind !== 'deemed' && !(x.name as string).startsWith('e2e-')).map((x) => ({ id: x.id as string, name: x.name as string, startTime: (x.start_time as string).slice(0, 5), endTime: (x.end_time as string).slice(0, 5), kind: x.kind as string }));
  return (
    <PageShell>
      <DetailBar back="/punch/requests" backLabel={t('back')} title={t('title')} />
      <Card className="flex flex-col gap-3">
        <p className="text-sm text-muted">{t('intro')}</p>
        <ShiftRequestForm today={toKstDate(new Date())} templates={templates} />
      </Card>
      {(mine ?? []).length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="px-1 font-bold">{t('pending')}</h2>
          <ul className="-mx-4 divide-y divide-border border-y border-border bg-bg lg:mx-0 lg:rounded-card lg:border">
            {(mine ?? []).map((r) => (
              <li key={r.id} className="flex min-h-16 items-center gap-3 px-5 py-2">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="num font-bold">
                    {f.dateTime(kstDateTime(r.work_date, '12:00'), { month: 'numeric', day: 'numeric', weekday: 'short' })} {(r.start_time as string).slice(0, 5)} - {(r.end_time as string).slice(0, 5)}
                  </span>
                  {r.reason && <span className="truncate text-sm text-muted">{r.reason}</span>}
                </span>
                <CancelShiftRequest id={r.id} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </PageShell>
  );
}
