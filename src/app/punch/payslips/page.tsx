// 내 급여 조회 — 내 정보 · 급여상세 · 급(상)여 명세서를 한 화면에 (2026-10-14 의뢰인: 다우오피스 일반 메뉴 「급여 › 내 급여 조회」와 같은 구성, `스샷/스샷2/홈화면급여.png`).
// ① 내 정보(이름 · 사번 · 지점 · 직무 · 입사일) ② 급여상세: 지금 적용 중인 계약(급여 형태 · 금액) · 고정 수당 · 세무/보험 설정 — 본인 것만
// ③ 명세서: 해마다 목록 + 고른 달의 상세(PC는 나란히 2칸, 폰은 목록 → 한 장 화면). 관리자가 공개한 것만 보인다 (PRD v1.3 E01).
// 계좌 · 주민등록번호는 민감정보 결정(급여-36 · 37) 전이라 넣지 않는다.
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { HelpTip } from '@/components/Help';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { getMe } from '@/lib/auth';
import { loadJobs } from '@/lib/job-data';
import { groupPath } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { versionAt } from '@/lib/payroll/contract';
import { loadItems, reliefSwitches } from '@/lib/payroll/data';
import { loadMySlip, loadMySlips } from '@/lib/payroll/publish-data';
import { loadStaffPay } from '@/lib/payroll/staff-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';

function Box({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="rounded-card border border-border bg-bg">
      <div className="flex min-h-12 items-center gap-3 border-b border-border px-4 lg:px-6">
        <h2 className="flex-1 font-bold">{title}</h2>
        {aside}
      </div>
      <div className="px-4 py-4 lg:px-6">{children}</div>
    </section>
  );
}

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-baseline gap-3">
          <dt className="w-32 shrink-0 text-muted">{k}</dt>
          <dd className="num min-w-0 font-semibold">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export default async function MyPayPage({ searchParams }: { searchParams: Promise<{ y?: string; s?: string }> }) {
  const me = await getMe();
  if (!me) redirect('/login');
  const sp = await searchParams;
  const [t, tm, ts, f] = await Promise.all([getTranslations('payslip'), getTranslations('payslip.mine'), getTranslations('admin.staffPay'), getFormatter()]);
  const today = toKstDate(new Date());
  const [{ data: prof }, groups, jobs, pay, items, slips] = await Promise.all([
    createAdminClient().from('profiles').select('group_id, job_id, joined_on, phone, job_title').eq('id', me.id).maybeSingle(),
    loadOrgGroups(),
    loadJobs(),
    loadStaffPay(me.id),
    loadItems('PAYMENT'),
    loadMySlips(me.id, OFFICE.practiceMode),
  ]);
  const won = (v: number) => t('won', { n: f.number(v) });
  const dash = <span className="text-faint">–</span>;
  const unset = <span className="font-normal text-faint">{tm('notSet')}</span>;
  const tri = (v: 'YES' | 'NO' | 'UNKNOWN') => (v === 'UNKNOWN' ? unset : tm(v === 'YES' ? 'yesV' : 'noV'));
  const period = (from: string, to: string | null) => (to ? ts('period', { from, to }) : ts('periodOpen', { from }));
  // 지금 적용 중인 판, 없으면 곧 시작할 판(「○일부터 적용 예정」으로 보인다) — 계약을 넣었는데 칸이 통째로 비어 보이지 않게 (2026-10-14 의뢰인)
  const soon = <T extends { validFrom: string; validTo: string | null }>(rows: readonly T[]) => versionAt(rows, today) ?? [...rows].filter((r) => r.validFrom > today).sort((a, b) => a.validFrom.localeCompare(b.validFrom))[0] ?? null;
  const contract = soon(pay.contracts);
  const tax = soon(pay.taxes);
  // 회사의 감면 · 지원 사용 여부도 보이는 판이 적용되는 날 기준으로 (앞으로 시작할 판이면 그 시작일)
  const reliefOn = await reliefSwitches(tax && tax.validFrom > today ? tax.validFrom : today);
  const itemName = new Map(items.map((i) => [i.code, i.koName]));
  const fixed = pay.items.filter((i) => i.validFrom.localeCompare(today) !== 1 && (i.validTo === null || today.localeCompare(i.validTo) === -1)); // 오늘 적용 중인 것

  // 명세서: 해마다. 고른 해가 없으면 가장 최근 명세서의 해 → 올해
  const years = [...new Set(slips.map((s) => s.month.slice(0, 4)))].sort();
  const year = /^\d{4}$/.test(sp.y ?? '') ? sp.y! : (years.at(-1) ?? today.slice(0, 4));
  const inYear = slips.filter((s) => s.month.startsWith(year));
  const pickedId = inYear.find((s) => s.id === sp.s)?.id ?? inYear[0]?.id;
  const picked = pickedId ? await loadMySlip(me.id, pickedId, OFFICE.practiceMode) : null;
  const yearLink = (y: number) => `/punch/payslips?y=${y}`;

  return (
    <PageShell wide>
      <div>
        <h1 className="flex flex-wrap items-center gap-x-1 text-2xl font-bold">{tm('title')}<HelpTip>{tm('intro')}</HelpTip></h1>
      </div>

      <Box title={tm('profile')}>
        <Facts
          rows={[
            [tm('name'), me.name],
            [tm('no'), me.employeeNo ?? dash],
            [tm('group'), groupPath(groups, prof?.group_id) ?? dash],
            [tm('job'), jobs.find((j) => j.id === prof?.job_id)?.name ?? dash],
            [tm('jobTitle'), (prof?.job_title as string | null) || dash],
            [tm('joined'), (prof?.joined_on as string | null) ?? dash],
            [tm('phone'), (prof?.phone as string | null) || dash],
          ]}
        />
      </Box>

      {/* 급여상세 — 다우오피스 「내 급여 조회」와 같은 칸을 늘 보인다. 넣지 않은 값은 「미입력」 (2026-10-14 의뢰인: 칸이 통째로 빠져 「하나도 없다」로 보였다) */}
      <Box
        title={tm('detail')}
        aside={contract && <span className="num text-xs text-faint">{contract.validFrom > today ? tm('upcoming', { date: contract.validFrom }) : tm('since', { date: contract.validFrom })}</span>}
      >
        <div className="flex flex-col gap-5">
          {!contract && <p className="text-sm text-faint">{tm('noContract')}</p>}
          <Facts
            rows={[
              [tm('payType'), contract ? ts(`payType.${contract.payType}`) : unset],
              [tm('annual'), !contract ? unset : contract.payType === 'ANNUAL' ? won(contract.amount) : contract.payType === 'MONTHLY' ? <>{won(contract.amount * 12)} <span className="text-xs font-normal text-faint">{tm('annualFromMonthly')}</span></> : dash],
              [tm('monthly'), !contract ? unset : contract.payType === 'MONTHLY' ? won(contract.amount) : contract.payType === 'ANNUAL' ? (contract.annualDivisor ? <>{won(Math.floor(contract.amount / contract.annualDivisor))} <span className="text-xs font-normal text-faint">{tm('monthlyFromAnnual', { n: contract.annualDivisor })}</span></> : unset) : dash],
              ...(contract?.payType === 'HOURLY' ? [[tm('hourly'), won(contract.amount)] as [string, ReactNode]] : []),
              [tm('fixed'), fixed.length === 0 ? dash : fixed.map((i) => `${itemName.get(i.itemCode) ?? i.itemCode}${i.amount !== null ? ` ${won(i.amount)}` : ''}`).join(' · ')],
              [tm('fixedIncluded'), !contract ? unset : contract.included.overtimeHours || contract.included.holidayHours ? tm('includedYes', { ot: contract.included.overtimeHours ?? 0, hol: contract.included.holidayHours ?? 0 }) : tm('includedNo')],
            ]}
          />
          <details className="group border-t border-border pt-4">
            <summary className="flex min-h-9 cursor-pointer list-none items-center justify-center gap-1 text-sm font-semibold text-muted">
              <span className="group-open:hidden">{tm('more')}</span>
              <span className="hidden group-open:inline">{tm('less')}</span>
              <ChevronDown aria-hidden size={16} className="transition-transform duration-[350ms] ease-in-out group-open:rotate-180" />
            </summary>
            <div className="flex flex-col gap-5 pt-4">
              <Facts
                rows={[
                  [tm('family'), tax ? tm('people', { n: tax.familyCount }) : unset],
                  [tm('children'), tax ? tm('people', { n: tax.childCount }) : unset],
                  [tm('ratio'), tax ? ts('pct', { n: tax.withholdingRatio }) : unset],
                  [tm('loan'), tax ? tri(tax.studentLoan.state) : unset],
                  [tm('loanPeriod'), tax?.studentLoan.state === 'YES' && tax.studentLoan.from ? period(tax.studentLoan.from, tax.studentLoan.to) : dash],
                  [tm('loanAmount'), tax?.studentLoan.state === 'YES' && tax.studentLoan.monthlyAmount !== null ? won(tax.studentLoan.monthlyAmount) : dash],
                ]}
              />
              <Facts
                rows={[
                  [tm('sme'), !reliefOn.sme ? tm('companyOff') : tax ? tri(tax.reliefs.sme.state) : unset],
                  [tm('smeRate'), reliefOn.sme && tax?.reliefs.sme.state === 'YES' ? ts('pct', { n: tax.reliefs.sme.rate ?? 0 }) : dash],
                  [tm('smePeriod'), reliefOn.sme && tax?.reliefs.sme.state === 'YES' && tax.reliefs.sme.from ? period(tax.reliefs.sme.from, tax.reliefs.sme.to) : dash],
                  [tm('duru'), !reliefOn.durunuri ? tm('companyOff') : tax ? tri(tax.reliefs.durunuri.state) : unset],
                  [tm('duruPension'), reliefOn.durunuri && tax?.reliefs.durunuri.state === 'YES' ? ts('pct', { n: tax.reliefs.durunuri.pensionRate ?? 0 }) : dash],
                  [tm('duruEmployment'), reliefOn.durunuri && tax?.reliefs.durunuri.state === 'YES' ? ts('pct', { n: tax.reliefs.durunuri.employmentRate ?? 0 }) : dash],
                ]}
              />
              <Facts rows={(['pension', 'health', 'employment'] as const).map((k): [string, ReactNode] => [ts(`insurer.${k}`), tax ? (tax.insurance[k].state === 'UNKNOWN' ? unset : ts(`tri.${tax.insurance[k].state}`)) : unset])} />
              <Facts
                rows={[
                  [tm('bank'), <span key="b" className="text-xs font-normal text-faint">{tm('sensitive')}</span>],
                  [tm('pensionBank'), <span key="p" className="text-xs font-normal text-faint">{tm('sensitive')}</span>],
                ]}
              />
            </div>
          </details>
          <p className="text-xs text-faint">{tm('detailNote')}</p>
        </div>
      </Box>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold">{tm('slips')}</h2>
          <nav aria-label={tm('year')} className="ml-2 flex items-center gap-1">
            <Link href={yearLink(Number(year) - 1)} aria-label={tm('prevYear')} className="flex size-9 items-center justify-center rounded-button border border-border bg-bg text-muted">
              <ChevronLeft aria-hidden size={16} />
            </Link>
            <span className="num min-w-16 text-center font-bold">{year}</span>
            <Link href={yearLink(Number(year) + 1)} aria-label={tm('nextYear')} className="flex size-9 items-center justify-center rounded-button border border-border bg-bg text-muted">
              <ChevronRight aria-hidden size={16} />
            </Link>
          </nav>
          <Link href="/punch/retirement" className="ml-auto inline-flex min-h-9 items-center text-sm font-bold text-primary">
            {t('toRetirement')} ›
          </Link>
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
          <div className="overflow-hidden rounded-card border border-border bg-bg">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th scope="col" className="px-4 py-2.5 text-left">{tm('colMonth')}</th>
                  <th scope="col" className="hidden px-4 py-2.5 text-left sm:table-cell">{tm('colPayDate')}</th>
                  <th scope="col" className="hidden px-4 py-2.5 text-right sm:table-cell">{t('pay')}</th>
                  <th scope="col" className="hidden px-4 py-2.5 text-right sm:table-cell">{t('deduction')}</th>
                  <th scope="col" className="px-4 py-2.5 text-right">{t('net')}</th>
                </tr>
              </thead>
              <tbody>
                {inYear.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-faint">{t('empty')}</td>
                  </tr>
                )}
                {inYear.map((s) => {
                  const on = s.id === pickedId;
                  return (
                    <tr key={s.id} className={on ? 'bg-primary-tint' : ''}>
                      <td className="px-4 py-3">
                        {/* PC: 오른쪽 칸에 펼친다 · 폰: 한 장 화면으로 */}
                        <Link href={`/punch/payslips?y=${year}&s=${s.id}`} scroll={false} aria-current={on ? 'true' : undefined} className={`num hidden font-bold lg:inline ${on ? 'text-primary' : ''}`}>
                          {t('monthOf', { month: s.month })}
                        </Link>
                        <Link href={`/punch/payslips/${s.id}`} className="num font-bold text-primary lg:hidden">
                          {t('monthOf', { month: s.month })}
                        </Link>
                        <span className="flex flex-wrap gap-1 pt-1 empty:hidden">
                          {s.revision > 1 && <Chip tone="warn">{t('corrected', { n: s.revision })}</Chip>}
                          {s.kind === 'BONUS' && <Chip tone="info">{t('bonus')}</Chip>}
                          {s.isTest && <Chip>{t('practice')}</Chip>}
                        </span>
                      </td>
                      <td className="num hidden px-4 py-3 text-muted sm:table-cell">{s.payDate}</td>
                      <td className="num hidden px-4 py-3 text-right sm:table-cell">{won(s.pay)}</td>
                      <td className="num hidden px-4 py-3 text-right sm:table-cell">{won(s.deduction)}</td>
                      <td className="num px-4 py-3 text-right font-bold">{won(s.net)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="hidden rounded-card border border-border bg-bg lg:block">
            {!picked ? (
              <p className="px-6 py-10 text-center text-sm text-faint">{tm('pick')}</p>
            ) : (
              <div className="flex flex-col gap-4 px-6 py-5">
                <div className="flex items-center gap-2">
                  <h3 className="num flex-1 text-lg font-bold">{t('monthOf', { month: picked.slip.month })}</h3>
                  <a href={`/api/payslips/${picked.slip.id}/pdf`} className="inline-flex h-8 items-center rounded-button bg-primary px-3 text-sm font-bold text-on-primary">
                    {t('pdf')}
                  </a>
                  <Link href={`/punch/payslips/${picked.slip.id}`} className="inline-flex h-8 items-center rounded-button border border-border px-3 text-sm font-bold text-text">
                    {tm('open')}
                  </Link>
                </div>
                <div className="flex items-center justify-between rounded-button bg-surface px-4 py-3">
                  <span className="font-bold">{t('net')}</span>
                  <span className="num text-2xl font-extrabold">{won(picked.slip.net)}</span>
                </div>
                {(['PAYMENT', 'DEDUCTION'] as const).map((kind) => {
                  const lines = picked.lines.filter((l) => l.kind === kind);
                  return (
                    <div key={kind}>
                      <p className="flex justify-between border-b border-border pb-1.5 text-sm font-bold">
                        <span>{t(kind === 'PAYMENT' ? 'pay' : 'deduction')}</span>
                        <span className="num">{won(kind === 'PAYMENT' ? picked.slip.pay : picked.slip.deduction)}</span>
                      </p>
                      <ul className="text-sm">
                        {lines.map((l, i) => (
                          <li key={`${l.code}${i}`} className="flex justify-between gap-3 border-b border-border py-2 last:border-b-0">
                            <span>{t.has(`line.${l.code}`) ? t(`line.${l.code}`) : l.label}</span>
                            <span className="num font-semibold">{won(l.amount)}</span>
                          </li>
                        ))}
                        {lines.length === 0 && <li className="py-2 text-faint">{t('none')}</li>}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <p className="text-xs text-faint">{t('note')}</p>
      </section>
    </PageShell>
  );
}
