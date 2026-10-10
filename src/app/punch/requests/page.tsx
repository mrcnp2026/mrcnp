// 요청 — 내 요청 (의뢰인 2026-10-10: 시프티의 「요청」 탭처럼) — 정정 · 연장근로 확인 · 휴가 · 외근/출장/재택을 한 목록으로, 대기중/완료 탭.
// 새 요청은 + 버튼에서 종류를 골라 그 양식으로 간다 (양식과 처리 길은 기존 그대로다).
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Fab } from '@/components/Fab';
import { Pager, pageOf } from '@/components/Pager';
import { RequestRows } from '@/components/RequestRows';
import { ScopeSwitch } from '@/components/ScopeSwitch';
import { PageShell } from '@/components/ui';
import { getMe } from '@/lib/auth';
import { loadAllLeaveTypes } from '@/lib/leave-data';
import { loadRequests, REQUEST_WINDOW_DAYS } from '@/lib/request-data';
import { splitRequests, type ReqItem } from '@/lib/requests';
import { createAdminClient } from '@/lib/supabase/admin';

const PAGE = 20;
const hrefOf = (r: ReqItem) => (r.kind === 'punch' ? `/punch/records?m=${r.date.slice(0, 7)}` : r.kind === 'correction' ? '/punch/corrections' : r.kind === 'overtime' ? `/punch/records?m=${r.date.slice(0, 7)}` : r.kind === 'leave' ? '/punch/leave' : '/punch/leave#work');

export default async function MyRequestsPage({ searchParams }: { searchParams: Promise<{ tab?: string; p?: string }> }) {
  const me = await getMe();
  if (!me) redirect('/login');
  const [t, tc, sp] = await Promise.all([getTranslations('requests'), getTranslations('common'), searchParams]);
  const done = sp.tab === 'done';
  const [items, leaveTypes, { data: staff }] = await Promise.all([loadRequests({ employeeId: me.id }), loadAllLeaveTypes(), createAdminClient().from('profiles').select('id, name')]);
  const split = splitRequests(items);
  const page = pageOf(done ? split.done : split.pending, sp.p, PAGE);
  const names = new Map((staff ?? []).map((p) => [p.id as string, p.name as string]));
  const tab = (on: boolean) => `flex min-h-11 flex-1 items-center justify-center gap-1 border-b-2 text-sm font-bold ${on ? 'border-text text-text' : 'border-transparent text-muted'}`;
  const fresh = [
    { id: 'correction', label: t('newCorrection'), href: '/punch/corrections?new=1' },
    { id: 'leave', label: t('newLeave'), href: '/punch/leave?new=leave' },
    { id: 'work', label: t('newWork'), href: '/punch/leave?new=work' },
  ];

  return (
    <PageShell>
      {me.role === 'admin' && <ScopeSwitch kind="requests" current="mine" />}
      <h1 className="px-1 text-2xl font-extrabold tracking-tight">{t('title')}</h1>
      <nav aria-label={t('title')} className="flex rounded-card bg-bg px-2">
        <Link href="/punch/requests" aria-current={!done ? 'page' : undefined} className={tab(!done)}>
          {t('tabPending')}
          <span className="num">{split.pending.length}</span>
        </Link>
        <Link href="/punch/requests?tab=done" aria-current={done ? 'page' : undefined} className={tab(done)}>
          {t('tabDone')}
          <span className="num">{split.done.length}</span>
        </Link>
      </nav>
      {/* PC에는 + 버튼이 없다 — 새 요청으로 가는 길을 줄로 보인다 */}
      <div className="hidden flex-wrap gap-2 lg:flex">
        {fresh.map((x) => (
          <Link key={x.id} href={x.href} className="inline-flex min-h-11 items-center rounded-button border border-border bg-bg px-4 text-sm font-bold text-primary">
            + {x.label}
          </Link>
        ))}
      </div>
      {page.items.length === 0 && <p className="rounded-card bg-bg p-5 text-sm text-faint">{done ? t('emptyDone', { days: REQUEST_WINDOW_DAYS }) : t('emptyPending')}</p>}
      <RequestRows items={page.items} leaveTypes={leaveTypes} names={names} hrefOf={hrefOf} />
      <Pager page={page.page} pages={page.pages} param="p" params={sp} label={tc('pages')} />
      {done && split.done.length > 0 && <p className="px-1 text-sm text-faint">{t('doneHint', { days: REQUEST_WINDOW_DAYS })}</p>}
      <Fab label={t('new')} items={fresh} />
    </PageShell>
  );
}
