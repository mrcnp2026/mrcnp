// 퇴직연금 DC (묶음 32, 2026-10-20 노프로 비교) — 가입자 · 달마다 부담금(임금총액 ÷ 12) · 누계 · 은행 납입 엑셀. 급여 담당 관리자만.
// 부담금은 급여대장을 확정할 때 저절로 만들어진다(정기 + 상여). 은행에 낸 달은 다시 계산하지 않는다.
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { HelpTip } from '@/components/Help';
import { Card, CardTitle, Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { getMe } from '@/lib/auth';
import { balanceOf, inDcPlan } from '@/lib/payroll/pension';
import { loadPension } from '@/lib/payroll/pension-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { NOT_SYSTEM_ADMIN } from '@/lib/system-admin';
import { toKstDate } from '@/lib/time';
import { ManualForm, MemberForm, MonthActions, RemoveMember } from './PensionForms';

const shift = (m: string, d: number) => {
  const [y, mo] = m.split('-').map(Number);
  const x = new Date(Date.UTC(y, mo - 1 + d, 1));
  return x.toISOString().slice(0, 7);
};

export default async function PensionPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const [t, f, me, sp] = await Promise.all([getTranslations('admin.pension'), getFormatter(), getMe(), searchParams]);
  if (!me || me.role !== 'admin' || !me.canViewPayroll) return <PageShell><p className="rounded-card bg-warn-tint p-4 text-sm text-warn">{t('forbidden')}</p></PageShell>;
  const testViewer = !!me.employeeNo?.startsWith('e2e-');
  const month = sp.m && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.m) ? sp.m : toKstDate(new Date()).slice(0, 7);
  const monthKey = `${month}-01`;
  const [{ members, contributions }, { data: staff }] = await Promise.all([
    loadPension(OFFICE.practiceMode),
    createAdminClient().from('profiles').select('id, name, employee_no, active').or(NOT_SYSTEM_ADMIN).order('name'),
  ]);
  const people = (staff ?? []).filter((p) => !!(p.employee_no as string | null)?.startsWith('e2e-') === testViewer).map((p) => ({ id: p.id as string, name: p.name as string, employeeNo: (p.employee_no as string | null) ?? null, active: p.active as boolean }));
  const nameOf = new Map(people.map((p) => [p.id, p.name]));
  const mine = members.filter((m) => nameOf.has(m.employeeId));
  const won = (v: number) => t('won', { n: f.number(v) });
  const rows = mine.filter((m) => inDcPlan(m, monthKey)).map((m) => ({ m, c: contributions.find((x) => x.employeeId === m.employeeId && x.month === monthKey) ?? null, total: balanceOf(m, contributions.filter((x) => x.employeeId === m.employeeId && x.month <= monthKey)) }));
  const sum = rows.reduce((a, r) => a + (r.c?.amount ?? 0), 0);
  const unpaid = rows.filter((r) => r.c && !r.c.paidOn).map((r) => r.m.employeeId);

  return (
    <PageShell wide>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex flex-wrap items-center gap-x-1 text-2xl font-bold">{t('title')}<HelpTip>{t('intro')}</HelpTip></h1>
        <nav className="flex items-center gap-1" aria-label={t('month')}>
          <Link href={`/admin/payroll/pension?m=${shift(month, -1)}`} className="flex min-h-11 min-w-11 items-center justify-center" aria-label={t('prev')}>
            <ChevronLeft aria-hidden size={22} strokeWidth={1.75} />
          </Link>
          <span className="num text-xl font-semibold">{month}</span>
          <Link href={`/admin/payroll/pension?m=${shift(month, 1)}`} className="flex min-h-11 min-w-11 items-center justify-center" aria-label={t('next')}>
            <ChevronRight aria-hidden size={22} strokeWidth={1.75} />
          </Link>
        </nav>
      </header>
      <p className="text-sm text-faint">{t('note')}</p>

      <Card className="flex flex-col gap-3">
        <CardTitle>{t('monthTitle', { m: month })}</CardTitle>
        {rows.length === 0 ? (
          <p className="text-sm text-faint">{t('monthEmpty')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {rows.map(({ m, c, total }) => (
              <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm">
                <span className="w-24 shrink-0 font-bold">{nameOf.get(m.employeeId)}</span>
                <span className="num min-w-0 flex-1 text-muted">{c ? t('line', { wage: f.number(c.wageTotal) }) : t('noLine')}</span>
                <span className="num font-bold">{c ? won(c.amount) : '–'}</span>
                {c && <Chip tone={c.paidOn ? 'ok' : 'warn'}>{c.paidOn ? t('paidChip', { d: c.paidOn }) : t('unpaidChip')}</Chip>}
                {c?.source === 'MANUAL' && <Chip tone="info">{t('manualChip')}</Chip>}
                <span className="num w-full text-xs text-faint sm:w-auto">{t('balance', { n: f.number(total) })}</span>
              </li>
            ))}
            <li className="flex justify-between py-2 text-sm font-bold">
              <span>{t('sum')}</span>
              <span className="num">{won(sum)}</span>
            </li>
          </ul>
        )}
        <MonthActions month={month} employeeIds={unpaid} />
      </Card>

      <Card className="flex flex-col gap-3">
        <CardTitle>{t('membersTitle', { n: mine.length })}</CardTitle>
        {mine.length > 0 && (
          <ul className="flex flex-col divide-y divide-border">
            {mine.map((m) => (
              <li key={m.id} className="flex flex-col gap-2 py-2 text-sm">
                <details>
                  <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-bold">{nameOf.get(m.employeeId)}</span>
                    <Chip tone={m.planKind === 'DC' ? 'info' : 'neutral'}>{t(`plan.${m.planKind}`)}</Chip>
                    <span className="num text-muted">{t('joinedLine', { d: m.joinedOn })}{m.institution ? ` · ${m.institution}` : ''}{m.openingBalance !== null ? ` · ${t('openingLine', { n: f.number(m.openingBalance), d: m.openingAsOf ?? '' })}` : ''}{m.endedOn ? ` · ${t('endedLine', { d: m.endedOn })}` : ''}</span>
                  </summary>
                  <div className="flex flex-col gap-2 pt-3">
                    <MemberForm people={people} initial={{ employeeId: m.employeeId, planKind: m.planKind, joinedOn: m.joinedOn, endedOn: m.endedOn, institution: m.institution, openingBalance: m.openingBalance, openingAsOf: m.openingAsOf, note: m.note }} />
                    <RemoveMember employeeId={m.employeeId} />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
        <details className="rounded-button border border-border px-3 py-2">
          <summary className="cursor-pointer font-bold">{t('addTitle')}</summary>
          <div className="pt-3">
            <MemberForm people={people.filter((p) => p.active && !mine.some((m) => m.employeeId === p.id))} />
          </div>
        </details>
      </Card>

      <Card className="flex flex-col gap-3">
        <CardTitle>{t('manualTitle')}</CardTitle>
        <p className="text-xs text-faint">{t('manualHint')}</p>
        <ManualForm people={people.filter((p) => mine.some((m) => m.employeeId === p.id && m.planKind === 'DC'))} month={month} />
      </Card>
    </PageShell>
  );
}
