// 퇴직급여 — 위: 직원별 예상 퇴직금(오늘 그만둔다면) 목록, 이름을 누르면 계산 근거 / 아래: 퇴직 정산 · 중간정산 기록 (PRD v1.3 18.6 W08, 2026-10-25 의뢰인: 초보 관리자도 쉽게). 급여 담당 관리자만.
// 수동 검산이다: 직원과 마지막 근무일을 고르면 프로그램에 있는 자료로 칸을 미리 채워 주고, 담당자가 확인 · 고쳐서 건을 만든다.
import { Select } from '@/components/Select';
import { getFormatter, getTranslations } from 'next-intl/server';
import { HelpTip } from '@/components/Help';
import Link from 'next/link';
import { StatusCards, WarnLine } from '@/components/listframe';
import { Card, CardTitle, Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { getMe } from '@/lib/auth';
import { loadCases, suggestInput } from '@/lib/payroll/retirement-data';
import { rosterEstimates, type EstimateBasis } from '@/lib/payroll/retirement-roster';
import { PcTable } from '@/components/PcTable';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';
import { CaseForm } from './RetirementForms';

const field = 'min-h-9 rounded-button border border-border bg-bg px-3 text-sm';
const TONE = { DRAFT: 'neutral', FINALIZED: 'ok', WITHDRAWN: 'neutral' } as const;
const KINDS = ['ESTIMATE', 'FINAL', 'INTERIM'] as const;

export default async function RetirementPage({ searchParams }: { searchParams: Promise<{ emp?: string; kind?: string; to?: string; live?: string; cs?: string; ck?: string; all?: string }> }) {
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
  const roster = await rosterEstimates(today, practice, sp.all === '1');
  const BASIS_TONE: Record<EstimateBasis, 'ok' | 'warn' | 'neutral'> = { actual: 'ok', contract: 'warn', none: 'neutral' };
  const service = (days: number | null) => (days === null ? '' : t('yearsMonths', { y: Math.floor(days / 365), m: Math.floor((days % 365) / 30) }));
  const total = roster.reduce((a2, r) => a2 + (r.result.amount ?? 0), 0);
  const counted = roster.filter((r) => r.result.amount !== null).length;
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
      <Card className="flex flex-col gap-3">
        <CardTitle>{t('rosterTitle')}</CardTitle>
        <p className="text-sm text-muted">{t('rosterSub')}</p>
        <PcTable
          total
          labels={{ search: t('rosterSearch'), empty: t('rosterEmpty'), total: t('rosterTotal') }}
          cols={[
            { key: 'name', label: t('colName') },
            { key: 'from', label: t('colFrom') },
            { key: 'svc', label: t('colService') },
            { key: 'est', label: t('colEst'), align: 'right' },
            { key: 'basis', label: t('colBasis') },
          ]}
          rows={roster.map((r) => ({
            id: r.employeeId,
            dim: !r.active,
            cells: {
              name: { text: `${r.name} ${r.employeeNo ?? ''}`, node: <Link href={`/admin/payroll/retirement/staff/${r.employeeId}`} className="font-bold text-primary hover:underline">{r.name}{!r.active && <span className="pl-1 text-xs font-normal text-faint">{t('inactive')}</span>}</Link> },
              from: { text: r.periodFrom ?? '', node: <span className="num whitespace-nowrap">{r.periodFrom ?? t('blank')}</span> },
              svc: { text: service(r.result.serviceDays), node: <span className="whitespace-nowrap">{service(r.result.serviceDays) || t('blank')}</span> },
              est: { text: r.result.amount === null ? '' : String(r.result.amount), node: <span className="num font-bold whitespace-nowrap">{r.result.amount === null ? (r.result.missing.includes('under_one_year') ? t('under1y') : t('noAmountShort')) : won(r.result.amount)}</span> },
              basis: { text: t(`basis.${r.basis}`), node: <Chip tone={BASIS_TONE[r.basis]}>{t(`basis.${r.basis}`)}</Chip> },
            },
          }))}
        />
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <p className="num text-muted">{t('rosterSum', { n: won(total), k: counted })}</p>
          <Link href={sp.all === '1' ? '/admin/payroll/retirement' : '/admin/payroll/retirement?all=1'} className="font-semibold text-primary">{sp.all === '1' ? t('onlyActive') : t('withInactive')}</Link>
        </div>
        <p className="text-xs text-faint">{t('rosterNote')}</p>
      </Card>
      <Card>
        <CardTitle>{t('recordsTitle')}</CardTitle>
        <ul className="flex list-disc flex-col gap-1 pt-2 pl-5 text-sm text-muted">
          <li>{t('help1')}</li>
          <li>{t('help2')}</li>
          <li>{t('help3')}</li>
        </ul>
      </Card>
      <details id="new" open={!!emp} className="rounded-card border border-border bg-bg">
        <summary className="flex min-h-12 cursor-pointer items-center px-4 font-bold">{t('newTitle')}</summary>
      <Card className="flex flex-col gap-4 border-0">
        <form action="/admin/payroll/retirement" className="flex flex-wrap items-end gap-3 text-sm">
          {sp.live === '1' && <input type="hidden" name="live" value="1" />}
          <label className="flex flex-col gap-1">
            <span className="font-bold">{t('fEmployee')}</span>
            <Select name="emp" required defaultValue={(emp?.id as string) ?? ''} className={field}>
              <option value="">{t('pick')}</option>
              {people.map((p) => (
                <option key={p.id as string} value={p.id as string}>
                  {p.name as string} ({p.employee_no as string}){p.active ? '' : ` · ${t('inactive')}`}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-bold">{t('fKind')}</span>
            <Select name="kind" defaultValue={kind} className={field}>
              {KINDS.map((k) => (
                <option key={k} value={k}>{t(`kind.${k}`)}</option>
              ))}
            </Select>
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
              {((filled.sources.kindMoved ?? 0) > 0 || (filled.sources.kindLeft ?? 0) > 0) && <li>{t('kindApplied', { moved: f.number(filled.sources.kindMoved ?? 0), left: f.number(filled.sources.kindLeft ?? 0) })}</li>}
              {(filled.sources.undecided?.length ?? 0) > 0 && <li className="text-warn">{t('kindUndecided', { names: filled.sources.undecided!.join(', ') })}</li>}
            </ul>
            <CaseForm key={`${emp.id}${kind}${to}`} mode="create" employeeId={emp.id as string} kind={kind} initial={filled.input} live={sp.live === '1'} />
          </div>
        )}
      </Card>
      </details>
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
      <PcTable
        labels={{ search: t('rosterSearch'), empty: t('empty') }}
        cols={[
          { key: 'name', label: t('colName') },
          { key: 'kind', label: t('colKind') },
          { key: 'period', label: t('colPeriod') },
          { key: 'amount', label: t('colAmount'), align: 'right' },
          { key: 'state', label: t('colState') },
          { key: 'made', label: t('colMade') },
        ]}
        rows={shown.map((k) => ({
          id: k.id,
          cells: {
            name: { text: `${k.name} ${k.employeeNo ?? ''}`, node: <Link href={`/admin/payroll/retirement/${k.id}`} className="font-bold text-primary hover:underline">{k.name}</Link> },
            kind: { text: `${t(`kind.${k.kind}`)}${k.revision > 1 ? ` · ${t('rev', { n: k.revision })}` : ''}` },
            period: { text: `${k.periodFrom} ~ ${k.periodTo}`, node: <span className="num whitespace-nowrap">{k.periodFrom} ~ {k.periodTo}</span> },
            amount: { text: k.amount === null ? '' : String(k.amount), node: <span className="num whitespace-nowrap">{won(k.amount)}</span> },
            state: { text: t(`state.${k.state}`), node: <Chip tone={TONE[k.state]}>{t(`state.${k.state}`)}</Chip> },
            made: { text: toKstDate(new Date(k.createdAt)) },
          },
        }))}
      />
    </PageShell>
  );
}
