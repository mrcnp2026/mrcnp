// 일용직 — 지급 대상자 · 근무 입력 · 일용 대장 (PRD v1.3 18.5 W07). 급여 담당 관리자만.
// 대상자는 로그인 계정과 따로다(계정을 만들지 않는다). 세금은 하루 단위 임시 규칙, 4대보험료는 계산하지 않는다. 신고 파일 · 이체는 없다.
import { getFormatter, getTranslations } from 'next-intl/server';
import { DailyFlow } from '@/components/PayFlow';
import { WarnLine } from '@/components/listframe';
import { HelpTip } from '@/components/Help';
import Link from 'next/link';
import { AddSheet } from '@/components/AddSheet';
import { SheetOpener } from '@/components/SheetOpener';
import { Card, CardTitle, Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { getMe } from '@/lib/auth';
import { loadDailyRuns, loadPayees, loadWork } from '@/lib/payroll/daily-data';
import { toKstDate } from '@/lib/time';
import { DailyRunCreate, EngagementAdd, EngagementOff, PayeeAdd, PayeeToggle, WorkAdd, WorkControls } from './DailyForms';

const field = 'min-h-9 rounded-button border border-border bg-bg px-3 text-sm';
const VIEWS = ['payees', 'work', 'runs'] as const;
const WTONE = { DRAFT: 'warn', CONFIRMED: 'ok', VOID: 'neutral' } as const;
const RTONE = { DRAFT: 'neutral', CALCULATED: 'info', REVIEWED: 'warn', FINALIZED: 'ok' } as const;

export default async function DailyPage({ searchParams }: { searchParams: Promise<{ v?: string; m?: string; live?: string }> }) {
  const [t, f, me, sp] = await Promise.all([getTranslations('admin.daily'), getFormatter(), getMe(), searchParams]);
  if (!me || me.role !== 'admin' || !me.canViewPayroll) return <PageShell><p className="rounded-card bg-warn-tint p-4 text-sm text-warn">{t('forbidden')}</p></PageShell>;
  const practice = OFFICE.practiceMode && sp.live !== '1';
  const testViewer = !!me.employeeNo?.startsWith('e2e-');
  const view = VIEWS.find((v) => v === sp.v) ?? 'payees';
  const today = toKstDate(new Date());
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.m ?? '') ? sp.m! : today.slice(0, 7);
  const live = sp.live === '1';
  const { payees, engagements } = await loadPayees(testViewer);
  const [works, runs] = await Promise.all([view === 'work' ? loadWork({ month, practice, payeeIds: payees.map((p) => p.id) }) : Promise.resolve([]), view === 'runs' ? loadDailyRuns({ practice, testViewer }) : Promise.resolve([])]);
  const tab = (on: boolean) => `flex min-h-11 items-center border-b-2 px-4 text-sm font-bold ${on ? 'border-text text-text lg:border-primary lg:text-primary' : 'border-transparent text-muted hover:text-text'}`;
  const href = (v: string) => `/admin/payroll/daily?v=${v}${v === 'work' ? `&m=${month}` : ''}${live ? '&live=1' : ''}`;
  const won = (v: number) => t('won', { n: f.number(v) });
  const nameOf = new Map(payees.map((p) => [p.id, p]));
  const day = month === today.slice(0, 7) ? today : `${month}-01`;

  return (
    <PageShell wide>
      <div>
        <h1 className="flex flex-wrap items-center gap-x-1 text-2xl font-bold">
          {t('title')}
          {practice && view !== 'payees' && <Chip>{t('practice')}</Chip>}
        <HelpTip>{t('intro')}</HelpTip></h1>
      </div>
      <DailyFlow now={view} />
      <nav className="flex border-b border-border">
        {VIEWS.map((v) => (
          <Link key={v} href={href(v)} aria-current={view === v ? 'page' : undefined} className={tab(view === v)}>{t(`tab.${v}`)}</Link>
        ))}
      </nav>
      <WarnLine short={t('legalShort')}>{t('legal')}</WarnLine>

      {view === 'payees' && (
        <>
          {/* 등록 양식은 단추를 눌러 여는 창으로 — 화면은 목록이 먼저 (2026-10-14 의뢰인: 무엇을 하라는 건지 한눈에) */}
          <div className="flex items-center gap-2">
            <p className="text-sm text-muted">{t('payeeCount', { n: payees.filter((x) => x.active).length })}</p>
            <SheetOpener id="payee" label={t('payeeTitle')} className="ml-auto inline-flex" />
          </div>
          <AddSheet id="payee" title={t('payeeTitle')} modal>
            <div className="flex flex-col gap-3">
              <PayeeAdd />
              <p className="text-xs text-faint">{t('payeeNote')}</p>
            </div>
          </AddSheet>
          <div className="overflow-x-auto rounded-card border border-border bg-bg" data-payees>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface text-left">
                  {[t('colPayee'), t('colEngagement'), t('colTerms'), ''].map((h, i) => (
                    <th key={i} scope="col" className="px-3 py-2.5 text-xs font-semibold whitespace-nowrap text-muted">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payees.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-faint">{t('payeeEmpty')}</td>
                  </tr>
                )}
                {payees.map((p) => {
                  const mine = engagements.filter((e) => e.payeeId === p.id);
                  return (
                    <tr key={p.id} className={`border-b border-border align-top last:border-b-0 ${p.active ? '' : 'opacity-60'}`}>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <b>{p.name}</b> <span className="num text-xs text-muted">{p.internalNo}</span> {!p.active && <Chip>{t('payeeInactive')}</Chip>}
                        {(p.phone || p.note) && <span className="block text-xs text-muted">{[p.phone, p.note].filter(Boolean).join(' · ')}</span>}
                      </td>
                      <td className="px-3 py-3">
                        {mine.length === 0 ? (
                          <span className="text-faint">{t('engEmpty')}</span>
                        ) : (
                          <ul className="flex flex-col gap-1.5">
                            {mine.map((e) => (
                              <li key={e.id} className="num flex flex-wrap items-center gap-x-2">
                                <span>{e.startsOn} ~ {e.endsOn ?? t('open')} · {e.project || t('noProject')} · {e.dayRate === null ? t('noRate') : won(e.dayRate)}</span>
                                <EngagementOff id={e.id} label={t('engOffOf', { name: p.name })} />
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {mine.map((e) => (
                          <span key={e.id} className="flex flex-wrap items-center gap-1 text-xs text-muted">
                            {t('termsLine', { tax: t(`tax.${e.taxState}`), ei: t(`tri.${e.ei}`), np: t(`tri.${e.np}`), hi: t(`tri.${e.hi}`) })}
                            {e.basisNote && ` · ${e.basisNote}`}
                            {(e.taxState === 'UNKNOWN' || e.ei === 'UNKNOWN' || e.np === 'UNKNOWN' || e.hi === 'UNKNOWN') && <Chip tone="warn">{t('termsUnknown')}</Chip>}
                          </span>
                        ))}
                      </td>
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        <span className="inline-flex gap-2">
                          <EngagementAdd payeeId={p.id} today={today} name={p.name} />
                          <PayeeToggle id={p.id} active={p.active} name={p.name} />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {view === 'work' && (
        <>
          <form action="/admin/payroll/daily" className="flex flex-wrap items-end gap-3 text-sm">
            <input type="hidden" name="v" value="work" />
            {live && <input type="hidden" name="live" value="1" />}
            <label className="flex flex-col gap-1">
              <span className="font-bold">{t('fMonth')}</span>
              <input type="month" name="m" defaultValue={month} className={field} />
            </label>
            <button type="submit" className="inline-flex min-h-9 items-center rounded-button border border-border bg-bg px-4 text-sm font-bold text-primary">{t('show')}</button>
          </form>
          <Card className="flex flex-col gap-3">
            <CardTitle>{t('workTitle')}</CardTitle>
            <WorkAdd payees={payees.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name, internalNo: p.internalNo, projects: [...new Set(engagements.filter((e) => e.payeeId === p.id).map((e) => e.project))] }))} day={day} live={live} />
          </Card>
          <div className="overflow-x-auto rounded-card border border-border bg-bg">
            <table className="w-full text-sm" data-work>
              <thead>
                <tr className="border-b border-border bg-surface text-left">
                  {['wDate', 'wPayee', 'wProject', 'wQty', 'wRate', 'wItems', 'wStatus', 'wManage'].map((k) => (
                    <th key={k} scope="col" className="px-3 py-2.5 text-xs font-semibold whitespace-nowrap text-muted">{t(k)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {works.map((w) => (
                  <tr key={w.id} className={`border-b border-border align-top ${w.status === 'VOID' ? 'text-faint line-through' : ''}`}>
                    <td className="num px-3 py-3 whitespace-nowrap">{w.workDate}{w.segmentKey !== 'A' && ` (${w.segmentKey})`}</td>
                    <td className="px-3 py-3 whitespace-nowrap"><b>{nameOf.get(w.payeeId)?.name}</b> <span className="num text-xs text-muted">{nameOf.get(w.payeeId)?.internalNo}</span></td>
                    <td className="px-3 py-3">{w.project || t('noProject')}</td>
                    <td className="num px-3 py-3">{f.number(w.quantity)}</td>
                    <td className="num px-3 py-3 whitespace-nowrap">{won(w.dayRate)}</td>
                    <td className="num px-3 py-3">{w.items.map((i) => `${i.label}(${t(`item.${i.kind}`)}) ${f.number(i.amount)}`).join(' · ')}{w.basisNote && <span className="block text-xs text-muted">{w.basisNote}</span>}</td>
                    <td className="px-3 py-3"><Chip tone={WTONE[w.status]}>{t(`wState.${w.status}`)}</Chip></td>
                    <td className="px-3 py-3"><WorkControls id={w.id} version={w.version} status={w.status} label={t('workOf', { name: nameOf.get(w.payeeId)?.name ?? '', date: w.workDate })} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {works.length === 0 && <p className="p-4 text-sm text-faint">{t('workEmpty')}</p>}
          </div>
        </>
      )}

      {view === 'runs' && (
        <>
          <Card className="flex flex-col gap-3">
            <CardTitle>{t('runTitle')}</CardTitle>
            <DailyRunCreate month={today.slice(0, 7)} payDate={today} live={live} />
            <p className="text-xs text-faint">{t('runNote')}</p>
          </Card>
          <div className="overflow-x-auto rounded-card border border-border bg-bg">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface text-left">
                  {['rMonth', 'rPayDate', 'rStatus', 'rPeople', 'rGross', 'rNet'].map((k) => (
                    <th key={k} scope="col" className="px-3 py-2.5 text-xs font-semibold whitespace-nowrap text-muted">{t(k)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-b-0">
                    <td className="num px-3 py-3 whitespace-nowrap">
                      <Link href={`/admin/payroll/daily/runs/${r.id}`} className="font-bold text-primary hover:underline">{t('runName', { month: r.periodFrom.slice(0, 7), n: r.sequence })}</Link>
                    </td>
                    <td className="num px-3 py-3 whitespace-nowrap">{r.payDate}</td>
                    <td className="px-3 py-3"><Chip tone={RTONE[r.status]}>{t(`rState.${r.status}`)}</Chip></td>
                    <td className="num px-3 py-3">{r.totals.members ?? ''}</td>
                    <td className="num px-3 py-3 text-right">{r.totals.pay === undefined ? '' : won(Number(r.totals.pay))}</td>
                    <td className="num px-3 py-3 text-right">{r.totals.net === undefined ? '' : won(Number(r.totals.net))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {runs.length === 0 && <p className="p-4 text-sm text-faint">{t('runEmpty')}</p>}
          </div>
        </>
      )}
    </PageShell>
  );
}
