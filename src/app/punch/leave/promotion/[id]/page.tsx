// 연차 사용 계획 (직원) — 회사가 보낸 안내를 읽고, 남은 연차를 언제 쓸지 적어 낸다 (PRD v1.3 37.3). 통지받은 본인만 열 수 있다.
// 계획을 낸다고 휴가가 신청되지는 않는다 — 실제 휴가는 휴가 화면에서 따로 신청한다.
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { NoticeBody } from '@/components/NoticeBody';
import { Card, CardTitle, Chip, PageShell } from '@/components/ui';
import { PlanForm } from '@/app/admin/leave/promotion/PromotionForms';
import { getMe } from '@/lib/auth';
import { minutesToDays } from '@/lib/leave-ledger';
import { loadMyTarget } from '@/lib/leave-promotion';
import { toKstDate } from '@/lib/time';

export default async function MyPromotionPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getMe();
  if (!me) redirect('/login');
  const [t, { id }] = await Promise.all([getTranslations('promotionPlan'), params]);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  const x = await loadMyTarget(id, me.id);
  if (!x) notFound();
  const { campaign: c, target: v } = x;
  const open = c.state === 'SENT' && (v.state === 'NOTIFIED' || v.state === 'PLAN_SUBMITTED');
  return (
    <PageShell>
      <Link href="/punch/leave" className="inline-flex min-h-9 items-center self-start text-sm font-medium text-muted">
        ‹ {t('back')}
      </Link>
      <div>
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold">
          {c.title}
          <Chip tone={v.state === 'CONFIRMED' ? 'ok' : v.state === 'PLAN_SUBMITTED' ? 'info' : 'warn'}>{t(`state.${v.state}`)}</Chip>
        </h1>
        <p className="num pt-1 text-sm text-faint">{t('meta', { n: minutesToDays(v.remainingMinutes), basis: c.basisOn, due: c.planDueOn })}</p>
      </div>
      <Card className="flex flex-col gap-3">
        <CardTitle>{t('noticeTitle')}</CardTitle>
        <NoticeBody text={c.noticeBody} />
      </Card>
      <Card className="flex flex-col gap-3">
        <CardTitle>{t('planTitle')}</CardTitle>
        {v.plan && <p className="num text-sm text-muted">{t('planNow', { n: v.planVersion, at: v.planSubmittedAt ? toKstDate(new Date(v.planSubmittedAt)) : '', dates: v.plan.dates.join(', ') })}</p>}
        {open ? <PlanForm targetId={v.id} dates={v.plan?.dates ?? []} note={v.plan?.note ?? null} min={c.basisOn} /> : <p className="text-sm text-faint">{t('closed')}</p>}
        {v.decisionNote && <p className="text-sm text-muted">{t('decision', { note: v.decisionNote })}</p>}
      </Card>
      <Link href="/punch/leave?new=leave" className="inline-flex min-h-11 items-center self-start rounded-button bg-primary px-4 font-bold text-on-primary">
        {t('toLeave')}
      </Link>
    </PageShell>
  );
}
