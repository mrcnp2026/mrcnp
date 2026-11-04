// 일용 대장의 한 사람 — 지급 · 공제 · 회사 부담을 항목마다(계산 방법 포함), 하루별 내역, 최고관리자의 금액 조정 (2026-10-28 급여-58).
// 조정은 확정 전 대장에서만 넣고, 넣은 뒤 대장에서 「다시 계산」해야 반영된다. 확정한 대장은 정정 판에서 고친다.
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, CardTitle, Chip, PageShell } from '@/components/ui';
import { getMe } from '@/lib/auth';
import { loadItems } from '@/lib/payroll/data';
import { loadAdjustments, loadDailyBoard } from '@/lib/payroll/daily-data';
import { AUTO_PAYMENT_CODES, canonicalItemCode } from '@/lib/payroll/engine/reserved-items';
import { AdjustForm, AdjustRemove, type ItemOpt } from '../../../DailyForms';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_ITEMS = new Set(['PENSION', 'HEALTH', 'LTC', 'EMPLOYMENT', 'INCOME_TAX', 'LOCAL_TAX', 'NP', 'HI', 'EI']);

export default async function DailyPayeePage({ params }: { params: Promise<{ id: string; payeeId: string }> }) {
  const [t, f, me, { id, payeeId }] = await Promise.all([getTranslations('admin.daily'), getFormatter(), getMe(), params]);
  if (!me || me.role !== 'admin' || !me.canViewPayroll) return <PageShell><p className="rounded-card bg-warn-tint p-4 text-sm text-warn">{t('forbidden')}</p></PageShell>;
  if (!UUID.test(id) || !UUID.test(payeeId)) notFound();
  const board = await loadDailyBoard(id, me);
  const l = board?.lines.find((x) => x.payeeId === payeeId);
  if (!board || !l) notFound();
  const { run } = board;
  const [adjs, allItems] = await Promise.all([loadAdjustments(run.id), loadItems()]);
  const mine = adjs.filter((a) => a.payeeId === payeeId);
  const items: ItemOpt[] = allItems.filter((i) => i.inUse && !AUTO_PAYMENT_CODES.has(canonicalItemCode(i.code)) && !NOT_ITEMS.has(canonicalItemCode(i.code))).map((i) => ({ code: i.code, name: i.koName, kind: i.kind, nontax: i.taxTreatment === 'EXEMPT', amount: i.defaultAmount }));
  const won = (v: number | null) => (v === null ? '—' : t('won', { n: f.number(v) }));
  const part = (kind: 'PAYMENT' | 'DEDUCTION' | 'EMPLOYER') => l.lines.filter((x) => x.kind === kind);
  const canAdjust = me.top && run.status !== 'FINALIZED';
  const autos = l.lines.filter((x) => x.kind === 'DEDUCTION' && x.source !== 'MANUAL' && ['NP', 'HI', 'LTC', 'EI', 'INCOME_TAX', 'LOCAL_TAX', 'BIZ_TAX', 'BIZ_LOCAL_TAX'].includes(x.code)).map((x) => ({ code: x.code, label: x.label, amount: x.amount }));
  // 아직 자동 줄이 없는 보험도 조정으로 넣을 수 있게(「자동」이 제외로 판단한 경우)
  for (const [code, label] of [['NP', t('c.np')], ['HI', t('c.hi')], ['LTC', t('c.ltc')], ['EI', t('c.ei')]] as const) if (!autos.some((a) => a.code === code)) autos.push({ code, label, amount: 0 });

  return (
    <PageShell wide>
      <Link prefetch={false} href={`/admin/payroll/daily/runs/${run.id}`} className="inline-flex min-h-9 items-center self-start text-sm font-medium text-muted">‹ {t('runName', { month: run.periodFrom.slice(0, 7), n: run.sequence })}</Link>
      <div>
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold">
          {l.name}
          <Chip tone={l.workerKind === 'FOREIGN' ? 'info' : 'neutral'}>{l.workerKind === 'FOREIGN' ? `${t('kind.FOREIGN')} ${l.visaType ?? ''}` : t('kind.GENERAL')}</Chip>
          {l.state === 'BLOCKED' ? <Chip tone="warn">{t('notCalculated')}</Chip> : run.status !== 'FINALIZED' && <Chip tone="warn">{t('draftChip')}</Chip>}
        </h1>
        <p className="num pt-1 text-sm text-faint">{l.internalNo} · {t('cDays')} {l.workDays ?? '—'}{l.manDays ? ` · ${t('u.man', { n: f.number(l.manDays) })}` : ''}{l.hours ? ` · ${t('u.hours', { n: f.number(l.hours) })}` : ''}</p>
      </div>
      {l.state === 'BLOCKED' && <p className="rounded-card border border-warn bg-warn-tint p-3 text-sm text-warn">{l.blockers.map((b) => t(`blocker.${b}`)).join(' ')}</p>}
      {l.state === 'OK' && (
        <>
          <Card className="flex items-center justify-between gap-3">
            <span className="font-bold">{t('c.net')}</span>
            <span className="num text-2xl font-extrabold">{won(l.net)}</span>
          </Card>
          {l.lines.length === 0 && <p className="text-sm text-muted">{t('legacyNoLines')}</p>}
          {(['PAYMENT', 'DEDUCTION', 'EMPLOYER'] as const).map((kind) => part(kind).length > 0 && (
            <Card key={kind}>
              <CardTitle aside={kind !== 'EMPLOYER' && <span className="num font-bold">{won(kind === 'PAYMENT' ? l.gross : l.deduction)}</span>}>{t(`part.${kind}`)}</CardTitle>
              <ul className="flex flex-col divide-y divide-border pt-2">
                {part(kind).map((x, i) => (
                  <li key={`${x.code}${i}`} className="flex items-start justify-between gap-3 py-2 text-sm">
                    <span className="flex flex-col">
                      <span className="flex flex-wrap items-center gap-2">{x.label}{x.source === 'OVERRIDE' && <Chip tone="info">{t('adj.chip')}</Chip>}{kind === 'PAYMENT' && x.taxable === false && <span className="text-xs text-muted">{t('item.NONTAX')}</span>}</span>
                      {x.how && <span className="num text-xs text-muted">{x.how}</span>}
                    </span>
                    <span className="num font-bold whitespace-nowrap">{won(x.amount)}</span>
                  </li>
                ))}
              </ul>
              {kind === 'EMPLOYER' && <p className="pt-2 text-xs text-faint">{t('employerNote')}</p>}
            </Card>
          ))}
          {l.days.length > 0 && (
            <details className="rounded-card border border-border bg-bg p-4 text-sm">
              <summary className="cursor-pointer font-bold">{t('daysToggle', { n: l.days.length })}</summary>
              <ul className="num flex flex-col gap-1 pt-2 text-muted">
                {l.days.map((d, i) => <li key={i}>{t('dayLine', { date: d.workDate, gross: f.number(d.gross), tax: f.number(d.incomeTax), local: f.number(d.localTax) })}</li>)}
              </ul>
            </details>
          )}
          <a href={`/api/admin/payroll/daily/runs/${run.id}/pdf?payee=${l.payeeId}`} className="inline-flex h-9 items-center self-start rounded-button border border-border bg-bg px-3.5 text-sm font-semibold hover:bg-surface">{t('pdf')}</a>
        </>
      )}

      <Card>
        <CardTitle>{t('adj.title')}</CardTitle>
        {mine.length === 0 && <p className="pt-2 text-sm text-faint">{t('adj.none')}</p>}
        <ul className="flex flex-col divide-y divide-border pt-2">
          {mine.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
              <b>{a.label}</b>
              <span className="num">{won(a.amount)}</span>
              <span className="text-xs text-muted">{a.reason}</span>
              {canAdjust && <span className="ml-auto"><AdjustRemove id={a.id} /></span>}
            </li>
          ))}
        </ul>
        {canAdjust ? (
          <div className="border-t border-border pt-3">
            <AdjustForm runId={run.id} payeeId={l.payeeId} autos={autos} items={items} />
          </div>
        ) : (
          <p className="pt-2 text-xs text-faint">{t(run.status === 'FINALIZED' ? 'adj.finalized' : 'adj.topOnly')}</p>
        )}
      </Card>
    </PageShell>
  );
}
