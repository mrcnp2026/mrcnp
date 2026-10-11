// 요청 — 내 요청 (의뢰인 2026-10-10: 시프티의 「요청」 탭처럼) — 정정 · 연장근로 확인 · 휴가 · 외근/출장/재택을 한 목록으로, 대기중/완료 탭.
// 새 요청은 + 버튼에서 종류를 골라 그 양식으로 간다 (양식과 처리 길은 기존 그대로다).
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Fab } from '@/components/Fab';
import { Pager, pageOf } from '@/components/Pager';
import { RequestRows } from '@/components/RequestRows';
import { RequestTabs } from '@/components/RequestTabs';
import { PageShell } from '@/components/ui';
import { getMe } from '@/lib/auth';
import { loadAllLeaveTypes } from '@/lib/leave-data';
import { pendingCounts } from '@/lib/period-data';
import { loadRequests, REQUEST_WINDOW_DAYS } from '@/lib/request-data';
import { splitRequests, type ReqItem } from '@/lib/requests';
import { createAdminClient } from '@/lib/supabase/admin';

const PAGE = 20;
const hrefOf = (r: ReqItem) => (r.kind === 'punch' ? `/punch/records?m=${r.date.slice(0, 7)}` : r.kind === 'correction' ? '/punch/corrections' : r.kind === 'overtime' ? `/punch/records?m=${r.date.slice(0, 7)}` : r.kind === 'leave' || r.kind === 'leaveDelete' ? '/punch/leave' : r.kind === 'shift' ? '/punch/schedule/request' : '/punch/leave#work');

export default async function MyRequestsPage({ searchParams }: { searchParams: Promise<{ tab?: string; p?: string; q?: string }> }) {
  const me = await getMe();
  if (!me) redirect('/login');
  const [t, tc, sp] = await Promise.all([getTranslations('requests'), getTranslations('common'), searchParams]);
  const done = sp.tab === 'done';
  const [items, leaveTypes, { data: staff }] = await Promise.all([loadRequests({ employeeId: me.id }), loadAllLeaveTypes(), createAdminClient().from('profiles').select('id, name')]);
  // 검색: 종류 이름 · 사유 · 날짜에서 찾는다 (내 요청뿐이라 이름으로는 찾을 것이 없다)
  const q = (sp.q ?? '').trim().slice(0, 40).toLowerCase();
  const split = splitRequests(q ? items.filter((r) => `${t(`kinds.${r.kind}`)} ${r.reason ?? ''} ${r.date}`.toLowerCase().includes(q)) : items);
  // 관리자의 「내 요청」 탭은 대기 중인 것이 위, 처리된 것이 아래로 한 목록이다 (대기중·완료 탭은 전 직원 것이라서)
  const admin = me.role === 'admin';
  const page = pageOf(admin ? [...split.pending, ...split.done] : done ? split.done : split.pending, sp.p, PAGE);
  const names = new Map((staff ?? []).map((p) => [p.id as string, p.name as string]));
  const fresh = [
    { id: 'shift', label: t('newShift'), href: '/punch/schedule/request' },
    { id: 'correction', label: t('newCorrection'), href: '/punch/corrections?new=1' },
    { id: 'leave', label: t('newLeave'), href: '/punch/leave?new=leave' },
    { id: 'work', label: t('newWork'), href: '/punch/leave?new=work' },
  ];

  // PC: 시프티 직원 모드의 「요청 내역」 — 왼쪽 좁은 칸(대기/완료 수 · 보기 고르기) + 오른쪽 표 (2026-10-11 의뢰인 스샷 `스샷/직원모드 요청내역.png`)
  const pcItems = done ? split.done : split.pending;
  const pick = (on: boolean, label: string, href: string) => (
    <Link href={href} role="radio" aria-checked={on} className="flex min-h-8 items-center gap-2 text-sm">
      <span aria-hidden className={`size-4 rounded-button border ${on ? 'border-primary bg-primary' : 'border-border bg-bg'}`} />
      {label}
    </Link>
  );

  return (
    <PageShell wide>
      <h1 className="sr-only">{t('title')}</h1>
      <div className="hidden lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-8">
        <aside className="flex flex-col gap-4">
          <h2 className="text-lg font-bold">{t('pcTitle')}</h2>
          <dl className="num flex flex-col gap-1 text-sm">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted">{t('pcPending')}</dt>
              <dd className="rounded-button bg-warn-tint px-2 font-bold text-warn">{split.pending.length}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted">{t('pcDone')}</dt>
              <dd className="rounded-button bg-surface px-2 font-bold">{split.done.length}</dd>
            </div>
          </dl>
          <div role="radiogroup" className="flex flex-col gap-1 border-t border-border pt-3">
            {pick(!done, t('pcShowPending'), '/punch/requests')}
            {pick(done, t('pcShowDone'), '/punch/requests?tab=done')}
          </div>
        </aside>
        <section className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap justify-end gap-2">
            {fresh.map((x) => (
              <Link key={x.id} href={x.href} className="inline-flex h-8 items-center rounded-button border border-primary bg-bg px-3 text-sm font-bold text-primary hover:bg-primary-tint">
                + {x.label}
              </Link>
            ))}
          </div>
          {pcItems.length === 0 ? (
            <p className="border-t border-border py-10 text-center text-sm text-faint">{done ? t('emptyDone', { days: REQUEST_WINDOW_DAYS }) : t('emptyPending')}</p>
          ) : (
            <RequestRows table openKey="view" items={pcItems} leaveTypes={leaveTypes} names={names} hrefOf={hrefOf} />
          )}
        </section>
      </div>
      <div className="flex flex-col gap-3 lg:hidden">
      {admin ? (
        <RequestTabs admin active="mine" q={q} counts={{ pending: (await pendingCounts()).total, mine: split.pending.length }} />
      ) : (
        <RequestTabs admin={false} active={done ? 'done' : 'pending'} q={q} counts={{ pending: split.pending.length, done: split.done.length }} />
      )}
      {/* PC에는 + 버튼이 없다 — 새 요청으로 가는 길을 줄로 보인다 */}
      <div className="hidden">
        {fresh.map((x) => (
          <Link key={x.id} href={x.href} className="inline-flex min-h-11 items-center rounded-button border border-border bg-bg px-4 text-sm font-bold text-primary">
            + {x.label}
          </Link>
        ))}
      </div>
      {page.items.length === 0 && <p className="rounded-card bg-bg p-5 text-sm text-faint">{admin ? t('emptyMine', { days: REQUEST_WINDOW_DAYS }) : done ? t('emptyDone', { days: REQUEST_WINDOW_DAYS }) : t('emptyPending')}</p>}
      <RequestRows items={page.items} leaveTypes={leaveTypes} names={names} hrefOf={hrefOf} />
      <Pager page={page.page} pages={page.pages} param="p" params={sp} label={tc('pages')} />
      {(done || admin) && split.done.length > 0 && <p className="px-1 text-sm text-faint">{t('doneHint', { days: REQUEST_WINDOW_DAYS })}</p>}
      </div>
      <Fab label={t('new')} items={fresh} />
    </PageShell>
  );
}
