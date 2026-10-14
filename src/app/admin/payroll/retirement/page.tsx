// 퇴직급여 — 추계 · 퇴직 정산 · 중간정산 건의 목록과 새로 만들기 (PRD v1.3 18.6 W08). 급여 담당 관리자만.
// 수동 검산이다: 직원과 마지막 근무일을 고르면 프로그램에 있는 자료로 칸을 미리 채워 주고, 담당자가 확인 · 고쳐서 건을 만든다.
import { getFormatter, getTranslations } from 'next-intl/server';
import { HelpTip } from '@/components/Help';
import Link from 'next/link';
import { StatusCards, WarnLine } from '@/components/listframe';
import { Card, CardTitle, Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { getMe } from '@/lib/auth';
import { loadCases, suggestInput } from '@/lib/payroll/retirement-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';
import { CaseForm } from './RetirementForms';

const field = 'min-h-9 rounded-button border border-border bg-bg px-3 text-sm';
const TONE = { DRAFT: 'neutral', FINALIZED: 'ok', WITHDRAWN: 'neutral' } as const;
const KINDS = ['ESTIMATE', 'FINAL', 'INTERIM'] as const;

export default async function RetirementPage({ searchParams }: { searchParams: Promise<{ emp?: string; kind?: string; to?: string; live?: string; cs?: string; ck?: string }> }) {
  const [t, f, me, sp] = await Promise.all([getTranslations('admin.retirement'), getFormatter(), getMe(), searchParams]);
  if (!me || me.role !== 'admin' || !me.canViewPayroll) return <PageShell><p className="rounded-card bg-warn-tint p-4 text-sm text-warn">{t('forbidden')}</p></PageShell>;
  const practice = OFFICE.practiceMode && sp.live !== '1';
  const testViewer = !!me.employeeNo?.startsWith('e2e-');
  const today = toKstDate(new Date());
  const [{ data: staff }, cases] = await Promise.all([createAdminClient().from('profiles').select('id, name, employee_no, active').order('name'), loadCases({ practice, testViewer })]);
  const people = (staff ?? []).filter((p) => !!(p.employee_no as string | null)?.startsWith('e2e-') === testViewer);
  const emp = people.find((p) => p.id === sp.emp) ?? null;
  const kind = KINDS.find((k) => k === sp.kind) ?? 'ESTIMATE';
  const to = sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) && !Number.isNaN(Date.parse(`${sp.to}T00:00:00Z`)) ? sp.to : today;
  const filled = emp ? await suggestInput({ employeeId: emp.id as string, lastDay: to, practice }) : null;
  const won = (v: number | null) => (v === null ? t('noAmountShort') : t('won', { n: f.number(v) }));
  // 상태 · 종류 카드로 거르기 (목록 틀 — components/listframe). cs = 상태, ck = 종류
  const STATES = ['DRAFT', 'FINALIZED', 'WITHDRAWN'] as const;
  const cs = (STATES as readonly string[]).includes(sp.cs ?? '') ? (sp.cs as string) : null;
  const ck = (KINDS as readonly string[]).includes(sp.ck ?? '') ? (sp.ck as string) : null;
  const cLink = (s2: string | null, k2: string | null) => `/admin/payroll/retirement?${[s2 ? `cs=${s2}` : '', k2 ? `ck=${k2}` : '', sp.live === '1' ? 'live=1' : ''].filter(Boolean).join('&')}`;
  const shown = cases.filter((k) => (!cs || k.state === cs) && (!ck || k.kind === ck));

  return (
    <PageShell wide>
      <div>
        <h1 className="flex flex-wrap items-center gap-x-1 text-2xl font-bold">
          {t('title')}
          {practice && <Chip>{t('practice')}</Chip>}
        <HelpTip>{t('intro')}</HelpTip></h1>
      </div>
      <WarnLine short={t('legalShort')}>{t('legal')}</WarnLine>
      <Card className="flex flex-col gap-4">
        <CardTitle>{t('newTitle')}</CardTitle>
        <form action="/admin/payroll/retirement" className="flex flex-wrap items-end gap-3 text-sm">
          {sp.live === '1' && <input type="hidden" name="live" value="1" />}
          <label className="flex flex-col gap-1">
            <span className="font-bold">{t('fEmployee')}</span>
            <select name="emp" required defaultValue={(emp?.id as string) ?? ''} className={field}>
              <option value="">{t('pick')}</option>
              {people.map((p) => (
                <option key={p.id as string} value={p.id as string}>
                  {p.name as string} ({p.employee_no as string}){p.active ? '' : ` · ${t('inactive')}`}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-bold">{t('fKind')}</span>
            <select name="kind" defaultValue={kind} className={field}>
              {KINDS.map((k) => (
                <option key={k} value={k}>{t(`kind.${k}`)}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-bold">{t('fLastDay')}</span>
            <input type="date" name="to" defaultValue={to} className={field} />
          </label>
          <button type="submit" className="inline-flex min-h-9 items-center rounded-button border border-border bg-bg px-4 text-sm font-bold text-primary">{t('fill')}</button>
        </form>
        {emp && filled && (
          <div className="flex flex-col gap-3 border-t border-border pt-4">
            <p className="font-bold">{t('fillTitle', { name: emp.name as string, kind: t(`kind.${kind}`) })}</p>
            <ul className="list-disc pl-5 text-sm text-muted">
              <li>{t(`from.${filled.sources.joinedFrom ?? 'none'}`)}</li>
              <li>{filled.sources.wageComplete ? t('wageFilled', { months: filled.sources.wageMonths.join(', ') }) : t('wageEmpty')}</li>
              <li>{t('bonusFilled', { n: filled.sources.bonusCount })}</li>
            </ul>
            <CaseForm key={`${emp.id}${kind}${to}`} mode="create" employeeId={emp.id as string} kind={kind} initial={filled.input} live={sp.live === '1'} />
          </div>
        )}
      </Card>
      <StatusCards
        groups={[
          { title: t('cardsState'), cards: STATES.map((k) => ({ key: k, label: t(`state.${k}`), n: cases.filter((c) => c.state === k).length, unit: t('unit'), href: cLink(cs === k ? null : k, ck), on: cs === k, tone: k === 'FINALIZED' ? ('ok' as const) : undefined })) },
          { title: t('cardsKind'), cards: KINDS.map((k) => ({ key: k, label: t(`kind.${k}`), n: cases.filter((c) => c.kind === k).length, unit: t('unit'), href: cLink(cs, ck === k ? null : k), on: ck === k })) },
        ]}
      />
      {(cs || ck) && (
        <Link href={cLink(null, null)} className="self-start text-sm font-bold text-primary">
          {t('showAll')}
        </Link>
      )}
      <div className="overflow-x-auto rounded-card border border-border bg-bg">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface text-left">
              {['colName', 'colKind', 'colPeriod', 'colAmount', 'colState', 'colMade'].map((k) => (
                <th key={k} scope="col" className="px-3 py-2.5 text-xs font-semibold whitespace-nowrap text-muted">{t(k)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((k) => (
              <tr key={k.id} className="border-b border-border last:border-b-0">
                <td className="px-3 py-3 whitespace-nowrap">
                  <Link href={`/admin/payroll/retirement/${k.id}`} className="font-bold text-primary hover:underline">{k.name}</Link> <span className="num text-xs text-muted">{k.employeeNo}</span>
                </td>
                <td className="px-3 py-3 whitespace-nowrap">{t(`kind.${k.kind}`)}{k.revision > 1 ? ` · ${t('rev', { n: k.revision })}` : ''}</td>
                <td className="num px-3 py-3 whitespace-nowrap">{k.periodFrom} ~ {k.periodTo}</td>
                <td className="num px-3 py-3 text-right whitespace-nowrap">{won(k.amount)}</td>
                <td className="px-3 py-3"><Chip tone={TONE[k.state]}>{t(`state.${k.state}`)}</Chip></td>
                <td className="num px-3 py-3 whitespace-nowrap">{toKstDate(new Date(k.createdAt))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <p className="p-4 text-sm text-faint">{t('empty')}</p>}
      </div>
    </PageShell>
  );
}
