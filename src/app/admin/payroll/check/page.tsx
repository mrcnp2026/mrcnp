// 급여 전 점검 (2026-10-25 의뢰인: 마감 · 계산 · 확정 전에 막히는 곳을 미리 한 화면에서 보고 싶다).
// 조회만 한다 — 아무것도 바꾸지 않는다. 직원마다 계약 · 세무 · 근태 마감 · 연장 확인 · 근태 이상을 한 줄로 보여 주고, 고칠 곳으로 바로 간다.
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Card, CardTitle, Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { getMe } from '@/lib/auth';
import { loadCloseBoard } from '@/lib/close-data';
import { monthSpan } from '@/lib/close-review';
import { loadStaffPayBoard } from '@/lib/payroll/staff-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';

const RATE_KINDS = ['pension.rate', 'pension.limit', 'health.rate', 'ltc.rate', 'employment.rate', 'income-tax.table'] as const;
type Tone = 'ok' | 'warn' | 'danger' | 'neutral';
type Cell = [Tone, string];

export default async function PayCheckPage({ searchParams }: { searchParams: Promise<{ m?: string; live?: string }> }) {
  const [t, me, sp] = await Promise.all([getTranslations('payCheckPage'), getMe(), searchParams]);
  if (!me || me.role !== 'admin' || !me.canViewPayroll) return <PageShell><p className="rounded-card bg-warn-tint p-4 text-sm text-warn">{t('forbidden')}</p></PageShell>;
  const practice = OFFICE.practiceMode && sp.live !== '1';
  const today = toKstDate(new Date());
  const monthOf = (back: number) => new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - back, 1)).toISOString().slice(0, 7);
  const months = [monthOf(0), monthOf(1), monthOf(2)];
  const ym = /^\d{4}-\d{2}$/.test(sp.m ?? '') ? (sp.m as string) : months[1];
  const { last } = monthSpan(ym);
  const asOf = last < today ? last : today; // 아직 끝나지 않은 달은 오늘 기준으로 본다
  const over = last < today; // 마감할 수 있는 달인가
  const db = createAdminClient();

  const [staff, board, { data: refs }, { data: setRows }, { data: polRows }, { data: itemRows }] = await Promise.all([
    loadStaffPayBoard(asOf),
    loadCloseBoard(ym, practice),
    db.from('payroll_reference_versions').select('reference_kind, valid_from, valid_to').eq('state', 'APPROVED').in('reference_kind', RATE_KINDS as unknown as string[]),
    db.from('payroll_company_setting_versions').select('id').eq('status', 'active').eq('verification_state', 'TEMPORARY').in('section', ['ledger', 'employee-defaults']),
    db.from('payroll_policy_versions').select('id').eq('status', 'active').eq('in_use', true).eq('verification_state', 'TEMPORARY'),
    db.from('payroll_item_versions').select('id').eq('status', 'active').eq('verification_state', 'TEMPORARY'),
  ]);
  const covers = (kind: string) => (refs ?? []).some((r) => r.reference_kind === kind && (!r.valid_from || (r.valid_from as string) <= last) && (!r.valid_to || (r.valid_to as string) > last));
  const unverified = (setRows?.length ?? 0) + (polRows?.length ?? 0) + (itemRows?.length ?? 0);
  const lineOf = new Map(board.lines.map((l) => [l.employeeId, l]));

  const rows = staff.map((p) => {
    const l = lineOf.get(p.employeeId);
    const gaps = new Set<string>(p.gaps);
    const contract: Cell = !p.contract ? ['danger', t('noContract')] : gaps.has('no_monthly_hours') || gaps.has('no_annual_divisor') ? ['warn', t('contractGap')] : ['ok', t('ok')];
    const tax: Cell = gaps.has('no_tax') ? ['danger', t('noTax')] : gaps.has('insurance_unknown') ? ['warn', t('insUnknown')] : ['ok', t('ok')];
    const close: Cell = !l ? ['neutral', t('noRecord')] : l.close ? ['ok', t('closed')] : over ? ['warn', t('notClosed')] : ['neutral', t('notOverYet')];
    const ot = l?.review.pending.overtime ?? 0;
    const overtime: Cell = ot > 0 ? ['warn', t('otPending', { n: ot })] : ['ok', t('ok')];
    const bl = l?.review.blockers ?? 0;
    const flags: Cell = bl > 0 ? ['warn', t('blockers', { n: bl })] : ['ok', t('ok')];
    const ready = contract[0] === 'ok' && tax[0] !== 'danger' && (!over || close[0] === 'ok') && ot === 0 && bl === 0;
    const fix = !p.contract || tax[0] === 'danger' ? `/admin/payroll/staff/${p.employeeId}` : `/admin/closing?m=${ym}`;
    const issues = [
      !p.contract && 'NoContract',
      !!p.contract && contract[0] !== 'ok' && 'ContractGap',
      tax[0] === 'danger' && 'NoTax',
      tax[0] === 'warn' && 'InsUnknown',
      over && !!l && !l.close && 'NotClosed',
      ot > 0 && 'Ot',
      bl > 0 && 'Flags',
    ].filter((x): x is string => !!x);
    return { id: p.employeeId, name: p.name, cells: [contract, tax, close, overtime, flags] as Cell[], ready, fix, issues };
  });
  const readyN = rows.filter((r) => r.ready).length;
  // 문제 종류별로 묶어 한 줄씩 — 같은 문제가 직원 수만큼 줄줄이 나오지 않게 (2026-10-26 의뢰인)
  const KINDS = [
    ['NoContract', '/admin/payroll/staff', 'goStaff'],
    ['ContractGap', '/admin/payroll/staff', 'goStaff'],
    ['NoTax', '/admin/payroll/staff', 'goStaff'],
    ['InsUnknown', '/admin/payroll/staff', 'goStaff'],
    ['NotClosed', `/admin/closing?m=${ym}${sp.live === '1' ? '&live=1' : ''}`, 'goClose'],
    ['Ot', '/admin/inbox', 'goInbox'],
    ['Flags', `/admin/anomalies?m=${ym}${sp.live === '1' ? '&live=1' : ''}`, 'goAnomaly'],
  ] as const;
  const kindRows = KINDS.map(([k, href, go]) => ({ k, href, go, n: rows.filter((r) => r.issues.includes(k)).length })).filter((x) => x.n > 0);
  const ratesOk = RATE_KINDS.filter(covers).length;

  return (
    <PageShell wide>
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <nav className="flex gap-1.5" aria-label={t('month')}>
          {months.map((m) => (
            <Link key={m} href={`/admin/payroll/check?m=${m}${sp.live === '1' ? '&live=1' : ''}`} className={`inline-flex min-h-9 items-center rounded-button border px-3 text-sm font-semibold ${m === ym ? 'border-primary bg-primary-tint text-primary' : 'border-border bg-bg text-muted'}`}>{m}</Link>
          ))}
        </nav>
      </div>

      <Card>
        <CardTitle>{t('summary', { ym })}</CardTitle>
        <p className="pt-2 text-lg font-bold">{t('readyOf', { ready: readyN, total: rows.length })}</p>
        {!over && <p className="pt-1 text-sm text-faint">{t('notOverNote')}</p>}
        {(ratesOk < RATE_KINDS.length || unverified > 0) && (
          <ul className="flex flex-col gap-2 pt-3 text-sm">
            {ratesOk < RATE_KINDS.length && (
              <li className="flex flex-wrap items-center gap-2">
                <Chip tone="danger">{t('missing')}</Chip>
                <span>{t('rates', { ok: ratesOk, total: RATE_KINDS.length })}</span>
                <Link href="/admin/settings?tab=pay" className="font-semibold text-primary">{t('goRates')} ›</Link>
              </li>
            )}
            {unverified > 0 && (
              <li className="flex flex-wrap items-center gap-2">
                <Chip tone="warn">{t('temp')}</Chip>
                <span>{t('unverified', { n: unverified })}</span>
                <Link href="/admin/settings?tab=pay" className="font-semibold text-primary">{t('goVerify')} ›</Link>
              </li>
            )}
          </ul>
        )}
      </Card>

      {kindRows.length > 0 && (
        <Card>
          <CardTitle>{t('issuesTitle')}</CardTitle>
          <ul className="flex flex-col divide-y divide-border pt-1 text-sm">
            {kindRows.map((x) => (
              <li key={x.k} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
                <span className="min-w-0 flex-1 font-semibold">{t(`issue${x.k}`, { n: x.n })}</span>
                <Link href={x.href} className="inline-flex min-h-9 items-center rounded-button bg-primary-tint px-3 font-bold text-primary">{t(x.go)} ›</Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {rows.some((r) => !r.ready) && (
        <details className="group rounded-card border border-border bg-bg">
          <summary className="flex min-h-11 cursor-pointer items-center justify-between px-4 text-sm font-bold">
            {t('perPerson')}
            <span className="text-xs font-normal text-muted group-open:hidden">{t('showAll')}</span>
          </summary>
          <div className="overflow-x-auto border-t border-border px-2 pb-2">
            <table className="w-full min-w-176 text-sm">
              <thead>
                <tr className="text-left">
                  {['colName', 'colContract', 'colTax', 'colClose', 'colOt', 'colFlags', 'colFix'].map((k) => (
                    <th key={k} className="px-2 py-2">{t(k)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.filter((r) => !r.ready).map((r) => (
                  <tr key={r.id}>
                    <td className="px-2 py-2 font-semibold whitespace-nowrap">{r.name}</td>
                    {r.cells.map(([tone, text], i) => (
                      <td key={i} className="px-2 py-2"><Chip tone={tone}>{text}</Chip></td>
                    ))}
                    <td className="px-2 py-2"><Link href={r.fix} className="font-semibold text-primary">{t('fix')} ›</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
      {readyN > 0 && (
        <details className="group rounded-card border border-border bg-bg">
          <summary className="flex min-h-11 cursor-pointer items-center justify-between px-4 text-sm font-bold">
            {t('okGroup', { n: readyN })}
            <span className="text-xs font-normal text-muted group-open:hidden">{t('showAll')}</span>
          </summary>
          <p className="flex flex-wrap gap-1.5 border-t border-border p-3 text-sm">
            {rows.filter((r) => r.ready).map((r) => <Chip key={r.id} tone="ok">{r.name}</Chip>)}
          </p>
        </details>
      )}
      <div className="flex flex-col gap-2 rounded-card border border-border bg-bg p-4 lg:flex-row lg:items-center">
        <p className={`text-sm font-semibold lg:flex-1 ${readyN === rows.length ? 'text-ok' : 'text-muted'}`}>{readyN === rows.length ? t('allReady') : t('someBlocked')}</p>
        <Link href={`/admin/payroll/runs?new=1${sp.live === '1' ? '&live=1' : ''}`} className={`inline-flex min-h-11 items-center justify-center rounded-button px-5 text-sm font-bold ${readyN === rows.length ? 'bg-primary text-on-primary' : 'border border-border bg-bg text-text'}`}>{readyN === rows.length ? t('nextNew') : t('nextAnyway')} ›</Link>
      </div>
    </PageShell>
  );
}
