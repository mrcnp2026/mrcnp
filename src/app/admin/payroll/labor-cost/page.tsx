// 인건비 현황 — 확정한 급여대장의 지급 · 공제 · 실지급 · 사업주 부담 · 총인건비를 달 · 부서 · 직원으로 본다 (PRD v1.3 18.6 W09). 급여 담당 관리자만.
// 숫자는 저장된 명세서의 합이다(여기서 다시 계산하지 않는다). 정정본이 확정되면 앞 판은 빠진다.
import { getFormatter, getTranslations } from 'next-intl/server';
import { PayFlow } from '@/components/PayFlow';
import { Download } from 'lucide-react';
import { HelpTip } from '@/components/Help';
import { Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { getMe } from '@/lib/auth';
import { buildOrgTree } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { buildLaborCost, type LaborKind, type LaborSum } from '@/lib/payroll/labor-cost';
import { toKstDate } from '@/lib/time';

const field = 'min-h-9 rounded-button border border-border bg-bg px-3 text-sm';
const COLS = ['cStatements', 'cPay', 'cDeduction', 'cNet', 'cEmployer', 'cTotal'] as const;

export default async function LaborCostPage({ searchParams }: { searchParams: Promise<{ y?: string; k?: string; g?: string; draft?: string; live?: string }> }) {
  const [t, f, me, sp, groups] = await Promise.all([getTranslations('admin.laborCost'), getFormatter(), getMe(), searchParams, loadOrgGroups()]);
  if (!me || me.role !== 'admin' || !me.canViewPayroll) return <PageShell><p className="rounded-card bg-warn-tint p-4 text-sm text-warn">{t('forbidden')}</p></PageShell>;
  const thisYear = Number(toKstDate(new Date()).slice(0, 4));
  const year = /^\d{4}$/.test(sp.y ?? '') && Number(sp.y) >= 2000 && Number(sp.y) <= 2100 ? Number(sp.y) : thisYear;
  const kind: LaborKind | null = sp.k === 'REGULAR' || sp.k === 'BONUS' || sp.k === 'DAILY' ? sp.k : null;
  const options = buildOrgTree(groups).flatMap((d) => [{ id: d.id, label: d.name }, ...d.teams.map((x) => ({ id: x.id, label: `${d.name} › ${x.name}` }))]);
  const groupId = options.some((o) => o.id === sp.g) ? sp.g! : null;
  const practice = OFFICE.practiceMode && sp.live !== '1';
  const withDraft = sp.draft === '1';
  const r = await buildLaborCost({ year, practice, kind, groupId, withDraft, testViewer: !!me.employeeNo?.startsWith('e2e-'), unassigned: t('unassigned'), daily: { group: t('daily.group'), wage: t('daily.wage'), nontax: t('daily.nontax'), incomeTax: t('daily.incomeTax'), localTax: t('daily.localTax'), other: t('daily.other') } });
  const won = (v: number) => f.number(v);
  const cells = (s: LaborSum) => [f.number(s.statements), won(s.pay), won(s.deduction), won(s.net), won(s.employer), won(s.total)];
  const head = (first: string) => (
    <thead>
      <tr className="border-b border-border bg-surface text-left">
        <th scope="col" className="px-3 py-2.5 text-xs font-semibold whitespace-nowrap text-muted">{first}</th>
        {COLS.map((k) => (
          <th key={k} scope="col" className="px-3 py-2 text-right whitespace-nowrap">{t(k)}</th>
        ))}
      </tr>
    </thead>
  );
  const row = (key: string, label: React.ReactNode, s: LaborSum, strong = false) => (
    <tr key={key} className={`border-b border-border ${strong ? 'bg-surface font-bold' : ''}`}>
      <td className="px-3 py-2 whitespace-nowrap">{label}</td>
      {cells(s).map((v, i) => (
        <td key={i} className={`num px-3 py-2 text-right whitespace-nowrap ${i === 5 ? 'font-bold' : ''}`}>{v}</td>
      ))}
    </tr>
  );

  return (
    <PageShell wide>
      <div>
        <h1 className="flex flex-wrap items-center gap-x-1 text-2xl font-bold">
          {t('title')}
          {practice && <Chip>{t('practice')}</Chip>}
          {r.hasDraft && <Chip tone="warn">{t('draftChip')}</Chip>}
        <HelpTip>{t('intro')}</HelpTip></h1>
      </div>
      <PayFlow now="after" />
      <form action="/admin/payroll/labor-cost" className="flex flex-wrap items-end gap-3 text-sm">
        {sp.live === '1' && <input type="hidden" name="live" value="1" />}
        <label className="flex flex-col gap-1">
          <span className="font-bold">{t('fYear')}</span>
          <select name="y" defaultValue={String(year)} className={field}>
            {[...Array(6)].map((_, i) => thisYear + 1 - i).concat(year > thisYear + 1 || year < thisYear - 4 ? [year] : []).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-bold">{t('fKind')}</span>
          <select name="k" defaultValue={kind ?? ''} className={field}>
            <option value="">{t('all')}</option>
            <option value="REGULAR">{t('kind.REGULAR')}</option>
            <option value="BONUS">{t('kind.BONUS')}</option>
            <option value="DAILY">{t('kind.DAILY')}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-bold">{t('fGroup')}</span>
          <select name="g" defaultValue={groupId ?? ''} className={field}>
            <option value="">{t('all')}</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="flex min-h-9 items-center gap-2">
          <input type="checkbox" name="draft" value="1" defaultChecked={withDraft} />
          {t('fDraft')}
        </label>
        <button type="submit" className="inline-flex min-h-9 items-center rounded-button bg-primary px-4 text-sm font-bold text-on-primary">{t('apply')}</button>
        {r.rows > 0 && (
          <a href={`/api/admin/payroll/labor-cost?${new URLSearchParams({ y: String(year), ...(kind ? { k: kind } : {}), ...(groupId ? { g: groupId } : {}), ...(withDraft ? { draft: '1' } : {}), ...(sp.live === '1' ? { live: '1' } : {}) })}`} className="ml-auto inline-flex min-h-9 items-center gap-1 rounded-button border border-border bg-bg px-3.5 text-sm font-semibold text-text hover:bg-surface">
            <Download aria-hidden size={16} />
            {t('excel')}
          </a>
        )}
      </form>
      {r.hasDraft && <p className="rounded-card border border-warn bg-warn-tint p-3 text-sm text-warn">{t('draftNote')}</p>}
      {r.blocked > 0 && <p className="rounded-card border border-warn bg-warn-tint p-3 text-sm text-warn">{t('blockedNote', { n: r.blocked })}</p>}
      {r.rows === 0 ? (
        <p className="rounded-card border border-border bg-bg p-4 text-sm text-faint">{t('empty')}</p>
      ) : (
        <>
          <dl className="grid gap-3 md:grid-cols-5">
            {([['sPeople', f.number(r.total.people)], ['cPay', won(r.total.pay)], ['cNet', won(r.total.net)], ['cTotal', won(r.total.total)], ['sAverage', won(r.total.people > 0 ? Math.round(r.total.total / r.total.people) : 0)]] as const).map(([k, v]) => (
              <div key={k} className="rounded-card border border-border bg-bg p-3">
                <dt className="text-sm text-muted">{t(k)}</dt>
                <dd className="num pt-1 text-xl font-extrabold">{v}</dd>
              </div>
            ))}
          </dl>
          {([['byMonth', t('cMonth'), r.months.map((m) => row(m.month, m.month, m))], ['byGroup', t('cGroup'), r.groups.map((g) => row(g.groupId ?? 'none', t('groupPeople', { name: g.name, n: g.people }), g))], ['byJob', t('cJob'), r.jobs.map((j) => row(j.jobId ?? 'none', t('groupPeople', { name: j.name, n: j.people }), j))], ['byEmployee', t('cEmployee'), r.employees.map((e) => row(e.employeeId, <>{e.name} <span className="num text-xs text-muted">{e.employeeNo}</span></>, e))]] as const).map(([k, first, body]) => (
            <section key={k} className="flex flex-col gap-2">
              <h2 className="text-lg font-bold">{t(k)}</h2>
              <div className="overflow-x-auto rounded-card border border-border bg-bg">
                <table className="w-full text-sm" data-labor={k}>
                  {head(first)}
                  <tbody>
                    {body}
                    {row('sum', t('sum'), r.total, true)}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
          <div className="grid gap-4 lg:grid-cols-2">
            {(['PAYMENT', 'DEDUCTION'] as const).map((kd) => {
              const list = r.items.filter((x) => x.kind === kd);
              return (
                <section key={kd} className="flex flex-col gap-2">
                  <h2 className="text-lg font-bold">{t(kd === 'PAYMENT' ? 'byPayItem' : 'byDeductionItem')}</h2>
                  <div className="overflow-x-auto rounded-card border border-border bg-bg">
                    <table className="w-full text-sm" data-labor={kd === 'PAYMENT' ? 'byPayItem' : 'byDeductionItem'}>
                      <thead>
                        <tr className="border-b border-border bg-surface text-left">
                          <th scope="col" className="px-3 py-2.5 text-xs font-semibold text-muted">{t('cItem')}</th>
                          <th scope="col" className="px-3 py-2.5 text-right text-xs font-semibold text-muted">{t('sPeople')}</th>
                          <th scope="col" className="px-3 py-2.5 text-right text-xs font-semibold text-muted">{t('cAmount')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((x) => (
                          <tr key={x.code} className="border-b border-border">
                            <td className="px-3 py-2">{x.label}</td>
                            <td className="num px-3 py-2 text-right">{f.number(x.people)}</td>
                            <td className="num px-3 py-2 text-right font-bold">{won(x.amount)}</td>
                          </tr>
                        ))}
                        <tr className="bg-surface font-bold">
                          <td className="px-3 py-2">{t('sum')}</td>
                          <td />
                          <td className="num px-3 py-2 text-right">{won(list.reduce((a, x) => a + x.amount, 0))}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}
      <p className="text-xs text-faint">{t('note')}</p>
    </PageShell>
  );
}
