// 이력 · 내역 › 급여명세서 발송 (2026-10-25 의뢰인: 확정한 급여명세서를 직원이 등록한 이메일로 보낸 내역 — 총 몇 명에게 보냈고, 누구에게 보냈고, 누구에게 안 갔는지).
// 읽기 전용이다. 그 달에 공개 중인 명세서마다 마지막 발송 결과를 보여 준다(발송 기록 payroll_slip_mails의 마지막 줄). 메일은 공개할 때 자동으로 나간다(2026-10-24) — 실패 · 안 간 것의 다시 보내기만 운영 현황의 시스템관리자 화면에서 한다.
// 위의 칸을 누르면 그 경우의 직원만 아래에 보인다 — 발송 완료 / 미발송(전체) / 아직 안 보냄 / 실패 / 이메일 없음 / 생년월일 없음.
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Card, CardTitle, Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { getMe } from '@/lib/auth';
import { groupPath } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { mailReady } from '@/lib/payroll/slip-mail';
import { mailOverview } from '@/lib/payroll/slip-mail-overview';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';

export const dynamic = 'force-dynamic';
const shift = (ym: string, k: number) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + k, 1)).toISOString().slice(0, 7);
const TONE = { SENT: 'ok', FAILED: 'danger', NO_EMAIL: 'warn', NO_BIRTH: 'warn', NONE: 'neutral' } as const;
const FILTERS = ['all', 'sent', 'unsent', 'NONE', 'FAILED', 'NO_EMAIL', 'NO_BIRTH'] as const;
type Filter = (typeof FILTERS)[number];

export default async function SlipMailLogPage({ searchParams }: { searchParams: Promise<{ m?: string; f?: string }> }) {
  const me = await getMe();
  if (!me || me.role !== 'admin' || !me.canViewPayroll) notFound();
  const [t, to, tl, f, sp] = await Promise.all([getTranslations('admin.slipMailLog'), getTranslations('admin.opsMail'), getTranslations('admin.resignLog'), getFormatter(), searchParams]);
  const today = toKstDate(new Date());
  const m = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.m ?? '') ? sp.m! : shift(today.slice(0, 7), -1); // 기본은 지난달
  const filter: Filter = (FILTERS as readonly string[]).includes(sp.f ?? '') ? (sp.f as Filter) : 'all';
  const [{ rows, tableMissing }, groups] = await Promise.all([mailOverview(m, OFFICE.practiceMode), loadOrgGroups()]);
  const { data: people } = await createAdminClient().from('profiles').select('id, name, employee_no, email, group_id').in('id', [...new Set(rows.map((r) => r.employeeId))]);
  const who = new Map((people ?? []).map((p) => [p.id as string, { name: p.name as string, no: (p.employee_no as string | null) ?? '', email: ((p.email as string | null) ?? '').trim(), group: groupPath(groups, p.group_id as string | null) ?? '' }]));
  const n = (k: string) => rows.filter((r) => r.result === k).length;
  const sent = n('SENT');
  const unsent = rows.length - sent;
  const shown = rows
    .filter((r) => (filter === 'all' ? true : filter === 'sent' ? r.result === 'SENT' : filter === 'unsent' ? r.result !== 'SENT' : r.result === filter))
    .sort((a, b) => (a.result === 'SENT' ? 1 : 0) - (b.result === 'SENT' ? 1 : 0) || (who.get(a.employeeId)?.name ?? '').localeCompare(who.get(b.employeeId)?.name ?? '', 'ko'));
  const at = (iso: string) => f.dateTime(new Date(iso), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' });
  const href = (nf: Filter) => `?m=${m}${nf === 'all' ? '' : `&f=${nf}`}`;
  const tile = (nf: Filter, label: string, value: number, bad = false) => (
    <Link key={nf} href={href(nf)} aria-current={filter === nf ? 'true' : undefined} className={`rounded-card border p-3 ${filter === nf ? 'border-primary bg-primary-tint' : 'border-border'} ${bad && filter !== nf ? 'bg-danger-tint' : filter === nf ? '' : 'bg-bg'}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className={`num pt-1 text-xl font-bold ${bad ? 'text-danger' : ''}`}>{to('count', { n: value })}</p>
    </Link>
  );

  return (
    <PageShell wide>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted">{t('intro')}</p>
        </div>
        {rows.length > 0 && (
          <a href={`/api/admin/export/list?kind=slipmail&m=${m}`} className="inline-flex h-9 items-center gap-1 rounded-button border border-border bg-bg px-3.5 text-sm font-semibold whitespace-nowrap text-text hover:bg-surface">
            <Download aria-hidden size={16} />
            {tl('download')}
          </a>
        )}
      </div>
      <nav className="flex items-center gap-1 self-start rounded-button bg-bg" aria-label={to('month')}>
        <Link href={`?m=${shift(m, -1)}`} aria-label={to('prev')} className="flex size-11 items-center justify-center text-primary"><ChevronLeft aria-hidden size={22} strokeWidth={2} /></Link>
        <span className="num px-1 text-lg font-bold">{to('monthOf', { m })}</span>
        <Link href={`?m=${shift(m, 1)}`} aria-label={to('next')} className="flex size-11 items-center justify-center text-primary"><ChevronRight aria-hidden size={22} strokeWidth={2} /></Link>
      </nav>
      {!mailReady() && <p className="rounded-card border border-warn bg-warn-tint p-3 text-sm text-warn">{t('mailNotReady')}</p>}
      {tableMissing ? (
        <p className="rounded-card border border-warn bg-warn-tint p-4 text-sm text-warn">{to('dbPending')}</p>
      ) : rows.length === 0 ? (
        <Card className="flex flex-col gap-2">
          <p className="font-bold">{t('emptyTitle', { m })}</p>
          <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-muted">
            <li>{t('how1')}</li>
            <li>{t('how2')}</li>
            <li>{t('how3')}</li>
          </ol>
          <div className="flex flex-wrap gap-3 pt-1 text-sm font-semibold text-primary">
            <Link href="/admin/payroll/runs">{t('toRuns')} ›</Link>
            <Link href="/admin/payroll/slips">{t('toSlips')} ›</Link>
          </div>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            {tile('all', t('total'), rows.length)}
            {tile('sent', t('sent'), sent)}
            {tile('unsent', t('unsent'), unsent, unsent > 0)}
          </div>
          {unsent > 0 && (
            <div className="flex flex-wrap gap-2">
              {([['NONE', 'none'], ['FAILED', 'failed'], ['NO_EMAIL', 'noEmail'], ['NO_BIRTH', 'noBirth']] as const).map(([k, sk]) => (
                <Link key={k} href={href(k)} aria-current={filter === k ? 'true' : undefined} className={`inline-flex min-h-9 items-center gap-1.5 rounded-chip border px-3 text-sm ${filter === k ? 'border-primary bg-primary-tint font-bold text-primary' : 'border-border bg-bg text-muted'}`}>
                  {to(`stat.${sk}`)} <b className="num">{n(k)}</b>
                </Link>
              ))}
            </div>
          )}
          <Card className="flex flex-col gap-3">
            <CardTitle>{t('listTitle', { n: shown.length })}</CardTitle>
            <ul className="divide-y divide-border overflow-hidden rounded-card border border-border">
              {shown.map((r) => {
                const p = who.get(r.employeeId);
                return (
                  <li key={r.slipId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                    <Chip tone={TONE[r.result]}>{to(`result.${r.result}`)}</Chip>
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold">{p?.name}<span className="num pl-2 text-xs font-normal text-muted">{p?.no}</span>{p?.group && <span className="pl-2 text-xs font-normal text-faint">{p.group}</span>}</span>
                      <span className="block break-all text-xs text-muted">{r.toEmail ?? p?.email ?? ''}{r.errorCode ? ` · ${to('code')} ${r.errorCode}` : ''}</span>
                    </span>
                    {r.at ? <span className="num text-sm text-muted">{at(r.at)}</span> : <span className="text-xs text-faint">{t('neverTried')}</span>}
                    {(r.result === 'NO_EMAIL' || r.result === 'NO_BIRTH') && <span className="text-xs text-muted">{to(`fix.${r.result}`)}</span>}
                  </li>
                );
              })}
            </ul>
          </Card>
          <p className="text-xs text-faint">{t('note')}</p>
        </>
      )}
    </PageShell>
  );
}
