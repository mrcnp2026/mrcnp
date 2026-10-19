// 연차 사용 촉진 한 건 (관리자) — 안내문, 대상마다 잔여 · 통지 · 읽음 · 사용 계획 · 처리 (PRD v1.3 37.3).
import { getFormatter, getTranslations } from 'next-intl/server';
import { WarnLine } from '@/components/listframe';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { NoticeBody } from '@/components/NoticeBody';
import { Card, CardTitle, Chip, PageShell } from '@/components/ui';
import { minutesToDays } from '@/lib/leave-ledger';
import { loadCampaign } from '@/lib/leave-promotion';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';
import { CampaignActions, SecondNotice, TargetControls } from '../PromotionForms';
import { promotionSchedule, scheduleWarnings } from '@/lib/leave-promotion-schedule';

const TONE = { CANDIDATE: 'neutral', EXCLUDED: 'neutral', NOTIFIED: 'warn', PLAN_SUBMITTED: 'info', CONFIRMED: 'ok', EXCEPTION: 'warn', DESIGNATED: 'info' } as const;

export default async function PromotionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [t, f, { id }] = await Promise.all([getTranslations('admin.promotion'), getFormatter(), params]);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  const x = await loadCampaign(id);
  if (!x) notFound();
  const { campaign: c, targets } = x;
  const db = createAdminClient();
  const msgIds = targets.map((v) => v.messageId).filter((v): v is string => !!v);
  const [{ data: staff }, { data: reads }] = await Promise.all([
    db.from('profiles').select('id, name'),
    msgIds.length ? db.from('work_message_recipients').select('message_id, read_at').in('message_id', msgIds) : Promise.resolve({ data: [] as { message_id: string; read_at: string | null }[] }),
  ]);
  const names = new Map((staff ?? []).map((p) => [p.id as string, p.name as string]));
  const readAt = new Map((reads ?? []).map((r) => [r.message_id as string, r.read_at as string | null]));
  const stamp = (iso: string) => f.dateTime(new Date(iso), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const rows = [...targets].sort((a, b) => (names.get(a.employeeId) ?? '').localeCompare(names.get(b.employeeId) ?? ''));
  const count = (s: string) => targets.filter((v) => v.state === s).length;
  // 법정 기간 (2026-10-19, 묶음 30) — 만들 때 사용기간 끝나는 날을 넣은 촉진만
  const today = toKstDate(new Date());
  const sched = c.periodEnd && c.leaveKind ? promotionSchedule(c.periodEnd, c.leaveKind) : null;
  const firstSent = c.sentAt ? toKstDate(new Date(c.sentAt)) : null;
  const lastSecond = targets.map((v) => v.secondNotifiedAt).filter((x): x is string => !!x).sort().at(-1);
  const warns = sched ? scheduleWarnings(sched, { firstSentOn: firstSent, secondSentOn: lastSecond ? toKstDate(new Date(lastSecond)) : null }) : [];
  const secondDue = c.state === 'SENT' && today > c.planDueOn ? targets.filter((v) => (v.state === 'NOTIFIED' || v.state === 'EXCEPTION') && !v.secondMessageId).length : 0;

  return (
    <PageShell wide>
      <Link href="/admin/leave/promotion" className="inline-flex min-h-9 items-center self-start text-sm font-medium text-muted">
        ‹ {t('title')}
      </Link>
      <div>
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold">
          {c.title}
          <Chip tone={c.state === 'CLOSED' ? 'ok' : c.state === 'SENT' ? 'info' : 'neutral'}>{t(`state.${c.state}`)}</Chip>
        </h1>
        <p className="num pt-1 text-sm text-faint">{t('meta', { basis: c.basisOn, due: c.planDueOn })}{c.sentAt && ` · ${t('sentOn', { date: toKstDate(new Date(c.sentAt)) })}`}</p>
      </div>
      <WarnLine short={t('legalShort')}>{t('legal')}</WarnLine>
      {sched && (
        <Card className="flex flex-col gap-1 text-sm">
          <CardTitle>{t('scheduleTitle', { kind: t(`kind.${c.leaveKind}`), end: c.periodEnd ?? '' })}</CardTitle>
          <p className="num">{t('schedule', { from: sched.firstFrom, to: sched.firstTo, second: sched.secondBy })}</p>
          {warns.map((w) => (
            <p key={w} className="text-warn">{t(`warn.${w}`)}</p>
          ))}
          {secondDue > 0 && <p className="font-semibold text-warn">{t('secondDue', { n: secondDue, by: sched.secondBy })}</p>}
        </Card>
      )}
      <Card className="flex flex-col gap-3">
        <CardTitle>{t('noticeTitle')}</CardTitle>
        <NoticeBody text={c.noticeBody} />
        {c.policyNote && <p className="text-sm text-muted">{t('policyNote', { note: c.policyNote })}</p>}
        <p className="num text-sm">{t('summary', { candidate: count('CANDIDATE'), excluded: count('EXCLUDED'), notified: count('NOTIFIED'), plan: count('PLAN_SUBMITTED'), confirmed: count('CONFIRMED'), exception: count('EXCEPTION') })}</p>
        <CampaignActions id={c.id} state={c.state} candidates={count('CANDIDATE')} />
      </Card>
      <div className="overflow-x-auto table-ruled">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface text-left">
              {['colName', 'colRemaining', 'colTarget', 'colNotified', 'colRead', 'colPlan', 'colManage'].map((k) => (
                <th key={k} scope="col" className="px-3 py-2.5 text-xs font-semibold whitespace-nowrap text-muted">
                  {t(k)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v.id} className="border-b border-border align-top">
                <td className="px-3 py-3 font-bold whitespace-nowrap">{names.get(v.employeeId) ?? ''}</td>
                <td className="num px-3 py-3 whitespace-nowrap">{t('days', { n: Math.round(minutesToDays(v.remainingMinutes) * 100) / 100 })}</td>
                <td className="px-3 py-3">
                  <Chip tone={TONE[v.state]}>{t(`target.${v.state}`)}</Chip>
                  {v.excludeReason && <span className="block pt-1 text-xs text-muted">{v.excludeReason}</span>}
                  {v.decisionNote && <span className="block pt-1 text-xs text-muted">{v.decisionNote}</span>}
                </td>
                <td className="num px-3 py-3 whitespace-nowrap">{v.notifiedAt ? stamp(v.notifiedAt) : ''}</td>
                <td className="num px-3 py-3 whitespace-nowrap">
                  {v.messageId ? (
                    <Link href={`/admin/messages/${v.messageId}`} className="text-primary underline">
                      {readAt.get(v.messageId) ? stamp(readAt.get(v.messageId)!) : t('notRead')}
                    </Link>
                  ) : (
                    ''
                  )}
                </td>
                <td className="num px-3 py-3">
                  {v.designated && (
                    <span className="flex flex-col gap-1 pb-1">
                      <span className="font-semibold">{t('designated', { dates: v.designated.join(', ') })}</span>
                      {v.secondNotifiedAt && <span className="text-xs text-faint">{t('secondSent', { at: stamp(v.secondNotifiedAt) })}</span>}
                    </span>
                  )}
                  {v.plan ? (
                    <span className="flex flex-col gap-1">
                      <span>{v.plan.dates.join(', ')}</span>
                      {v.plan.note && <span className="text-xs text-muted">{v.plan.note}</span>}
                      <span className="text-xs text-faint">{t('planMeta', { n: v.planVersion, at: v.planSubmittedAt ? stamp(v.planSubmittedAt) : '' })}</span>
                    </span>
                  ) : (
                    ''
                  )}
                </td>
                <td className="px-3 py-3">
                  <span className="flex flex-col gap-2">
                    <TargetControls campaignId={c.id} targetId={v.id} campaignState={c.state} state={v.state} name={names.get(v.employeeId) ?? ''} />
                    {c.state === 'SENT' && (v.state === 'NOTIFIED' || v.state === 'EXCEPTION') && !v.secondMessageId && (
                      <SecondNotice campaignId={c.id} targetId={v.id} name={names.get(v.employeeId) ?? ''} maxDates={Math.max(1, Math.ceil(v.remainingMinutes / 480))} min={today} max={c.periodEnd} />
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-4 text-sm text-faint">{t('noTargets')}</p>}
      </div>
      <p className="text-xs text-faint">{t('note')}</p>
    </PageShell>
  );
}
