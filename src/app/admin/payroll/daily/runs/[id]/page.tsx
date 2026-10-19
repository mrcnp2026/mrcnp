// 일용 대장 한 건 — 대상자마다 근무일수 · 총지급 · 과세/비과세 · 소득세/지방소득세 · 공제 · 실지급, 계산 → 검토 → 확정 (PRD v1.3 18.5 W07). 급여 담당 관리자만.
// 근무월(대장의 달)과 지급일을 따로 적는다. 확정 전에는 「검토용」이다. 신고용 파일이 아니다.
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Chip, PageShell } from '@/components/ui';
import { getMe } from '@/lib/auth';
import { loadDailyBoard, loadDailyRevisions } from '@/lib/payroll/daily-data';
import { DailyRunActions } from '../../DailyForms';

const RTONE = { DRAFT: 'neutral', CALCULATED: 'info', REVIEWED: 'warn', FINALIZED: 'ok' } as const;

export default async function DailyRunPage({ params }: { params: Promise<{ id: string }> }) {
  const [t, f, me, { id }] = await Promise.all([getTranslations('admin.daily'), getFormatter(), getMe(), params]);
  if (!me || me.role !== 'admin' || !me.canViewPayroll) return <PageShell><p className="rounded-card bg-warn-tint p-4 text-sm text-warn">{t('forbidden')}</p></PageShell>;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  const board = await loadDailyBoard(id, me);
  if (!board) notFound();
  const { run, lines, stale } = board;
  const revs = await loadDailyRevisions(run);
  const newer = revs.filter((r) => r.revision > run.revision).at(-1) ?? null;
  const prev = run.supersedesId ? revs.find((r) => r.id === run.supersedesId) ?? null : null;
  const won = (v: number | null) => (v === null ? '' : t('won', { n: f.number(v) }));
  const blocked = lines.filter((l) => l.state === 'BLOCKED').length;
  const ok = lines.filter((l) => l.state === 'OK');
  const sum = (k: 'gross' | 'taxable' | 'nontax' | 'incomeTax' | 'localTax' | 'otherDeduction' | 'net') => ok.reduce((a, l) => a + (l[k] ?? 0), 0);
  const COLS = ['gross', 'taxable', 'nontax', 'incomeTax', 'localTax', 'otherDeduction', 'net'] as const;

  return (
    <PageShell wide>
      <Link href="/admin/payroll/daily?v=runs" className="inline-flex min-h-9 items-center self-start text-sm font-medium text-muted">
        ‹ {t('tab.runs')}
      </Link>
      <div>
        <h1 className="num flex flex-wrap items-center gap-2 text-2xl font-bold">
          {t('runName', { month: run.periodFrom.slice(0, 7), n: run.sequence })}
          <Chip tone={RTONE[run.status]}>{t(`rState.${run.status}`)}</Chip>
          {run.status !== 'FINALIZED' && <Chip tone="warn">{t('draftChip')}</Chip>}
          {run.isTest && <Chip>{t('practice')}</Chip>}
          {run.revision > 1 && <Chip tone="info">{t('revision', { n: run.revision })}</Chip>}
        </h1>
        <p className="num pt-1 text-sm text-faint">{t('runMeta', { month: run.periodFrom.slice(0, 7), payDate: run.payDate })}</p>
      </div>
      {prev && (
        <p className="rounded-card border border-border bg-surface p-3 text-sm">
          {t('correctionOf', { reason: run.correctionReason ?? '' })}{' '}
          <Link href={`/admin/payroll/daily/runs/${prev.id}`} className="font-bold text-primary">{t('seePrev', { n: prev.revision })} ›</Link>
        </p>
      )}
      {newer && (
        <p className="rounded-card border border-warn bg-warn-tint p-3 text-sm text-warn">
          {t('hasNewer', { n: newer.revision })}{' '}
          <Link href={`/admin/payroll/daily/runs/${newer.id}`} className="font-bold">{t('seeNewer')} ›</Link>
        </p>
      )}
      {run.generationId && (
        <a href={`/api/admin/payroll/daily/runs/${run.id}/export`} className="inline-flex min-h-9 items-center gap-1 self-start rounded-button border border-border bg-bg px-3.5 text-sm font-semibold text-text hover:bg-surface">
          {t('excel')}
        </a>
      )}
      {stale && <p className="rounded-card border border-warn bg-warn-tint p-3 text-sm text-warn">{t('stale')}</p>}
      {blocked > 0 && <p className="rounded-card border border-warn bg-warn-tint p-3 text-sm text-warn">{t('hasBlocked', { n: blocked })}</p>}
      <DailyRunActions id={run.id} version={run.version} status={run.status} stale={stale} blocked={blocked} latest={!newer} />
      <div className="overflow-x-auto table-ruled">
        <table className="w-full text-sm" data-daily>
          <thead>
            <tr className="border-b border-border bg-surface text-left">
              <th scope="col" className="px-3 py-2">{t('cPayee')}</th>
              <th scope="col" className="px-3 py-2 text-right whitespace-nowrap">{t('cDays')}</th>
              {COLS.map((k) => (
                <th key={k} scope="col" className="px-3 py-2 text-right whitespace-nowrap">{t(`c.${k}`)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.payeeId} className="border-b border-border align-top">
                <td className="px-3 py-3">
                  <b>{l.name}</b> <span className="num text-xs text-muted">{l.internalNo}</span>
                  {l.state === 'BLOCKED' && (
                    <ul className="pt-1 text-xs text-warn">
                      {l.blockers.map((b) => (
                        <li key={b}>{t(`blocker.${b}`)}</li>
                      ))}
                    </ul>
                  )}
                  {l.warnings.map((w) => (
                    <span key={w} className="block pt-1 text-xs text-muted">{t(`warning.${w}`)}</span>
                  ))}
                  {l.days.length > 0 && (
                    <details className="pt-1 text-xs text-muted">
                      <summary className="cursor-pointer">{t('daysToggle', { n: l.days.length })}</summary>
                      <ul className="num pt-1">
                        {l.days.map((d, i) => (
                          <li key={i}>{t('dayLine', { date: d.workDate, gross: f.number(d.gross), tax: f.number(d.incomeTax), local: f.number(d.localTax) })}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </td>
                <td className="num px-3 py-3 text-right">{l.workDays === null ? '' : f.number(l.workDays)}</td>
                {l.state === 'OK' ? COLS.map((k) => (
                  <td key={k} className={`num px-3 py-3 text-right whitespace-nowrap ${k === 'net' ? 'font-bold' : ''}`}>{won(l[k])}</td>
                )) : <td colSpan={COLS.length} className="px-3 py-3 text-right text-warn">{t('notCalculated')}</td>}
              </tr>
            ))}
            {ok.length > 0 && (
              <tr className="bg-surface font-bold">
                <td className="px-3 py-2">{t('sum', { n: ok.length })}</td>
                <td className="num px-3 py-2 text-right">{f.number(ok.reduce((a, l) => a + (l.workDays ?? 0), 0))}</td>
                {COLS.map((k) => (
                  <td key={k} className="num px-3 py-2 text-right whitespace-nowrap">{won(sum(k))}</td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
        {lines.length === 0 && <p className="p-4 text-sm text-faint">{t('runNotCalculated')}</p>}
      </div>
      <p className="text-xs text-faint">{t('ruleNote')}</p>
    </PageShell>
  );
}
