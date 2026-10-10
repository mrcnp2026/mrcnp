// 휴가 한 건의 상세 (2026-10-11 의뢰인: 시프티의 휴가 상세처럼) — 큰 제목(휴가 종류) · 기간 → 「항목 — 값」 줄(직원 · 유급 시간 · 차감 일수 · 생성일자).
// 보여 주기만 한다. 승인·거절은 요청함에서, 승인 취소는 「연차 관리」의 승인된 휴가에서 한다.
// 유급 시간 = 유급 종류면 일수 × 8시간 (lib/leave DAY_HOURS), 무급이면 0. 차감 일수 = 잔여에서 빼는 종류면 일수, 아니면 0.
import { getFormatter, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { DetailBar, Field, FieldList } from '@/components/detail';
import { Chip, PageShell } from '@/components/ui';
import { DAY_HOURS, leaveTypeName } from '@/lib/leave';
import { loadAllLeaveTypes, loadLeaveRequests } from '@/lib/leave-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { kstDateTime } from '@/lib/time';

export default async function LeaveDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [t, tl, ts, f, { id }] = await Promise.all([getTranslations('admin.leaveDetail'), getTranslations('leave'), getTranslations('requests.status'), getFormatter(), params]);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [live, test, types, { data: staff }] = await Promise.all([loadLeaveRequests({ practice: false }), loadLeaveRequests({ practice: true }), loadAllLeaveTypes(), createAdminClient().from('profiles').select('id, name')]);
  const r = [...live, ...test].find((x) => x.id === id);
  if (!r) notFound();
  const type = types.find((x) => x.code === r.typeCode);
  const names = new Map((staff ?? []).map((p) => [p.id as string, p.name as string]));
  const n = (v: number) => f.number(v, { maximumFractionDigits: 4 });
  const day = (d: string) => f.dateTime(kstDateTime(d, '12:00'), { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
  const stamp = (iso: string) => f.dateTime(new Date(iso), { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });

  return (
    <PageShell>
      <DetailBar back="/admin/leave" backLabel={t('back')} title={t('title')} />
      <section className="-mx-4 -mt-3 flex flex-col gap-1 border-b border-border bg-bg px-5 py-5 lg:mx-0 lg:mt-0 lg:rounded-card lg:border">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xl font-extrabold tracking-tight">
          <span>{leaveTypeName(types, r.typeCode, tl)}</span>
          <Chip tone={r.status === 'approved' ? 'ok' : r.status === 'pending' ? 'warn' : 'neutral'}>{ts(r.status)}</Chip>
        </p>
        <p className="num text-muted">
          {r.startDate === r.endDate ? day(r.startDate) : `${day(r.startDate)} ~ ${day(r.endDate)}`}
          {r.startTime && ` ${r.startTime} - ${r.endTime}`}
        </p>
      </section>
      <FieldList>
        <Field label={t('employee')} value={names.get(r.employeeId) ?? t('none')} href={`/admin/members/${r.employeeId}`} />
        <Field label={t('group')} value={type?.groupName ?? t('none')} />
        <Field label={t('paidHours')} value={t('hours', { n: n(type?.isPaid ? r.days * DAY_HOURS : 0) })} />
        <Field label={t('deductDays')} value={tl('days', { n: n(type?.deductsBalance ? r.days : 0) })} />
      </FieldList>
      <FieldList>
        <Field label={t('reason')} value={r.reason ?? t('none')} />
        <Field label={t('decidedBy')} value={r.approvedBy ? `${names.get(r.approvedBy) ?? ''}${r.decidedAt ? ` | ${stamp(r.decidedAt)}` : ''}` : t('none')} />
        <Field label={t('created')} value={r.createdAt ? stamp(r.createdAt) : t('none')} />
      </FieldList>
      <p className="px-1 text-sm text-faint">{t('hint')}</p>
    </PageShell>
  );
}
