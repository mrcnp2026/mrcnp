// 일용직 — 지급 대상자 · 근무 입력 · 일용 대장 (PRD v1.3 18.5 W07, 2026-10-28 급여-58로 다시 짬). 급여 담당 관리자만.
// 대상자는 로그인 계정과 따로다(계정을 만들지 않는다). 일반 · 외국인 일용직을 고르고, 4대보험은 앱이 자동 계산한다(최고관리자가 대장에서 고칠 수 있다).
// 화면은 폰에서 옆으로 밀리지 않게 카드로 — 표는 넓은 화면의 대장에서만.
import { getFormatter, getTranslations } from 'next-intl/server';
import { ChevronDown } from 'lucide-react';
import { WarnLine } from '@/components/listframe';
import { HelpTip } from '@/components/Help';
import Link from 'next/link';
import { AddSheet } from '@/components/AddSheet';
import { SheetOpener } from '@/components/SheetOpener';
import { Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { getMe } from '@/lib/auth';
import { loadItems } from '@/lib/payroll/data';
import { loadDailyRuns, loadPayees, loadWork, type Engagement, type Payee } from '@/lib/payroll/daily-data';
import { AUTO_PAYMENT_CODES, canonicalItemCode } from '@/lib/payroll/engine/reserved-items';
import { toKstDate } from '@/lib/time';
import { Popup } from '@/components/Popup';
import { ConfirmAll, DailyRunCreate, EngagementAddForm, EngagementEditForm, PayeeActions, PayeeForm, PayeeSearch, WorkAdd, WorkControls, WorkPayeeFilter, type ItemOpt } from './DailyForms';

const VIEWS = ['payees', 'work', 'runs'] as const;
const WTONE = { DRAFT: 'warn', CONFIRMED: 'ok', VOID: 'neutral' } as const;
const RTONE = { DRAFT: 'neutral', CALCULATED: 'info', REVIEWED: 'info', FINALIZED: 'ok' } as const; // 검토됨은 문제가 아니라 진행 상태 — 경고색을 쓰지 않는다 (2026-10-29)
const NOT_ITEMS = new Set(['PENSION', 'HEALTH', 'LTC', 'EMPLOYMENT', 'INCOME_TAX', 'LOCAL_TAX', 'NP', 'HI', 'EI']); // 4대보험 · 세금은 자동 항목이다

export default async function DailyPage({ searchParams }: { searchParams: Promise<{ v?: string; m?: string; p?: string; live?: string }> }) {
  const [t, f, me, sp] = await Promise.all([getTranslations('admin.daily'), getFormatter(), getMe(), searchParams]);
  if (!me || me.role !== 'admin' || !me.canViewPayroll) return <PageShell><p className="rounded-card bg-warn-tint p-4 text-sm text-warn">{t('forbidden')}</p></PageShell>;
  const practice = OFFICE.practiceMode && sp.live !== '1';
  const testViewer = !!me.employeeNo?.startsWith('e2e-');
  const view = VIEWS.find((v) => v === sp.v) ?? 'payees';
  const today = toKstDate(new Date());
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.m ?? '') ? sp.m! : today.slice(0, 7);
  const live = sp.live === '1';
  const [loaded, allItems] = await Promise.all([loadPayees(testViewer), loadItems()]);
  const { engagements } = loaded;
  const items: ItemOpt[] = allItems.filter((i) => i.inUse && !AUTO_PAYMENT_CODES.has(canonicalItemCode(i.code)) && !NOT_ITEMS.has(canonicalItemCode(i.code))).map((i) => ({ code: i.code, name: i.koName, kind: i.kind, nontax: i.taxTreatment === 'EXEMPT', amount: i.defaultAmount }));
  // 확인이 필요한 대상자(세금 · 보험이 「모름」)를 맨 위에 (2026-10-26 의뢰인: 이슈 먼저)
  const unknownTerms = (id: string) => engagements.some((e) => e.payeeId === id && (e.taxState === 'UNKNOWN' || e.ei === 'UNKNOWN' || e.np === 'UNKNOWN' || e.hi === 'UNKNOWN'));
  const payees = [...loaded.payees].sort((a, b) => Number(unknownTerms(b.id)) - Number(unknownTerms(a.id)) || a.name.localeCompare(b.name));
  const active = payees.filter((p) => p.active), off = payees.filter((p) => !p.active);
  const pick = payees.find((p) => p.id === sp.p) ?? null;
  const thisMonth = today.slice(0, 7);
  const [works, runs, monthWorks] = await Promise.all([view === 'work' ? loadWork({ month, practice, payeeIds: (pick ? [pick] : payees).map((p) => p.id) }) : Promise.resolve([]), view === 'runs' ? loadDailyRuns({ practice, testViewer }) : Promise.resolve([]), view === 'payees' ? loadWork({ month: thisMonth, practice, payeeIds: payees.map((p) => p.id) }) : Promise.resolve([])]);
  // 카드의 이번 달 요약 — 일한 날 · 지급(무효 줄 빼고, 공제 · 세금 전)
  const monthSum = new Map<string, { days: number; pay: number }>();
  const monthDates = new Map<string, Set<string>>();
  for (const w of monthWorks) {
    if (w.status === 'VOID') continue;
    const dates = monthDates.get(w.payeeId) ?? new Set<string>();
    dates.add(w.workDate);
    monthDates.set(w.payeeId, dates);
    const pay = (monthSum.get(w.payeeId)?.pay ?? 0) + Math.round(w.quantity * w.dayRate) + w.items.filter((i) => i.kind !== 'DEDUCTION').reduce((x, i) => x + i.amount, 0);
    monthSum.set(w.payeeId, { days: dates.size, pay });
  }
  const tab = (on: boolean) => `flex min-h-11 flex-1 items-center justify-center whitespace-nowrap border-b-2 px-1.5 text-sm font-bold sm:flex-none sm:px-4 ${on ? 'border-text text-text lg:border-primary lg:text-primary' : 'border-transparent text-muted hover:text-text'}`;
  const href = (v: string) => `/admin/payroll/daily?v=${v}${v === 'work' ? `&m=${month}` : ''}${live ? '&live=1' : ''}`;
  const won = (v: number) => t('won', { n: f.number(v) });
  const nameOf = new Map(payees.map((p) => [p.id, p]));
  const engOf = new Map(engagements.map((e) => [e.id, e]));

  const termsChips = (e: Engagement) => (
    <span className="flex flex-wrap items-center gap-1 text-xs text-muted">
      <span>{t(`tax.${e.taxState}`)}</span>
      {(['ei', 'np', 'hi'] as const).map((k) => <span key={k}>· {t(`eng.${k}`)} {t(`ins.${e[k]}`)}</span>)}
      {(e.taxState === 'UNKNOWN' || e.ei === 'UNKNOWN' || e.np === 'UNKNOWN' || e.hi === 'UNKNOWN') && <Chip tone="warn">{t('termsUnknown')}</Chip>}
    </span>
  );
  // 대상자 한 사람 — 한 줄에 한 명 (2026-10-29 검수: 두 칸으로 나누니 PC는 좁고, 카드 안에서 양식이 길게 펼쳐졌다).
  // PC: 왼쪽 사람 · 이번 달 요약 / 가운데 고용 조건 / 오른쪽 단추. 폰: 위에서 아래로, 단추는 두 칸씩. 고치기는 모두 창(Popup)으로 연다
  const workOpts = active.map((p) => ({ id: p.id, name: p.name, internalNo: p.internalNo, projects: engagements.filter((e) => e.payeeId === p.id).map((e) => ({ project: e.project, basis: e.payBasis, rate: e.dayRate })).filter((x, i, a) => a.findIndex((y) => y.project === x.project) === i) }));
  const btn = 'inline-flex h-9 items-center justify-center rounded-button border border-border bg-bg px-3 text-sm font-bold text-text hover:bg-surface';
  const link = 'inline-flex min-h-9 items-center font-bold text-primary hover:underline';
  const card = (p: Payee) => {
    const mine = engagements.filter((e) => e.payeeId === p.id);
    const sum = monthSum.get(p.id);
    return (
      <li key={p.id} id={`payee-${p.id}`} data-payee-name={`${p.name} ${p.internalNo}`} className="rounded-card border border-border bg-bg p-4 lg:p-5">
        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_auto] lg:items-start lg:gap-6">
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex items-start gap-2">
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                <b className="text-base">{p.name}</b>
                <span className="num text-xs text-muted">{p.internalNo}</span>
              </span>
              <PayeeActions id={p.id} active={p.active} name={p.name} deletable={!p.hasRecords} />
            </div>
            <span className="flex flex-wrap gap-1">
              <Chip tone={p.workerKind === 'FOREIGN' ? 'info' : 'neutral'}>{t(`kind.${p.workerKind}`)}</Chip>
              {p.workerKind === 'FOREIGN' && <Chip>{[p.nationality ? t(`nation.${p.nationality}`) : null, p.visaType].filter(Boolean).join(' · ')}</Chip>}
              {!p.active && <Chip>{t('payeeInactive')}</Chip>}
            </span>
            {(p.jobTitle || p.phone) && <p className="text-xs text-muted">{[p.jobTitle, p.phone].filter(Boolean).join(' · ')}</p>}
            {p.workerKind === 'FOREIGN' && p.stayUntil && <p className="num text-xs text-muted">{t('f.stayUntilShort', { d: p.stayUntil })}</p>}
            <p className="num text-sm">{sum ? t('cardMonth', { m: Number(thisMonth.slice(5)), days: sum.days, pay: won(sum.pay) }) : t('cardMonthNone', { m: Number(thisMonth.slice(5)) })}</p>
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            {mine.length === 0 ? (
              <p className="rounded-button bg-warn-tint px-3 py-2 text-sm text-warn">{t('engEmpty')}</p>
            ) : (
              mine.map((e) => (
                <div key={e.id} className="flex flex-col gap-1.5 rounded-button bg-surface px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:gap-3">
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="num">{[e.project, `${t(`basis.${e.payBasis}`)} ${e.dayRate === null ? t('noRate') : won(e.dayRate)}`].filter(Boolean).join(' · ')}</span>
                    <span className="num text-xs text-muted">{e.startsOn} ~ {e.endsOn ?? t('open')}</span>
                    {termsChips(e)}
                  </span>
                  <Popup id={`eng-${e.id}`} label={t('engEdit')} title={t('engEditOf', { name: p.name })} triggerClass={`${btn} h-8 self-start sm:self-center`}>
                    <EngagementEditForm id={e.id} sheet={`eng-${e.id}`} basis={e.payBasis} values={{ endsOn: e.endsOn, dayRate: e.dayRate, taxState: e.taxState, ei: e.ei, np: e.np, hi: e.hi, basisNote: e.basisNote }} />
                  </Popup>
                </div>
              ))
            )}
            {p.monthlyItems.length > 0 && <p className="text-xs text-muted">{t('m.short')}: {p.monthlyItems.map((m) => `${m.label} ${won(m.amount)}`).join(' · ')}</p>}
          </div>
          {/* 단추는 하나만 크게(근무 넣기), 나머지는 글자 단추로 — 같은 크기 단추 넷이 나란히 있으면 무엇을 누를지 모른다 (2026-10-29 의뢰인) */}
          <div className="flex flex-col gap-2 lg:w-40">
            {p.active && mine.length > 0 && (
              <Popup id={`work-add-${p.id}`} label={t('workFor')} title={t('workForOf', { name: p.name })} wide triggerClass="inline-flex h-10 w-full items-center justify-center rounded-button bg-primary px-3 text-sm font-bold text-on-primary">
                <WorkAdd month={thisMonth} live={live} payees={workOpts} preset={p.id} sheet={`work-add-${p.id}`} />
              </Popup>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm lg:flex-col lg:items-start">
              <Link prefetch={false} href={`/admin/payroll/daily?v=work&m=${thisMonth}&p=${p.id}${live ? '&live=1' : ''}`} className={link}>{t('toWork')}</Link>
              <Popup id={`payee-${p.id}-edit`} label={t('payeeEdit')} title={t('payeeEditOf', { name: p.name })} wide triggerClass={link}>
                <PayeeForm items={items} sheet={`payee-${p.id}-edit`} value={{ id: p.id, name: p.name, workerKind: p.workerKind, nationality: p.nationality, visaType: p.visaType, stayUntil: p.stayUntil, jobTitle: p.jobTitle, phone: p.phone, note: p.note, monthlyItems: p.monthlyItems }} />
              </Popup>
              <Popup id={`eng-add-${p.id}`} label={t('engAdd')} title={t('engAddOf', { name: p.name })} triggerClass={link}>
                <EngagementAddForm payeeId={p.id} sheet={`eng-add-${p.id}`} />
              </Popup>
            </div>
          </div>
        </div>
      </li>
    );
  };

  // 근무: 대상자마다 묶고 합계 (일한 날 · 공수/시간 · 지급)
  const byPayee = new Map<string, typeof works>();
  for (const w of works) byPayee.set(w.payeeId, [...(byPayee.get(w.payeeId) ?? []), w]);
  const drafts = works.filter((w) => w.status === 'DRAFT').map((w) => ({ id: w.id, version: w.version }));
  const shiftMonth = (d: number) => {
    const [y, m] = month.split('-').map(Number);
    const x = new Date(Date.UTC(y, m - 1 + d, 1));
    return x.toISOString().slice(0, 7);
  };
  const SHOW = 7;
  const workHref = (m: string, p?: string | null) => `/admin/payroll/daily?v=work&m=${m}${p ? `&p=${p}` : ''}${live ? '&live=1' : ''}`;

  return (
    <PageShell>
      <div>
        <h1 className="flex flex-wrap items-center gap-x-1 text-2xl font-bold">
          {t('title')}
          {practice && view !== 'payees' && <Chip>{t('practice')}</Chip>}
          <HelpTip>{t('intro')}</HelpTip>
        </h1>
      </div>
      <nav className="flex border-b border-border">
        {/* 탭이 곧 순서다 — 번호를 붙여 ① 명단 → ② 근무 → ③ 대장으로 읽히게 (2026-10-29) */}
        {VIEWS.map((v, i) => (
          <Link prefetch={false} key={v} href={href(v)} aria-current={view === v ? 'page' : undefined} className={`${tab(view === v)} gap-1.5`}>
            <span aria-hidden className={`num flex size-5 items-center justify-center rounded-chip text-xs ${view === v ? 'bg-primary text-on-primary' : 'bg-surface text-muted'}`}>{i + 1}</span>
            {t(`tab.${v}`)}
          </Link>
        ))}
      </nav>
      <WarnLine short={t('legalShort')}>{t('legal')}</WarnLine>

      {view === 'payees' && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <p className="w-full text-sm text-muted sm:w-auto">{t('payeeCount', { n: active.length })}{active.some((p) => p.workerKind === 'FOREIGN') && ` · ${t('foreignCount', { n: active.filter((p) => p.workerKind === 'FOREIGN').length })}`}</p>
            {payees.length > 5 && <PayeeSearch />}
            <SheetOpener id="payee" label={t('payeeTitle')} className="ml-auto inline-flex" />
          </div>
          <AddSheet id="payee" title={t('payeeTitle')} modal wide>
            <PayeeForm items={items} sheet="payee" />
          </AddSheet>
          {/* 처음 여는 사람에게 무엇부터 하는지 (2026-10-29 의뢰인: 「처음 접한다고 생각해 봐」) */}
          {active.length === 0 && (
            <section className="flex flex-col gap-4 rounded-card border border-border bg-bg p-5 lg:p-6">
              <p className="text-sm text-muted">{off.length > 0 ? t('payeeEmpty') : t('guide.title')}</p>
              <ol className="flex flex-col gap-3 lg:flex-row lg:gap-4">
                {(['s1', 's2', 's3'] as const).map((k, i) => (
                  <li key={k} className={`flex flex-1 items-start gap-3 rounded-button p-3 ${i === 0 ? 'bg-primary-tint' : 'bg-surface'}`}>
                    <span className={`num flex size-7 shrink-0 items-center justify-center rounded-chip text-sm font-bold ${i === 0 ? 'bg-primary text-on-primary' : 'bg-bg text-muted'}`}>{i + 1}</span>
                    <span className={`text-sm ${i === 0 ? 'font-bold' : 'text-muted'}`}>{t(`guide.${k}`)}</span>
                  </li>
                ))}
              </ol>
              <SheetOpener id="payee" label={t('guide.go')} className="inline-flex self-start" />
            </section>
          )}
          <ul className="flex flex-col gap-3" data-payees>{active.map(card)}</ul>
          {off.length > 0 && (
            <details className="group rounded-card border border-border">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 text-sm font-bold text-muted [&::-webkit-details-marker]:hidden">
                {t('offTitle', { n: off.length })}
                <ChevronDown aria-hidden size={16} className="ml-auto transition-transform duration-300 group-open:rotate-180" />
              </summary>
              <div className="flex flex-col gap-2 border-t border-border p-3">
                <p className="text-xs text-faint">{t('offHint')}</p>
                <ul className="flex flex-col gap-3 opacity-80">{off.map(card)}</ul>
              </div>
            </details>
          )}
        </>
      )}

      {view === 'work' && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Link prefetch={false} href={workHref(shiftMonth(-1), pick?.id)} className="inline-flex h-9 items-center rounded-button border border-border bg-bg px-3 text-sm font-bold" aria-label={t('prevMonth')}>‹</Link>
            <span className="num min-w-24 text-center text-base font-bold">{month}</span>
            <Link prefetch={false} href={workHref(shiftMonth(1), pick?.id)} className="inline-flex h-9 items-center rounded-button border border-border bg-bg px-3 text-sm font-bold" aria-label={t('nextMonth')}>›</Link>
            {active.length > 0 && <WorkPayeeFilter payees={payees.map((p) => ({ id: p.id, name: p.name }))} value={pick?.id ?? null} month={month} live={live} />}
            {active.length > 0 && (
              <span className="flex w-full flex-wrap items-center justify-end gap-2 sm:ml-auto sm:w-auto">
                <ConfirmAll rows={drafts} />
                <SheetOpener id="daily-work" label={t('workTitle')} className="inline-flex" />
              </span>
            )}
          </div>
          <AddSheet id="daily-work" title={t('workTitle')} modal wide>
            <WorkAdd month={month} live={live} payees={workOpts} preset={pick?.id} sheet="daily-work" />
          </AddSheet>
          {active.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-card border border-border p-6 text-center text-sm text-muted">
              {t('workNeedPayee')}
              <Link prefetch={false} href={href('payees')} className="inline-flex h-10 items-center rounded-button bg-primary px-4 font-bold text-on-primary">{t('workNeedPayeeGo')}</Link>
            </div>
          ) : (
            works.length === 0 && <p className="rounded-card border border-border p-6 text-center text-sm text-faint">{t('workEmpty')}</p>
          )}
          <div className="flex flex-col gap-3" data-work>
            {[...byPayee].map(([pid, rows]) => {
              const p = nameOf.get(pid);
              const liveRows = rows.filter((w) => w.status !== 'VOID');
              const days = new Set(liveRows.map((w) => w.workDate)).size;
              const qtyOf = (b: string) => liveRows.filter((w) => (engOf.get(w.engagementId)?.payBasis ?? 'DAY') === b).reduce((s, w) => s + w.quantity, 0);
              // 한 사람의 근무 줄 — 처음 SHOW일만 보이고 나머지는 접는다 (2026-10-29: 폰에서 22줄이 다 펼쳐져 너무 길었다)
              const row = (w: (typeof rows)[number]) => {
                      const basis = engOf.get(w.engagementId)?.payBasis ?? 'DAY';
                      return (
                        <li key={w.id} className={`flex items-start gap-3 px-4 py-3 text-sm ${w.status === 'VOID' ? 'text-faint line-through' : ''}`}>
                          {/* 폰: 첫 줄 날짜 · 금액 · 상태, 둘째 줄 현장 · 수량 × 단가 · 항목. PC: 한 줄 */}
                          <span className="flex min-w-0 flex-1 flex-col gap-1 lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-4">
                            <span className="flex items-center gap-2 lg:contents">
                              <b className="num w-14 shrink-0">{w.workDate.slice(5)}{w.segmentKey !== 'A' && ` (${w.segmentKey})`}</b>
                              <b className="num lg:order-3">{won(Math.round(w.quantity * w.dayRate))}</b>
                              {/* 확정은 머리에 「모두 확정」으로 한 번만 — 줄에는 확정 전 · 무효만 표시 */}
                              {w.status !== 'CONFIRMED' && <span className="ml-auto lg:order-5 lg:ml-0"><Chip tone={WTONE[w.status]}>{t(`wState.${w.status}`)}</Chip></span>}
                            </span>
                            <span className="num text-xs text-muted lg:order-2 lg:text-sm lg:text-text">{[w.project, `${f.number(w.quantity)}${t(`unit.${basis}`)} × ${won(w.dayRate)}`].filter(Boolean).join(' · ')}</span>
                            {w.items.length > 0 && <span className="num text-xs text-muted lg:order-4">{w.items.map((i) => `${i.label}(${t(`item.${i.kind}`)}) ${f.number(i.amount)}`).join(' · ')}</span>}
                            {w.basisNote && <span className="text-xs text-muted lg:order-6">{w.basisNote}</span>}
                          </span>
                          <WorkControls id={w.id} version={w.version} status={w.status} label={t('workOf', { name: p?.name ?? '', date: w.workDate })} values={{ quantity: w.quantity, dayRate: w.dayRate, items: w.items, basisNote: w.basisNote }} />
                        </li>
                      );
                    };
              const pay = liveRows.reduce((s, w) => s + Math.round(w.quantity * w.dayRate) + w.items.filter((i) => i.kind !== 'DEDUCTION').reduce((x, i) => x + i.amount, 0), 0);
              return (
                <section key={pid} className="rounded-card border border-border bg-bg">
                  <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-3">
                    <b>{p?.name}</b>
                    <span className="num text-xs text-muted">{p?.internalNo}</span>
                    {p?.workerKind === 'FOREIGN' && <Chip tone="info">{t('kind.FOREIGN')}</Chip>}
                    {liveRows.length > 0 && liveRows.every((w) => w.status === 'CONFIRMED') && <Chip tone="ok">{t('allConfirmed')}</Chip>}
                    {/* 0인 값(공수 0 · 시간 0)은 적지 않는다 (2026-10-29 검수) */}
                    <span className="num ml-auto text-sm text-muted">{[t('u.days', { n: days }), qtyOf('DAY') ? t('u.man', { n: f.number(qtyOf('DAY')) }) : null, qtyOf('HOUR') ? t('u.hours', { n: f.number(qtyOf('HOUR')) }) : null, t('u.pay', { pay: won(pay) })].filter(Boolean).join(' · ')}</span>
                  </header>
                  <ul className="flex flex-col divide-y divide-border">
                    {rows.slice(0, SHOW).map((w) => row(w))}
                    {rows.length > SHOW && (
                      <li>
                        <details className="group">
                          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-1 text-sm font-bold text-primary [&::-webkit-details-marker]:hidden">
                            <span className="group-open:hidden">{t('moreDays', { n: rows.length - SHOW })}</span>
                            <span className="hidden group-open:inline">{t('lessDays')}</span>
                            <ChevronDown aria-hidden size={16} className="transition-transform duration-300 group-open:rotate-180" />
                          </summary>
                          <ul className="flex flex-col divide-y divide-border border-t border-border">{rows.slice(SHOW).map((w) => row(w))}</ul>
                        </details>
                      </li>
                    )}
                  </ul>
                </section>
              );
            })}
          </div>
        </>
      )}

      {view === 'runs' && (
        <>
          <div className="flex justify-end">
            <SheetOpener id="daily-run" label={t('runTitle')} />
          </div>
          <AddSheet id="daily-run" title={t('runTitle')} modal>
            <div className="flex flex-col gap-3">
              <DailyRunCreate month={today.slice(0, 7)} payDate={today} live={live} />
              <p className="text-xs text-faint">{t('runNote')}</p>
            </div>
          </AddSheet>
          {runs.length === 0 && (
            <div className="flex flex-col gap-1 rounded-card border border-border p-6 text-center text-sm">
              <p className="text-faint">{t('runEmpty')}</p>
              <p className="text-muted">{t('runNeedWork')}</p>
            </div>
          )}
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {runs.map((r) => (
              <li key={r.id}>
                <Link prefetch={false} href={`/admin/payroll/daily/runs/${r.id}`} className="flex flex-col gap-2 rounded-card border border-border bg-bg p-4 hover:bg-surface">
                  <span className="flex flex-wrap items-center gap-2">
                    <b className="num">{t('runName', { month: r.periodFrom.slice(0, 7), n: r.sequence })}</b>
                    <Chip tone={RTONE[r.status]}>{t(`rState.${r.status}`)}</Chip>
                    {r.revision > 1 && <Chip tone="info">{t('revision', { n: r.revision })}</Chip>}
                  </span>
                  <span className="num text-xs text-muted">{t('runMeta', { month: r.periodFrom.slice(0, 7), payDate: r.payDate })}</span>
                  <span className={`text-sm font-bold ${r.status === 'FINALIZED' ? 'text-ok' : 'text-primary'}`}>{t(`next.${r.status}`)} ›</span>
                  <span className="num grid grid-cols-3 gap-2 text-sm">
                    <span className="flex flex-col"><span className="text-xs text-muted">{t('rPeople')}</span>{r.totals.members ?? '—'}</span>
                    <span className="flex flex-col"><span className="text-xs text-muted">{t('rGross')}</span>{r.totals.pay === undefined ? '—' : won(Number(r.totals.pay))}</span>
                    <span className="flex flex-col"><span className="text-xs text-muted">{t('rNet')}</span><b>{r.totals.net === undefined ? '—' : won(Number(r.totals.net))}</b></span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </PageShell>
  );
}
