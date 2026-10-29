// 일용 대장 한 건 — 급여대장처럼 항목별로 (2026-10-28 급여-58): 근무일 · 공수/시간 · 총지급 · 과세/비과세 · 4대보험 · 소득세/지방소득세 · 공제 항목마다 · 공제계 · 실지급.
// 계산 → 검토 → 확정. 계산하지 못한 사람은 이유와 고칠 곳을 바로 보인다. 사람을 누르면 항목별 내역과 최고관리자의 금액 조정.
// 근무월(대장의 달)과 지급일을 따로 적는다. 확정 전에는 「검토용」이다. 신고용 파일이 아니다. 폰에서는 표 대신 카드.
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Chip, PageShell } from '@/components/ui';
import { getMe } from '@/lib/auth';
import { loadDailyBoard, loadDailyRevisions, type DailyLine } from '@/lib/payroll/daily-data';
import { AUTO_CODES } from '@/lib/payroll/daily';
import { DailyRunActions } from '../../DailyForms';

const RTONE = { DRAFT: 'neutral', CALCULATED: 'info', REVIEWED: 'warn', FINALIZED: 'ok' } as const;
// 계산하지 못한 이유마다 고칠 곳
const FIX: Record<string, 'payee' | 'work'> = { tax_unknown: 'payee', insurance_unknown: 'payee', unconfirmed_work: 'work', no_work: 'work', insurance_ref_missing: 'payee' };

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
  const won = (v: number | null | undefined) => (v === null || v === undefined ? '—' : f.number(v));
  const month = run.periodFrom.slice(0, 7);
  const blocked = lines.filter((l) => l.state === 'BLOCKED');
  const ok = lines.filter((l) => l.state === 'OK');
  // 공제 항목 열 — 4대보험 · 세금 말고 사람들에게 들어 있는 공제 이름마다 한 열
  const extra = [...new Set(ok.flatMap((l) => l.lines.filter((x) => x.kind === 'DEDUCTION' && !(AUTO_CODES as readonly string[]).includes(x.code)).map((x) => x.label)))];
  const extraOf = (l: DailyLine, label: string) => l.lines.filter((x) => x.kind === 'DEDUCTION' && x.label === label && !(AUTO_CODES as readonly string[]).includes(x.code)).reduce((s, x) => s + x.amount, 0);
  const tax = (l: DailyLine, which: 'income' | 'local') => (which === 'income' ? l.incomeTax : l.localTax);
  const adjusted = (l: DailyLine) => l.lines.some((x) => x.source === 'OVERRIDE');
  const legacyOther = ok.some((l) => !l.lines.length && (l.otherDeduction ?? 0) > 0); // 항목별 내역이 없던 예전 명세
  const cols: { key: string; label: string; get: (l: DailyLine) => number | null | undefined; strong?: boolean }[] = [
    { key: 'gross', label: t('c.gross'), get: (l) => l.gross },
    { key: 'taxable', label: t('c.taxable'), get: (l) => l.taxable },
    { key: 'nontax', label: t('c.nontax'), get: (l) => l.nontax },
    { key: 'np', label: t('c.np'), get: (l) => l.insurance?.np ?? null },
    { key: 'hi', label: t('c.hi'), get: (l) => l.insurance?.hi ?? null },
    { key: 'ltc', label: t('c.ltc'), get: (l) => l.insurance?.ltc ?? null },
    { key: 'ei', label: t('c.ei'), get: (l) => l.insurance?.ei ?? null },
    { key: 'incomeTax', label: t('c.incomeTax'), get: (l) => tax(l, 'income') },
    { key: 'localTax', label: t('c.localTax'), get: (l) => tax(l, 'local') },
    ...extra.map((label) => ({ key: `x:${label}`, label, get: (l: DailyLine) => extraOf(l, label) })),
    ...(legacyOther ? [{ key: 'other', label: t('c.otherDeduction'), get: (l: DailyLine) => (l.lines.length ? null : l.otherDeduction) }] : []),
    { key: 'deduction', label: t('c.deduction'), get: (l) => l.deduction },
    { key: 'net', label: t('c.net'), get: (l) => l.net, strong: true },
  ];
  const sum = (get: (l: DailyLine) => number | null | undefined) => ok.reduce((s, l) => s + (get(l) ?? 0), 0);
  const units = (l: DailyLine) => [l.manDays ? t('u.man', { n: f.number(l.manDays) }) : null, l.hours ? t('u.hours', { n: f.number(l.hours) }) : null].filter(Boolean).join(' · ') || '—';
  const who = (l: DailyLine) => (
    <span className="flex flex-col">
      <Link href={`/admin/payroll/daily/runs/${run.id}/${l.payeeId}`} className="font-bold text-primary hover:underline">{l.name}</Link>
      <span className="num text-xs text-muted">{l.internalNo}{l.workerKind === 'FOREIGN' ? ` · ${t('kind.FOREIGN')} ${l.visaType ?? ''}` : ''}</span>
    </span>
  );

  return (
    <PageShell wide>
      <Link href="/admin/payroll/daily?v=runs" className="inline-flex min-h-9 items-center self-start text-sm font-medium text-muted">‹ {t('tab.runs')}</Link>
      <div>
        <h1 className="num flex flex-wrap items-center gap-2 text-2xl font-bold">
          {t('runName', { month, n: run.sequence })}
          <Chip tone={RTONE[run.status]}>{t(`rState.${run.status}`)}</Chip>
          {run.status !== 'FINALIZED' && <Chip tone="warn">{t('draftChip')}</Chip>}
          {run.isTest && <Chip>{t('practice')}</Chip>}
          {run.revision > 1 && <Chip tone="info">{t('revision', { n: run.revision })}</Chip>}
        </h1>
        <p className="num pt-1 text-sm text-faint">{t('runMeta', { month, payDate: run.payDate })}</p>
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
      {/* 한눈에 — 인원 · 총지급 · 공제계 · 실지급 */}
      {ok.length > 0 && (
        <dl className="num grid grid-cols-2 gap-3 md:grid-cols-4">
          {([['sumPeople', t('people', { n: ok.length })], ['sumGross', t('won', { n: won(sum((l) => l.gross)) })], ['sumDeduction', t('won', { n: won(sum((l) => l.deduction)) })], ['sumNet', t('won', { n: won(sum((l) => l.net)) })]] as const).map(([k, v]) => (
            <div key={k} className="flex flex-col gap-1 rounded-card border border-border bg-bg p-4">
              <dt className="text-xs text-muted">{t(k)}</dt>
              <dd className={`text-lg font-bold ${k === 'sumNet' ? 'text-primary' : ''}`}>{v}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="flex flex-wrap items-start gap-3">
        <DailyRunActions id={run.id} version={run.version} status={run.status} stale={stale} blocked={blocked.length} latest={!newer} />
        {run.generationId && <a href={`/api/admin/payroll/daily/runs/${run.id}/export`} className="inline-flex h-9 items-center rounded-button border border-border bg-bg px-3.5 text-sm font-semibold text-text hover:bg-surface sm:ml-auto">{t('excel')}</a>}
      </div>
      {stale && <p className="rounded-card border border-warn bg-warn-tint p-3 text-sm text-warn">{t('stale')}</p>}
      {blocked.length > 0 && (
        <section className="flex flex-col gap-2 rounded-card border border-warn bg-warn-tint p-4 text-sm text-warn">
          <p className="font-bold">{t('hasBlocked', { n: blocked.length })}</p>
          <ul className="flex flex-col gap-2">
            {blocked.map((l) => (
              <li key={l.payeeId} className="flex flex-col gap-1">
                <b>{l.name} <span className="num text-xs font-normal">{l.internalNo}</span></b>
                {l.blockers.map((b) => (
                  <span key={b} className="flex flex-wrap items-center gap-2">
                    {t(`blocker.${b}`)}
                    <Link href={FIX[b] === 'work' ? `/admin/payroll/daily?v=work&m=${month}&p=${l.payeeId}` : `/admin/payroll/daily#payee-${l.payeeId}`} className="font-bold text-primary underline">{t(FIX[b] === 'work' ? 'fixWork' : 'fixPayee')} ›</Link>
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </section>
      )}

      {lines.length === 0 && <p className="rounded-card border border-border p-6 text-center text-sm text-faint">{t('runNotCalculated')}</p>}

      {/* 넓은 화면: 급여대장 같은 표 */}
      {ok.length > 0 && (
        <div className="hidden overflow-x-auto rounded-card border border-border lg:block">
          <table className="w-full text-sm" data-daily>
            <thead>
              <tr className="border-b border-border bg-surface text-left">
                <th scope="col" className="sticky left-0 bg-surface px-3 py-2.5 text-xs font-semibold text-muted">{t('cPayee')}</th>
                <th scope="col" className="px-3 py-2.5 text-right text-xs font-semibold whitespace-nowrap text-muted">{t('cDays')}</th>
                <th scope="col" className="px-3 py-2.5 text-right text-xs font-semibold whitespace-nowrap text-muted">{t('cUnits')}</th>
                {cols.map((c) => <th key={c.key} scope="col" className="px-3 py-2.5 text-right text-xs font-semibold whitespace-nowrap text-muted">{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {ok.map((l) => (
                <tr key={l.payeeId} className="border-b border-border align-top hover:bg-surface">
                  <td className="sticky left-0 bg-bg px-3 py-3 whitespace-nowrap">
                    {who(l)}
                    {adjusted(l) && <span className="pt-1"><Chip tone="info">{t('adj.chip')}</Chip></span>}
                    {l.warnings.map((w) => <span key={w} className="block max-w-56 pt-1 text-xs whitespace-normal text-muted">{t(`warning.${w}`)}</span>)}
                  </td>
                  <td className="num px-3 py-3 text-right">{l.workDays === null ? '—' : f.number(l.workDays)}</td>
                  <td className="num px-3 py-3 text-right whitespace-nowrap">{units(l)}</td>
                  {cols.map((c) => <td key={c.key} className={`num px-3 py-3 text-right whitespace-nowrap ${c.strong ? 'font-bold' : ''}`}>{won(c.get(l))}</td>)}
                </tr>
              ))}
              <tr className="bg-surface font-bold">
                <td className="sticky left-0 bg-surface px-3 py-2.5">{t('sum', { n: ok.length })}</td>
                <td className="num px-3 py-2.5 text-right">{f.number(ok.reduce((a, l) => a + (l.workDays ?? 0), 0))}</td>
                <td />
                {cols.map((c) => <td key={c.key} className="num px-3 py-2.5 text-right whitespace-nowrap">{won(sum(c.get))}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* 폰 · 좁은 화면: 사람마다 카드 */}
      {ok.length > 0 && (
        <ul className="flex flex-col gap-3 lg:hidden">
          {ok.map((l) => (
            <li key={l.payeeId} className="flex flex-col gap-3 rounded-card border border-border bg-bg p-4">
              <div className="flex items-start justify-between gap-3">
                {who(l)}
                <span className="num flex flex-col items-end">
                  <span className="text-xs text-muted">{t('c.net')}</span>
                  <b className="text-lg">{t('won', { n: won(l.net) })}</b>
                </span>
              </div>
              <p className="num text-xs text-muted">{t('cDays')} {l.workDays ?? '—'} · {units(l)}{adjusted(l) ? ` · ${t('adj.chip')}` : ''}</p>
              <dl className="num grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                {cols.filter((c) => c.key !== 'net').map((c) => {
                  const v = c.get(l);
                  if (!v && c.key !== 'gross' && c.key !== 'deduction') return null;
                  return (
                    <div key={c.key} className="flex justify-between gap-2">
                      <dt className="text-muted">{c.label}</dt>
                      <dd className={c.key === 'gross' || c.key === 'deduction' ? 'font-bold' : ''}>{won(v)}</dd>
                    </div>
                  );
                })}
              </dl>
              {l.warnings.map((w) => <p key={w} className="text-xs text-muted">{t(`warning.${w}`)}</p>)}
            </li>
          ))}
          <li className="num flex justify-between rounded-card bg-surface p-4 text-sm font-bold">
            <span>{t('sum', { n: ok.length })}</span>
            <span>{t('c.net')} {t('won', { n: won(sum((l) => l.net)) })}</span>
          </li>
        </ul>
      )}
      <p className="text-xs text-faint">{t('ruleNote')}</p>
      <p className="text-xs text-faint">{t('insRuleNote')}</p>
    </PageShell>
  );
}
