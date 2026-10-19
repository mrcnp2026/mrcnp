// 급여대장 상세 — 대상자마다 계산 결과(또는 차단 사유)를 보고 계산 → 검토 → 확정한다 (PRD v1.3 18.3 · 19장). 급여 담당 관리자만.
// 초안 합계와 확정 합계를 섞지 않는다: 위의 합계는 이 대장이 지금 가리키는 계산 결과의 것이고, 상태를 같이 보여 준다.
import { getFormatter, getTranslations } from 'next-intl/server';
import { Steps } from '@/components/listframe';
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
import { birthDates, lastMailBySlip, loadSlipMails, mailReady } from '@/lib/payroll/slip-mail';
import { SlipMailSend } from '../../slips/SlipMail';
import { MailLog, MailStatus } from '../../slips/SlipMailParts';
import { CorrectionStart, MemberToggle, PublishAll, PublishToggle, RunActions } from '../RunForms';

const TONE = { DRAFT: 'neutral', CALCULATED: 'info', REVIEWED: 'warn', FINALIZED: 'ok' } as const;

export default async function PayRunPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ existed?: string }> }) {
  const [t, tm, f, me, { id }] = await Promise.all([getTranslations('admin.payRuns'), getTranslations('admin.slipMail'), getFormatter(), getMe(), params]);
  if (!me || me.role !== 'admin' || !me.canViewPayroll) return <PageShell><p className="rounded-card bg-warn-tint p-4 text-sm text-warn">{t('forbidden')}</p></PageShell>;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  const run = await loadRun(id);
  if (!run || run.kind === 'DAILY') notFound(); // 일용 대장은 일용직 화면에서 연다
  const [{ lines, stale }, groups, { data: who }] = await Promise.all([loadRunBoard(run), loadOrgGroups(), createAdminClient().from('profiles').select('id, name').in('id', [run.createdBy, run.reviewedBy, run.finalizedBy].filter((x): x is string => !!x))]);
  const nameOf = new Map((who ?? []).map((p) => [p.id as string, p.name as string]));
  const won = (v: unknown) => t('won', { n: f.number(Number(v ?? 0)) });
  const included = lines.filter((l) => l.included);
  const blocked = included.filter((l) => l.state === 'BLOCKED').length;
  const okCount = included.filter((l) => l.state === 'OK').length; // 명세서 PDF는 계산된(OK) 사람만 — 0명이면 단추를 막고 이유를 보인다 (2026-10-19: 누르면 오류 글자만 떴다)
  const missing = Array.isArray(run.totals.missing) ? (run.totals.missing as unknown as string[]) : [];
  const final = run.status === 'FINALIZED';
  // 같은 대장의 다른 판 (정정)
  const revs = await loadRevisions(run);
  const newer = revs.filter((r) => r.revision > run.revision).at(-1) ?? null;
  const original = revs.find((r) => r.id === run.supersedesId) ?? null;
  const replaced = !!newer && newer.status === 'FINALIZED'; // 정정본이 확정됐다 — 이 판은 더 공개하지 않는다
  // 정정 차액 (2026-10-14, 미구현 목록 9번): 바로 앞 판과 이 판의 직원별 지급 · 공제 · 실지급 차이. 계산하지 않은 사람 · 막힌 사람은 비교하지 않는다
  const diff = original?.generationId && run.generationId ? await (async () => {
    const { data } = await createAdminClient().from('payroll_statements').select('employee_id, generation_id, state, pay_total, deduction_total, net_total').in('generation_id', [original.generationId!, run.generationId!]);
    const by = (g: string) => new Map((data ?? []).filter((x) => x.generation_id === g && x.state === 'OK').map((x) => [x.employee_id as string, { pay: Number(x.pay_total), deduction: Number(x.deduction_total), net: Number(x.net_total) }]));
    const before = by(original.generationId!), after = by(run.generationId!);
    return lines.filter((l) => before.has(l.employeeId) || after.has(l.employeeId)).map((l) => ({ id: l.employeeId, name: l.name, before: before.get(l.employeeId) ?? null, after: after.get(l.employeeId) ?? null })).filter((x) => !x.before || !x.after || x.before.net !== x.after.net || x.before.pay !== x.after.pay || x.before.deduction !== x.after.deduction);
  })() : null;
  // 확정한 대장: 직원별 공개 상태 (공개는 확정과 따로 한다)
  const pub: Map<string, { statementId: string; published: boolean; at: string | null }> = final ? await loadPublication(run.id, run.generationId) : new Map();
  const waiting = [...pub.values()].filter((x) => !x.published).length;
  // 메일 발송 (2026-10-19): 공개 중인 명세서만 보낸다. 발송 여부는 명세서마다 마지막 기록
  const mails = final ? await loadSlipMails([...pub.values()].map((x) => x.statementId)) : [];
  const lastMail = lastMailBySlip(mails ?? []);
  const { data: everyone } = final ? await createAdminClient().from('profiles').select('id, name, email') : { data: [] };
  const hasEmail = new Set((everyone ?? []).filter((p) => (p.email as string | null)?.trim()).map((p) => p.id as string));
  const names = new Map((everyone ?? []).map((p) => [p.id as string, p.name as string]));
  const births = final ? await birthDates([...pub.keys()]) : new Map<string, string>();
  const unsentMail = [...pub].filter(([, x]) => x.published && lastMail.get(x.statementId)?.result !== 'SENT').map(([employeeId, x]) => ({ employeeId, slipId: x.statementId }));
  const mailOk = mailReady() && mails !== null;
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
      {(await searchParams).existed === '1' && <p role="status" className="rounded-card bg-primary-tint p-3 text-sm font-semibold text-primary">{t('existedNote')}</p>}
      {/* 이 대장이 어디까지 왔는가 — 만들기 → 계산 → 검토 → 확정 → 공개 (2026-10-14 의뢰인) */}
      <Steps
        label={t('stepsLabel')}
        steps={(['DRAFT', 'CALCULATED', 'REVIEWED', 'FINALIZED', 'PUBLISHED'] as const).map((k, i) => {
          const at = final ? (waiting === 0 && pub.size > 0 ? 5 : 4) : ['DRAFT', 'CALCULATED', 'REVIEWED'].indexOf(run.status) + 1;
          return { key: k, label: t(`flowStep.${k}`), note: t(`flowStep.${k}Note`), state: i < at ? 'done' : i === at ? 'now' : 'todo' };
        })}
      />

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
          {pub.size - waiting > 0 && (
            <div className="flex flex-col gap-1">
              <SlipMailSend items={unsentMail} label={tm('sendUnsent', { n: unsentMail.length })} ready={mailOk} />
              <p className="text-xs text-faint">{mails === null ? tm('dbPending') : !mailReady() ? tm('notReady') : tm('hintRun')}</p>
            </div>
          )}
          <MailLog mails={mails ?? []} names={names} />
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
        <div className="flex flex-wrap gap-2">
          <a href={`/api/admin/payroll/runs/${run.id}/export`} className="inline-flex h-8 items-center gap-1 rounded-button border border-border bg-bg px-3.5 text-sm font-semibold text-text hover:bg-surface">
            {t('exportDo')}
          </a>
          <a href={`/admin/payroll/slips?m=${run.periodFrom.slice(0, 7)}`} className="inline-flex h-8 items-center gap-1 rounded-button border border-border bg-bg px-3.5 text-sm font-semibold text-text hover:bg-surface">
            {t('uploadSlips')}
          </a>
          {okCount > 0 ? (
            <a href={`/api/admin/payroll/runs/${run.id}/pdf-all`} className="inline-flex h-8 items-center gap-1 rounded-button border border-border bg-bg px-3.5 text-sm font-semibold text-text hover:bg-surface">
              {t(final ? 'pdfAll' : 'pdfAllDraft')}
            </a>
          ) : (
            <span aria-disabled className="inline-flex h-8 cursor-not-allowed items-center gap-1 rounded-button border border-border bg-surface px-3.5 text-sm font-semibold text-faint">
              {t(final ? 'pdfAll' : 'pdfAllDraft')}
            </span>
          )}
          {okCount === 0 && <p className="w-full text-sm text-warn">{t('pdfNone')}</p>}
        </div>
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

      {diff && (
        <section className="rounded-card border border-border bg-bg px-4 py-3">
          <h2 className="font-bold">{t('diffTitle', { from: original!.revision, to: run.revision })}</h2>
          {diff.length === 0 ? (
            <p className="pt-1 text-sm text-faint">{t('diffNone')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="mt-2 w-full text-sm" data-diff>
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted">
                    <th scope="col" className="py-2 pr-3">{t('colName')}</th>
                    {(['colPay', 'colDeduction', 'colNet'] as const).map((k) => (
                      <th key={k} scope="col" className="py-2 pr-3 text-right">{t(k)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {diff.map((d) => (
                    <tr key={d.id} className="border-b border-border last:border-b-0">
                      <td className="py-2 pr-3 font-semibold">{d.name}</td>
                      {(['pay', 'deduction', 'net'] as const).map((k) => {
                        const a = d.before?.[k], b = d.after?.[k];
                        const gap = a !== undefined && b !== undefined ? b - a : null;
                        return (
                          <td key={k} className="num py-2 pr-3 text-right whitespace-nowrap">
                            <span className="text-faint">{a === undefined ? '–' : won(a)}</span> → <span className="font-semibold">{b === undefined ? '–' : won(b)}</span>
                            {gap !== null && gap !== 0 && <span className={`ml-1 text-xs font-bold ${gap > 0 ? 'text-ok' : 'text-danger'}`}>({gap > 0 ? '+' : ''}{f.number(gap)})</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="pt-2 text-xs text-faint">{t('diffNote')}</p>
        </section>
      )}

      <div className="overflow-x-auto table-ruled">
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
                      {pub.get(l.employeeId)!.published && (
                        <>
                          <MailStatus last={lastMail.get(pub.get(l.employeeId)!.statementId)} hasEmail={hasEmail.has(l.employeeId)} hasBirth={births.has(l.employeeId)} />
                          <SlipMailSend one items={[{ employeeId: l.employeeId, slipId: pub.get(l.employeeId)!.statementId }]} label={tm(lastMail.has(pub.get(l.employeeId)!.statementId) ? 'resend' : 'send')} ready={mailOk} />
                        </>
                      )}
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
