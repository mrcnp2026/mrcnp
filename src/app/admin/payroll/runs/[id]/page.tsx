// 급여대장 상세 — 대상자마다 계산 결과(또는 차단 사유)를 보고 계산 → 검토 → 확정한다 (PRD v1.3 18.3 · 19장). 급여 담당 관리자만.
// 초안 합계와 확정 합계를 섞지 않는다: 위의 합계는 이 대장이 지금 가리키는 계산 결과의 것이고, 상태를 같이 보여 준다.
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, Chip, PageShell } from '@/components/ui';
import { getMe } from '@/lib/auth';
import { groupPath } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { loadRevisions, loadRun, loadRunBoard } from '@/lib/payroll/run-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';
import { loadPublication } from '@/lib/payroll/publish-data';
import { CorrectionStart, MemberToggle, PublishAll, PublishToggle, RunActions } from '../RunForms';

const TONE = { DRAFT: 'neutral', CALCULATED: 'info', REVIEWED: 'warn', FINALIZED: 'ok' } as const;

export default async function PayRunPage({ params }: { params: Promise<{ id: string }> }) {
  const [t, f, me, { id }] = await Promise.all([getTranslations('admin.payRuns'), getFormatter(), getMe(), params]);
  if (!me || me.role !== 'admin' || !me.canViewPayroll) return <PageShell><p className="rounded-card bg-warn-tint p-4 text-sm text-warn">{t('forbidden')}</p></PageShell>;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const run = await loadRun(id);
  if (!run || run.kind === 'DAILY') notFound(); // 일용 대장은 일용직 화면에서 연다
  const [{ lines, stale }, groups, { data: who }] = await Promise.all([loadRunBoard(run), loadOrgGroups(), createAdminClient().from('profiles').select('id, name').in('id', [run.createdBy, run.reviewedBy, run.finalizedBy].filter((x): x is string => !!x))]);
  const nameOf = new Map((who ?? []).map((p) => [p.id as string, p.name as string]));
  const won = (v: unknown) => t('won', { n: f.number(Number(v ?? 0)) });
  const included = lines.filter((l) => l.included);
  const blocked = included.filter((l) => l.state === 'BLOCKED').length;
  const missing = Array.isArray(run.totals.missing) ? (run.totals.missing as unknown as string[]) : [];
  const final = run.status === 'FINALIZED';
  // 같은 대장의 다른 판 (정정)
  const revs = await loadRevisions(run);
  const newer = revs.filter((r) => r.revision > run.revision).at(-1) ?? null;
  const original = revs.find((r) => r.id === run.supersedesId) ?? null;
  const replaced = !!newer && newer.status === 'FINALIZED'; // 정정본이 확정됐다 — 이 판은 더 공개하지 않는다
  // 확정한 대장: 직원별 공개 상태 (공개는 확정과 따로 한다)
  const pub: Map<string, { statementId: string; published: boolean; at: string | null }> = final ? await loadPublication(run.id, run.generationId) : new Map();
  const waiting = [...pub.values()].filter((x) => !x.published).length;
  const dk = (d: string) => d.replace(/[.-]/g, '_'); // 번역 열쇠에는 점 · 줄표를 쓸 수 없다
  const why = (b: { code: string; detail?: string }) => (t.has(`blocker.${b.code}`) ? t(`blocker.${b.code}`, { detail: b.detail ? (t.has(`detail.${dk(b.detail)}`) ? t(`detail.${dk(b.detail)}`) : b.detail) : '' }) : `${b.code}${b.detail ? ` (${b.detail})` : ''}`);

  return (
    <PageShell wide>
      <Link href={`/admin/payroll/runs${run.isTest ? '' : '?live=1'}`} className="inline-flex min-h-9 items-center self-start text-sm font-medium text-muted">
        ‹ {t('back')}
      </Link>
      <div>
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold">
          {t('runTitle', { month: run.periodFrom.slice(0, 7) })}
          <Chip tone={TONE[run.status]}>{t(`status.${run.status}`)}</Chip>
          {run.kind !== 'REGULAR' && <Chip tone="info">{t('kindSeq', { kind: t(`kind.${run.kind}`), n: run.sequence })}</Chip>}
          {run.isTest && <Chip>{t('practiceChip')}</Chip>}
        </h1>
        <p className="num pt-1 text-sm text-faint">
          {t('runMeta', { from: run.periodFrom, to: toKstDate(new Date(Date.parse(`${run.periodTo}T00:00:00Z`) - 86400000)), pay: run.payDate })}
          {run.reviewedAt && run.status !== 'DRAFT' && run.status !== 'CALCULATED' && ` · ${t('reviewedBy', { name: nameOf.get(run.reviewedBy ?? '') ?? '', date: toKstDate(new Date(run.reviewedAt)) })}`}
          {run.finalizedAt && ` · ${t('finalizedBy', { name: nameOf.get(run.finalizedBy ?? '') ?? '', date: toKstDate(new Date(run.finalizedAt)) })}`}
        </p>
      </div>

      {run.revision > 1 && (
        <p className="rounded-card border border-border bg-surface p-3 text-sm">
          <b>{t('revision', { n: run.revision })}</b> · {t('correctionOf', { reason: run.correctionReason ?? '' })}{' '}
          {original && (
            <Link href={`/admin/payroll/runs/${original.id}`} className="font-bold text-primary hover:underline">
              {t('toOriginal', { n: original.revision })}
            </Link>
          )}
        </p>
      )}
      {newer && (
        <p className="rounded-card border border-warn bg-warn-tint p-3 text-sm text-warn">
          {t(replaced ? 'replacedBy' : 'correctionOpen', { n: newer.revision })}{' '}
          <Link href={`/admin/payroll/runs/${newer.id}`} className="font-bold underline">
            {t('toRevision', { n: newer.revision })}
          </Link>
        </p>
      )}
      {final ? (
        <Card className="flex flex-col gap-3">
          <p className="text-sm text-muted">{t('finalNote')}</p>
          <p className="num text-sm">{t('pubSummary', { on: pub.size - waiting, off: waiting })}</p>
          {!replaced && <PublishAll id={run.id} waiting={waiting} />}
          {!newer && <CorrectionStart id={run.id} />}
        </Card>
      ) : (
        <Card className="flex flex-col gap-3">
          <ol className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
            {(['DRAFT', 'CALCULATED', 'REVIEWED', 'FINALIZED'] as const).map((s, i) => (
              <li key={s} className={run.status === s ? 'font-bold text-text' : ''}>
                {i + 1}. {t(`step.${s}`)}
              </li>
            ))}
          </ol>
          {stale && <p className="rounded-button border border-warn bg-warn-tint p-2 text-sm text-warn">{t('stale')}</p>}
          {!stale && blocked > 0 && <p className="rounded-button border border-warn bg-warn-tint p-2 text-sm text-warn">{t('hasBlocked', { n: blocked })}</p>}
          {missing.length > 0 && <p className="text-sm text-warn">{t('missingRef', { list: missing.map((k) => (t.has(`detail.${dk(k)}`) ? t(`detail.${dk(k)}`) : k)).join(' · ') })}</p>}
          <RunActions id={run.id} version={run.version} status={run.status} stale={stale} blocked={blocked} />
        </Card>
      )}

      {run.kind === 'BONUS' && !final && <p className="rounded-card border border-border bg-surface p-3 text-sm text-muted">{t('bonusNote')}</p>}
      {run.generationId && (
        <a href={`/api/admin/payroll/runs/${run.id}/export`} className="inline-flex h-8 items-center gap-1 self-start rounded-button border border-nav bg-bg px-4 text-sm font-bold text-nav">
          {t('exportDo')}
        </a>
      )}
      {run.generationId && (
        <dl className="grid gap-3 text-sm md:grid-cols-5">
          {[
            ['sumMembers', t('membersValue', { ok: Number(run.totals.ok ?? 0), blocked: Number(run.totals.blocked ?? 0) })],
            ['colPay', won(run.totals.pay)],
            ['colDeduction', won(run.totals.deduction)],
            ['colNet', won(run.totals.net)],
            ['colEmployer', won(run.totals.employer)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-card border border-border bg-bg p-3">
              <dt className="text-xs text-muted">{t(k)}</dt>
              <dd className="num pt-1 text-lg font-bold">{v}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="overflow-x-auto rounded-card border border-border bg-bg">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface text-left">
              {['colName', 'colGroup', 'colClose', 'colResult', 'colPay', 'colDeduction', 'colNet', final ? 'colPublish' : 'colManage'].map((k) => (
                <th key={k} scope="col" className="px-3 py-2.5 text-xs font-semibold whitespace-nowrap text-muted">
                  {t(k)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.employeeId} className={`border-b border-border align-top ${l.included ? '' : 'text-faint'}`}>
                <td className="px-3 py-3">
                  <Link href={`/admin/payroll/runs/${run.id}/${l.employeeId}`} className="font-bold text-primary hover:underline">
                    {l.name}
                  </Link>
                  <span className="num block text-xs text-faint">{l.employeeNo}</span>
                </td>
                <td className="px-3 py-3 text-muted">{groupPath(groups, l.groupId) ?? ''}</td>
                <td className="px-3 py-3 whitespace-nowrap">{l.closed ? <Chip tone="ok">{t('closed')}</Chip> : <Chip tone="warn">{t('notClosed')}</Chip>}</td>
                <td className="px-3 py-3">
                  {!l.included ? (
                    <span>
                      <Chip>{t('excluded')}</Chip>
                      <span className="block pt-1 text-xs">{l.exclusionReason}</span>
                    </span>
                  ) : l.state === null ? (
                    <span className="text-faint">{t('notCalculated')}</span>
                  ) : l.state === 'OK' ? (
                    <span>
                      <Chip tone="ok">{t('resultOk')}</Chip>
                      {l.blockers.filter((b) => b.warning).map((b, i) => (
                        <span key={i} className="block pt-1 text-xs text-muted">
                          {why(b)}
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className="flex flex-col gap-1">
                      <Chip tone="warn">{t('resultBlocked', { n: l.blockers.filter((b) => !b.warning).length })}</Chip>
                      {l.blockers.filter((b) => !b.warning).map((b, i) => (
                        <span key={i} className="text-xs text-warn">
                          {why(b)}
                        </span>
                      ))}
                    </span>
                  )}
                </td>
                <td className="num px-3 py-3 whitespace-nowrap">{l.included && l.pay !== null ? won(l.pay) : ''}</td>
                <td className="num px-3 py-3 whitespace-nowrap">{l.included && l.deduction !== null ? won(l.deduction) : ''}</td>
                <td className="num px-3 py-3 font-bold whitespace-nowrap">{l.included && l.net !== null ? won(l.net) : ''}</td>
                <td className="px-3 py-3">
                  {!final && <MemberToggle id={run.id} employeeId={l.employeeId} included={l.included} name={l.name} />}
                  {final && pub.has(l.employeeId) && (
                    <span className="flex flex-col gap-1">
                      {pub.get(l.employeeId)!.published ? <Chip tone="ok">{t('pubOn', { date: toKstDate(new Date(pub.get(l.employeeId)!.at ?? 0)) })}</Chip> : <Chip>{t(pub.get(l.employeeId)!.at ? 'pubWithdrawn' : 'pubOff')}</Chip>}
                      {(!replaced || pub.get(l.employeeId)!.published) && <PublishToggle id={run.id} employeeId={l.employeeId} published={pub.get(l.employeeId)!.published} name={l.name} />}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-faint">{t('note')}</p>
    </PageShell>
  );
}
