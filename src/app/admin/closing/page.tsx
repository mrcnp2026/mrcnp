// 마감 관리 — 달마다 직원의 근태를 마감하고 다시 연다 (PRD v1.3 8 · 35.2장, 시프티 「마감 관리」 스샷 65).
// 마감하려면 그 달에 기록이 있는 날이 전부 확정돼 있고 대기 중인 요청이 없어야 한다. 마감하면 DB가 그 달의 근태 변경을 막는다.
// 급여는 이 마감 기록을 본다 — 급여용 잠금을 따로 두지 않는다.
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { loadCloseBoard, loadReopenRequests } from '@/lib/close-data';
import { getMe } from '@/lib/auth';
import { isMonth, monthSpan } from '@/lib/close-review';
import { groupPath } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';
import { CloseBoard, type Line } from './CloseBoard';

const shift = (ym: string, by: number) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
};

export default async function ClosingPage({ searchParams }: { searchParams: Promise<{ m?: string; live?: string }> }) {
  const [t, sp] = await Promise.all([getTranslations('admin.closing'), searchParams]);
  const today = toKstDate(new Date());
  // 기본은 지난달 — 마감은 달이 끝난 뒤에 한다
  const month = isMonth(sp.m) && sp.m <= today.slice(0, 7) ? sp.m : shift(today.slice(0, 7), -1);
  const practice = OFFICE.practiceMode && sp.live !== '1';
  const live = sp.live === '1';
  const [{ lines }, groups] = await Promise.all([loadCloseBoard(month, practice), loadOrgGroups()]);
  const requests = await loadReopenRequests(lines.flatMap((l) => (l.close ? [l.close.id] : [])));
  const meId = (await getMe())?.id;
  const ids = [...new Set([...lines.flatMap((l) => l.history.map((h) => h.closedBy)), ...[...requests.values()].map((r) => r.requestedBy)])];
  const { data: who } = ids.length ? await createAdminClient().from('profiles').select('id, name').in('id', ids) : { data: [] };
  const nameOf = new Map((who ?? []).map((p) => [p.id as string, p.name as string]));
  const hm = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
  const canClose = monthSpan(month).last < today;
  const rows: Line[] = lines.map((l) => ({
    employeeId: l.employeeId,
    name: l.name,
    group: groupPath(groups, l.groupId) ?? '',
    active: l.active,
    recordDays: l.review.recordDays.length,
    unconfirmed: l.review.unconfirmed.length,
    deemedDays: l.review.deemedDays,
    pending: Object.entries(l.review.pending).filter(([, n]) => n > 0).map(([key, n]) => ({ key, n })),
    hours: hm(l.review.payableMinutes),
    hash: l.hash,
    ready: l.review.blockers === 0,
    reopenRequest: l.close && requests.has(l.close.id) ? { id: requests.get(l.close.id)!.id, reason: requests.get(l.close.id)!.reason, by: nameOf.get(requests.get(l.close.id)!.requestedBy) ?? '', mine: requests.get(l.close.id)!.requestedBy === meId } : null,
    anomalyBlocks: l.review.anomalyBlocks,
    anomalyChecks: l.review.anomalyChecks,
    close: l.close ? { id: l.close.id, revision: l.close.revision, by: nameOf.get(l.close.closedBy) ?? '', at: toKstDate(new Date(l.close.closedAt)) } : null,
    reopened: l.history.filter((h) => h.state === 'REOPENED').map((h) => ({ revision: h.revision, at: h.reopenedAt ? toKstDate(new Date(h.reopenedAt)) : '', reason: h.reopenReason ?? '' })),
  }));
  const closed = rows.filter((r) => r.close).length;
  const ready = rows.filter((r) => !r.close && r.ready).length;
  const link = (m: string) => `/admin/closing?m=${m}${live ? '&live=1' : ''}`;
  const next = shift(month, 1);

  return (
    <PageShell wide>
      <div>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="pt-1 text-sm text-faint">{t('intro')}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center">
          <Link href={link(shift(month, -1))} aria-label={t('prev')} className="inline-flex size-9 items-center justify-center rounded-l-button border border-border bg-bg text-muted">
            <ChevronLeft aria-hidden size={18} />
          </Link>
          <b className="num inline-flex h-9 items-center border-y border-border bg-bg px-4 text-base">{month}</b>
          {next <= today.slice(0, 7) ? (
            <Link href={link(next)} aria-label={t('next')} className="inline-flex size-9 items-center justify-center rounded-r-button border border-border bg-bg text-muted">
              <ChevronRight aria-hidden size={18} />
            </Link>
          ) : (
            <span className="inline-flex size-9 items-center justify-center rounded-r-button border border-border bg-surface text-faint">
              <ChevronRight aria-hidden size={18} />
            </span>
          )}
        </span>
        <dl className="num flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
          {(
            [
              ['sumTarget', rows.length, ''],
              ['sumClosed', closed, 'text-ok'],
              ['sumReady', ready, 'text-primary'],
              ['sumBlocked', rows.length - closed - ready, rows.length - closed - ready > 0 ? 'text-warn' : ''],
            ] as const
          ).map(([k, n, tone]) => (
            <div key={k} className="flex items-baseline gap-1">
              <dt className="text-muted">{t(k)}</dt>
              <dd className={`text-lg font-bold ${tone}`}>{n}</dd>
            </div>
          ))}
        </dl>
      </div>
      {practice && <p className="rounded-card bg-primary-tint p-3 text-sm text-primary">{t('practice')}</p>}
      {!canClose && <p className="rounded-card bg-warn-tint p-3 text-sm text-warn">{t('future')}</p>}
      {rows.length === 0 ? <p className="rounded-card bg-bg p-8 text-center text-sm text-faint">{t('none')}</p> : <CloseBoard key={month} month={month} live={live} lines={rows} canClose={canClose} />}
      <p className="text-sm text-faint">{t('note')}</p>
    </PageShell>
  );
}
