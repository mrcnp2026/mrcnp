// 인건비 현황 — 확정한 급여대장의 지급 · 공제 · 실지급 · 사업주 부담 · 총인건비를 달 · 부서 · 직원으로 본다 (PRD v1.3 18.6 W09). 급여 담당 관리자만.
// 숫자는 저장된 명세서의 합이다(여기서 다시 계산하지 않는다). 정정본이 확정되면 앞 판은 빠진다.
// 2026-10-25 의뢰인: 「대표자가 볼 화면이다 · 깔끔하고 심플하고 직관적으로 · 카드 크기와 정렬을 맞춰라 · 영어를 빼라」 →
//   큰 숫자 네 칸(크기 같음) → 월별 · 부서별 그래프(두 칸) → 구성 · 급여 항목(두 칸) → 자세한 숫자는 접어 둔다.
import { Select } from '@/components/Select';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Download } from 'lucide-react';
import Link from 'next/link';
import { HelpTip } from '@/components/Help';
import { Card, CardTitle, Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { getMe } from '@/lib/auth';
import { orgOptions } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { buildLaborCost, type LaborKind, type LaborSum } from '@/lib/payroll/labor-cost';
import { toKstDate } from '@/lib/time';

const field = 'min-h-9 rounded-button border border-border bg-bg px-3 text-sm';
const COLS = ['cStatements', 'cPay', 'cTaxable', 'cExempt', 'cDeduction', 'cNet', 'cEmployer', 'cTotal'] as const; // 과세 · 비과세는 지급 합계를 둘로 나눈 값 (2026-10-26 의뢰인)
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

export default async function LaborCostPage({ searchParams }: { searchParams: Promise<{ y?: string; k?: string; g?: string; draft?: string; live?: string }> }) {
  const [t, f, me, sp, groups] = await Promise.all([getTranslations('admin.laborCost'), getFormatter(), getMe(), searchParams, loadOrgGroups()]);
  if (!me || me.role !== 'admin' || !me.canViewPayroll) return <PageShell><p className="rounded-card bg-warn-tint p-4 text-sm text-warn">{t('forbidden')}</p></PageShell>;
  const thisYear = Number(toKstDate(new Date()).slice(0, 4));
  const year = /^\d{4}$/.test(sp.y ?? '') && Number(sp.y) >= 2000 && Number(sp.y) <= 2100 ? Number(sp.y) : thisYear;
  const kind: LaborKind | null = sp.k === 'REGULAR' || sp.k === 'BONUS' || sp.k === 'DAILY' ? sp.k : null;
  const options = orgOptions(groups);
  const groupId = options.some((o) => o.id === sp.g) ? sp.g! : null;
  const practice = OFFICE.practiceMode && sp.live !== '1';
  const withDraft = sp.draft === '1';
  const r = await buildLaborCost({ year, practice, kind, groupId, withDraft, testViewer: !!me.employeeNo?.startsWith('e2e-'), unassigned: t('unassigned'), daily: { group: t('daily.group'), wage: t('daily.wage'), nontax: t('daily.nontax'), incomeTax: t('daily.incomeTax'), localTax: t('daily.localTax'), other: t('daily.other') } });
  const won = (v: number) => f.number(v);
  // 큰 숫자는 억 · 만원으로 줄여 보인다(정확한 금액은 막대에 올리면 보인다)
  const short = (v: number) => (v >= 100_000_000 ? `${f.number(Math.round(v / 10_000_000) / 10)}${t('unitEok')}` : v >= 10_000 ? `${f.number(Math.round(v / 10_000))}${t('unitMan')}` : f.number(v));
  const cells = (s: LaborSum) => [f.number(s.statements), won(s.pay), won(s.pay - s.exempt), won(s.exempt), won(s.deduction), won(s.net), won(s.employer), won(s.total)];
  const filterQuery = new URLSearchParams({ y: String(year), ...(kind ? { k: kind } : {}), ...(groupId ? { g: groupId } : {}), ...(withDraft ? { draft: '1' } : {}), ...(sp.live === '1' ? { live: '1' } : {}) });
  const yearLink = (y: number) => `/admin/payroll/labor-cost?${new URLSearchParams({ ...Object.fromEntries(filterQuery), y: String(y) })}`;

  const byMonth = new Map(r.months.map((m) => [m.month, m]));
  const months12 = [...Array(12)].map((_, i) => ({ n: i + 1, m: byMonth.get(`${year}-${String(i + 1).padStart(2, '0')}`) ?? null }));
  const maxMonth = Math.max(1, ...months12.map((x) => x.m?.total ?? 0));
  const peak = months12.reduce<(typeof months12)[number] | null>((a, x) => (x.m && (!a || x.m.total > (a.m?.total ?? 0)) ? x : a), null);
  const T = r.total;
  const groupRows = [...r.groups].sort((a, b) => b.total - a.total);
  const payItems = r.items.filter((x) => x.kind === 'PAYMENT').sort((a, b) => b.amount - a.amount).slice(0, 7);
  const dedItems = r.items.filter((x) => x.kind === 'DEDUCTION').sort((a, b) => b.amount - a.amount).slice(0, 7);
  const subOf = (s: LaborSum) => t('subLine', { pay: short(s.pay), taxable: short(s.pay - s.exempt), exempt: short(s.exempt), deduction: short(s.deduction), net: short(s.net), employer: short(s.employer) });

  // 가로 막대 목록: 이름 · 금액 · 비중을 한 줄에, 막대를 아래에
  const BarList = ({ rows, total, tone = 'bg-primary' }: { rows: { key: string; label: string; value: number }[]; total: number; tone?: string }) => {
    const max = Math.max(1, ...rows.map((x) => x.value));
    return (
      <ul className="flex flex-col gap-3">
        {rows.map((x) => (
          <li key={x.key} className="flex flex-col gap-1.5" title={won(x.value)}>
            <div className="flex items-baseline gap-3 text-sm">
              <span className="min-w-0 flex-1 truncate font-semibold">{x.label}</span>
              <span className="num font-bold">{short(x.value)}</span>
              <span className="num w-12 text-right text-xs text-muted">{pct(x.value, total)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-chip bg-surface"><div className={`fx-grow-x h-2 rounded-chip ${tone}`} style={{ width: `${Math.max(2, (x.value / max) * 100)}%` }} /></div>
          </li>
        ))}
      </ul>
    );
  };
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
        <td key={i} className={`num px-3 py-2 text-right whitespace-nowrap ${i === 7 ? 'font-bold' : ''}`}>{v}</td>
      ))}
    </tr>
  );
  // 큰 숫자는 셋 — 총인건비 · 지급 합계 · 사업주 부담. 실지급 · 공제 · 1인당 평균은 줄 아래에 붙여 같은 숫자를 두 번 보이지 않는다 (2026-10-26 의뢰인)
  const kpis = [
    { k: 'cTotal', v: short(T.total), sub: t('kpiPeopleAvg', { n: f.number(T.people), avg: short(T.people > 0 ? Math.round(T.total / T.people) : 0) }), full: won(T.total), accent: true },
    { k: 'cPay', v: short(T.pay), sub: t('kpiNetDed', { net: short(T.net), ded: short(T.deduction) }), full: won(T.pay), accent: false },
    { k: 'cEmployer', v: short(T.employer), sub: t('kpiShare', { n: pct(T.employer, T.total) }), full: won(T.employer), accent: false },
  ];

  return (
    <PageShell wide>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex flex-wrap items-center gap-x-1 text-2xl font-bold">
          {t('title')}
          {practice && <Chip>{t('practice')}</Chip>}
          {r.hasDraft && <Chip tone="warn">{t('draftChip')}</Chip>}
          <HelpTip>{t('intro')}</HelpTip>
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <nav className="flex gap-1.5" aria-label={t('fYear')}>
            {[thisYear - 2, thisYear - 1, thisYear].map((y) => (
            <Link key={y} href={yearLink(y)} className={`inline-flex min-h-9 items-center rounded-button border px-3.5 text-sm font-semibold ${y === year ? 'border-primary bg-primary-tint text-primary' : 'border-border bg-bg text-muted hover:bg-surface'}`}>{y}</Link>
          ))}
        </nav>
          {r.rows > 0 && (
            <a href={`/api/admin/payroll/labor-cost?${filterQuery}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-button bg-primary px-3.5 text-sm font-bold text-on-primary">
              <Download aria-hidden size={16} />
              {t('excel')}
            </a>
          )}
        </div>
      </div>
      {(kind || groupId || withDraft) && (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          {kind && <Chip tone="info">{t(`kind.${kind}`)}</Chip>}
          {groupId && <Chip tone="info">{options.find((o) => o.id === groupId)?.label}</Chip>}
          {withDraft && <Chip tone="info">{t('fDraft')}</Chip>}
          <Link href={`/admin/payroll/labor-cost?${new URLSearchParams({ y: String(year), ...(sp.live === '1' ? { live: '1' } : {}) })}`} className="font-bold text-primary underline">{t('clearFilters')}</Link>
        </p>
      )}
      <details className="rounded-card border border-border bg-bg px-4 py-2">
        <summary className="min-h-9 cursor-pointer py-1.5 text-sm font-semibold text-muted">{t('filters')}</summary>
        <form action="/admin/payroll/labor-cost" className="flex flex-wrap items-end gap-3 pt-2 pb-2 text-sm">
          {sp.live === '1' && <input type="hidden" name="live" value="1" />}
          <label className="flex flex-col gap-1">
            <span className="font-bold">{t('fYear')}</span>
            <Select name="y" defaultValue={String(year)} className={field}>
              {[...Array(6)].map((_, i) => thisYear + 1 - i).concat(year > thisYear + 1 || year < thisYear - 4 ? [year] : []).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-bold">{t('fKind')}</span>
            <Select name="k" defaultValue={kind ?? ''} className={field}>
              <option value="">{t('all')}</option>
              <option value="REGULAR">{t('kind.REGULAR')}</option>
              <option value="BONUS">{t('kind.BONUS')}</option>
              <option value="DAILY">{t('kind.DAILY')}</option>
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-bold">{t('fGroup')}</span>
            <Select name="g" defaultValue={groupId ?? ''} className={field}>
              <option value="">{t('all')}</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </Select>
          </label>
          <label className="flex min-h-9 items-center gap-2">
            <input type="checkbox" name="draft" value="1" defaultChecked={withDraft} />
            {t('fDraft')}
          </label>
          <button type="submit" className="inline-flex min-h-9 items-center rounded-button bg-primary px-4 text-sm font-bold text-on-primary">{t('apply')}</button>
        </form>
      </details>
      {r.hasDraft && <p className="rounded-card border border-warn bg-warn-tint p-3 text-sm text-warn">{t('draftNote')}</p>}
      {r.blocked > 0 && <p className="rounded-card border border-warn bg-warn-tint p-3 text-sm text-warn">{t('blockedNote', { n: r.blocked })}</p>}
      {r.rows === 0 ? (
        <p className="rounded-card border border-border bg-bg p-4 text-sm text-faint">{t('empty')}</p>
      ) : (
        <>
          {/* ① 큰 숫자 네 칸 — 크기 · 모양이 모두 같다 */}
          <section aria-label={t('overview')} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {kpis.map((x) => (
              <Card key={x.k} className="flex flex-col gap-1">
                <p className="text-sm text-muted">{t(x.k)}</p>
                <p className={`num text-2xl font-extrabold lg:text-3xl ${x.accent ? 'text-primary' : ''}`} title={x.full}>{x.v}</p>
                <p className="num text-xs text-muted">{x.sub}</p>
              </Card>
            ))}
          </section>

          {/* ② 월별 · 부서별 */}
          <div className="grid items-stretch gap-3 lg:grid-cols-2">
            <Card className="flex flex-col">
              <CardTitle>{t('chartMonth')}</CardTitle>
              <div className="flex h-44 items-end gap-1.5 border-b border-border pt-6 sm:gap-2.5" role="img" aria-label={t('chartMonth')}>
                {months12.map(({ n, m }) => (
                  <div key={n} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={m ? `${t('monthN', { n })} · ${won(m.total)}` : t('monthN', { n })}>
                    {m === peak?.m && <span className="num text-xs font-bold whitespace-nowrap text-primary">{short(m!.total)}</span>}
                    {m ? <div className={`fx-grow w-full max-w-9 rounded-t-button ${m === peak?.m ? 'bg-primary' : 'bg-primary/45'}`} style={{ height: `${Math.max(4, (m.total / maxMonth) * 82)}%` }} /> : <div className="h-0.5 w-full max-w-9 rounded-chip bg-border" />}
                  </div>
                ))}
              </div>
              <div className="flex gap-1.5 pt-1.5 sm:gap-2.5">
                {months12.map(({ n }) => (
                  <span key={n} className="num min-w-0 flex-1 text-center text-xs text-muted">{n}</span>
                ))}
              </div>
              {peak?.m && <p className="num pt-3 text-sm text-muted">{t('peak', { n: peak.n, amount: short(peak.m.total) })}</p>}
            </Card>
            <Card className="flex flex-col gap-3">
              <CardTitle>{t('byGroup')}</CardTitle>
              <BarList total={T.total} rows={groupRows.slice(0, 7).map((g) => ({ key: g.groupId ?? 'none', label: g.name, value: g.total }))} />
            </Card>
          </div>

          {/* ③ 지급 항목 · 공제 항목 */}
          <div className="grid items-stretch gap-3 lg:grid-cols-2">
            <Card className="flex flex-col gap-3">
              <CardTitle>{t('byPayItem')}</CardTitle>
              <BarList tone="bg-chart-extra" total={payItems.reduce((a, x) => a + x.amount, 0)} rows={payItems.map((x) => ({ key: x.code, label: x.label, value: x.amount }))} />
            </Card>
            <Card className="flex flex-col gap-3">
              <CardTitle>{t('byDeductionItem')}</CardTitle>
              <BarList tone="bg-chart-idle" total={dedItems.reduce((a, x) => a + x.amount, 0)} rows={dedItems.map((x) => ({ key: x.code, label: x.label, value: x.amount }))} />
            </Card>
          </div>

          {/* ④ 자세한 숫자 — 접어 둔다. 폰은 카드, PC는 표 */}
          <details className="rounded-card border border-border bg-bg px-4 py-2">
            <summary className="min-h-9 cursor-pointer py-1.5 text-sm font-semibold text-muted">{t('detail')}</summary>
            <div className="flex flex-col gap-6 pt-3 pb-2">
              {([['byMonth', t('cMonth'), r.months.map((m) => ({ key: m.month, label: m.month, s: m as LaborSum }))], ['byJob', t('cJob'), r.jobs.map((j) => ({ key: j.jobId ?? 'none', label: t('groupPeople', { name: j.name, n: j.people }), s: j as LaborSum }))], ['byEmployee', t('cEmployee'), r.employees.map((e) => ({ key: e.employeeId, label: e.name, s: e as LaborSum }))]] as const).map(([k, first, list]) => (
                <section key={k} className="flex flex-col gap-2">
                  <h2 className="text-base font-bold">{t(k)}</h2>
                  <ul className="flex flex-col divide-y divide-border lg:hidden">
                    {list.map((x) => (
                      <li key={x.key} className="flex flex-col gap-0.5 py-2">
                        <div className="flex items-baseline justify-between gap-3"><span className="font-semibold">{x.label}</span><span className="num font-bold">{won(x.s.total)}</span></div>
                        <span className="num text-xs text-muted">{subOf(x.s)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="table-ruled hidden overflow-x-auto lg:block">
                    <table className="w-full text-sm" data-labor={k}>
                      {head(first)}
                      <tbody>
                        {list.map((x) => row(x.key, x.label, x.s))}
                        {row('sum', t('sum'), T, true)}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
              <section className="flex flex-col gap-2">
                <h2 className="text-base font-bold">{t('byPayItem')}</h2>
                <ul className="flex flex-col divide-y divide-border lg:hidden">
                  {r.items.filter((x) => x.kind === 'PAYMENT').map((x) => (
                    <li key={x.code} className="flex flex-col gap-0.5 py-2 text-sm">
                      <div className="flex items-baseline justify-between gap-3"><span className="font-semibold">{x.label} <span className="text-xs font-normal text-muted">{t('itemPeople', { n: x.people })}</span></span><span className="num font-bold">{won(x.amount)}</span></div>
                      <span className="num text-xs text-muted">{t('itemTaxLine', { taxable: short(x.amount - x.exempt), exempt: short(x.exempt) })}</span>
                    </li>
                  ))}
                </ul>
                <div className="table-ruled hidden overflow-x-auto lg:block">
                  <table className="w-full text-sm" data-labor="payItems">
                    <thead>
                      <tr className="border-b border-border bg-surface text-left">
                        {['cItem', 'cPay', 'cTaxable', 'cExempt', 'cPeople'].map((k, i) => (
                          <th key={k} scope="col" className={`px-3 py-2.5 text-xs font-semibold whitespace-nowrap text-muted ${i === 0 ? '' : 'text-right'}`}>{t(k)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {r.items.filter((x) => x.kind === 'PAYMENT').map((x) => (
                        <tr key={x.code} className="border-b border-border">
                          <td className="px-3 py-2 whitespace-nowrap">{x.label}</td>
                          <td className="num px-3 py-2 text-right whitespace-nowrap font-bold">{won(x.amount)}</td>
                          <td className="num px-3 py-2 text-right whitespace-nowrap">{won(x.amount - x.exempt)}</td>
                          <td className="num px-3 py-2 text-right whitespace-nowrap">{x.exempt > 0 ? won(x.exempt) : <span className="text-faint">–</span>}</td>
                          <td className="num px-3 py-2 text-right whitespace-nowrap">{t('itemPeople', { n: x.people })}</td>
                        </tr>
                      ))}
                      <tr className="border-b border-border bg-surface font-bold">
                        <td className="px-3 py-2">{t('sum')}</td>
                        <td className="num px-3 py-2 text-right whitespace-nowrap">{won(r.items.filter((x) => x.kind === 'PAYMENT').reduce((a, x) => a + x.amount, 0))}</td>
                        <td className="num px-3 py-2 text-right whitespace-nowrap">{won(r.items.filter((x) => x.kind === 'PAYMENT').reduce((a, x) => a + x.amount - x.exempt, 0))}</td>
                        <td className="num px-3 py-2 text-right whitespace-nowrap">{won(r.items.filter((x) => x.kind === 'PAYMENT').reduce((a, x) => a + x.exempt, 0))}</td>
                        <td />
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-faint">{t('taxNote')}</p>
              </section>
              <section className="flex flex-col gap-2">
                <h2 className="text-base font-bold">{t('byDeductionItem')}</h2>
                <ul className="flex flex-col divide-y divide-border">
                  {r.items.filter((x) => x.kind === 'DEDUCTION').map((x) => (
                    <li key={x.code} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                      <span>{x.label} <span className="text-xs text-muted">{t('itemPeople', { n: x.people })}</span></span>
                      <span className="num font-bold">{won(x.amount)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </details>
        </>
      )}
      <p className="text-xs text-faint">{t('note')}</p>
    </PageShell>
  );
}
