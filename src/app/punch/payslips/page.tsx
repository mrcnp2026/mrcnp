// 내 급여 조회 — 내 정보 · 급여상세 · 급(상)여 명세서를 한 화면에 (2026-10-14 의뢰인: 다우오피스 일반 메뉴 「급여 › 내 급여 조회」와 같은 구성, `스샷/스샷2/홈화면급여.png`).
// 2026-10-15 의뢰인 다시 지적: 「입력칸 뒤에 옅은 파란 칸, 미입력 같은 글은 쓰지 않는다, 숫자는 오른쪽 · 글자는 왼쪽, 명세서는 달력으로 지난달을 고른다,
//   근로자가 알 필요 없는 내용은 빼고 일반적인 급여명세서 항목만」 →
//   ① 칸 모양: 왼쪽 이름표(오른쪽 맞춤) + 옅은 파란 칸. 값이 없으면 칸만 비워 둔다 ② 안내 문장 · 「○일부터 적용」 · 환산 설명 · 원천징수 비율은 뺐다
//   ③ 명세서: [달 고르기(달력)] [조회] → 그해 목록 + 고른 달의 지급 · 공제 항목(PC는 나란히 2칸, 폰은 목록 → 한 장 화면). 계산 방법은 한 장 화면 · PDF에 있다(임금명세서 기재 사항).
// 계좌 · 주민등록번호는 민감정보 결정(급여-36 · 37) 전이라 칸만 둔다(비어 있음). 관리자가 공개한 명세서만 보인다 (PRD v1.3 E01).
import { ChevronDown, Printer, Search, UserRound } from 'lucide-react';
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

type V = ReactNode | null | undefined;

/** 이름표 + 옅은 파란 칸. num이면 오른쪽 맞춤, 값이 없으면 빈 칸 */
function Field({ label, value, num = false, unit, range, fill = false }: { label: string; value?: V; num?: boolean; unit?: string; range?: [V, V]; fill?: boolean }) {
  const box = (v: V, k?: string) => (
    // 칸: 아주 옅은 파랑 회색 · 높이 28px · PC는 다우오피스처럼 정해진 폭 (2026-10-15 의뢰인: 파란 칸이 색 · 크기 모두 과하다)
    <span key={k} className={`flex h-7 min-w-0 flex-1 items-center rounded-sm bg-rail px-2 text-sm ${fill ? '' : `lg:flex-none ${range ? 'lg:w-24' : 'lg:w-44'}`} ${num ? 'num justify-end' : ''}`}>
      {v ?? ''}
    </span>
  );
  return (
    <div className="flex items-center gap-3">
      <dt className="w-28 shrink-0 text-right text-sm lg:w-36">{label}</dt>
      <dd className="flex min-w-0 flex-1 items-center gap-1.5">
        {range ? (
          <>
            {box(range[0], 'a')}
            <span className="text-faint">~</span>
            {box(range[1], 'b')}
          </>
        ) : (
          box(value)
        )}
        {unit && <span className="w-4 shrink-0 text-sm text-muted">{unit}</span>}
      </dd>
    </div>
  );
}

const grid = 'grid gap-x-8 gap-y-2.5 md:grid-cols-2 xl:grid-cols-3';

export default async function MyPayPage({ searchParams }: { searchParams: Promise<{ y?: string; s?: string; m?: string }> }) {
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
  const n = (v: number) => f.number(v);
  const yn = (v: 'YES' | 'NO' | 'UNKNOWN' | undefined) => (v === 'YES' ? tm('yesV') : v === 'NO' ? tm('noV') : null);
  // 지금 적용 중인 판, 없으면 곧 시작할 판 — 계약을 넣었는데 칸이 통째로 비어 보이지 않게
  const soon = <T extends { validFrom: string; validTo: string | null }>(rows: readonly T[]) => versionAt(rows, today) ?? [...rows].filter((r) => r.validFrom > today).sort((a, b) => a.validFrom.localeCompare(b.validFrom))[0] ?? null;
  const c = soon(pay.contracts);
  const tax = soon(pay.taxes);
  const reliefOn = await reliefSwitches(tax && tax.validFrom > today ? tax.validFrom : today);
  const itemName = new Map(items.map((i) => [i.code, i.koName]));
  const fixed = pay.items.filter((i) => i.validFrom.localeCompare(today) !== 1 && (i.validTo === null || today.localeCompare(i.validTo) === -1));
  const sme = reliefOn.sme && tax?.reliefs.sme.state === 'YES' ? tax.reliefs.sme : null;
  const duru = reliefOn.durunuri && tax?.reliefs.durunuri.state === 'YES' ? tax.reliefs.durunuri : null;
  const loan = tax?.studentLoan.state === 'YES' ? tax.studentLoan : null;

  // 명세서: 달을 고르면(?m=YYYY-MM) 그해 목록 + 그 달 명세서. 고른 것이 없으면 가장 최근 명세서의 해
  const m = /^\d{4}-\d{2}$/.test(sp.m ?? '') ? sp.m! : null;
  const years = [...new Set(slips.map((s) => s.month.slice(0, 4)))].sort();
  const year = m ? m.slice(0, 4) : /^\d{4}$/.test(sp.y ?? '') ? sp.y! : (years.at(-1) ?? today.slice(0, 4));
  const inYear = slips.filter((s) => s.month.startsWith(year));
  const pickedId = inYear.find((s) => s.id === sp.s)?.id ?? (m ? inYear.find((s) => s.month.startsWith(m))?.id : inYear[0]?.id);
  const picked = pickedId ? await loadMySlip(me.id, pickedId, OFFICE.practiceMode) : null;
  const group = groupPath(groups, prof?.group_id) ?? null;
  const box = 'flex h-7 items-center rounded-sm bg-rail px-2 text-sm';

  return (
    <PageShell wide>
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h1 className="text-2xl font-bold">{tm('title')}</h1>
        <p className="text-sm text-muted">{tm('intro')}</p>
      </div>

      {/* 내 정보 */}
      <details open className="group rounded-card border border-border bg-bg">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 pt-3 text-sm font-bold lg:hidden [&::-webkit-details-marker]:hidden">
          {tm('profile')}
          <ChevronDown aria-hidden size={16} className="transition-transform duration-[350ms] group-open:rotate-180" />
        </summary>
        <div className="flex gap-6 p-4 lg:p-6">
          <span className="hidden size-24 shrink-0 items-center justify-center bg-surface text-faint lg:flex">
            <UserRound aria-hidden size={48} strokeWidth={1.25} />
          </span>
          <dl className={`${grid} flex-1`} data-pay-profile>
            <Field label={tm('name')} value={me.name} />
            <Field label={tm('no')} value={me.employeeNo} />
            <Field label={tm('group')} value={group} />
            <Field label={tm('job')} value={jobs.find((j) => j.id === prof?.job_id)?.name} />
            <Field label={tm('jobTitle')} value={(prof?.job_title as string | null) || null} />
            <Field label={tm('joined')} value={(prof?.joined_on as string | null) ?? null} num />
            <Field label={tm('phone')} value={(prof?.phone as string | null) || null} num />
          </dl>
        </div>
      </details>

      {/* 급여상세 */}
      <section className="rounded-card border border-border bg-bg" data-pay-detail>
        <h2 className="border-b border-border px-4 py-3 font-bold lg:px-6">{tm('detail')}</h2>
        <dl className={`${grid} px-4 py-4 lg:px-6`}>
          <Field label={tm('payType')} value={c ? ts(`payType.${c.payType}`) : null} />
          <Field label={tm('annual')} num value={c?.payType === 'ANNUAL' ? n(c.amount) : c?.payType === 'MONTHLY' ? n(c.amount * 12) : null} />
          <Field label={c?.payType === 'HOURLY' ? tm('hourly') : tm('monthly')} num value={!c ? null : c.payType === 'MONTHLY' || c.payType === 'HOURLY' ? n(c.amount) : c.annualDivisor ? n(Math.floor(c.amount / c.annualDivisor)) : null} />
          <Field label={tm('fixed')} value={fixed.length ? fixed.map((i) => `${itemName.get(i.itemCode) ?? i.itemCode}${i.amount !== null ? ` ${n(i.amount)}` : ''}`).join(', ') : null} />
          <Field label={tm('fixedIncluded')} value={c ? (c.included.overtimeHours || c.included.holidayHours ? tm('yesV') : tm('noV')) : null} />
        </dl>
        <details className="group border-t border-border">
          <summary className="flex min-h-10 cursor-pointer list-none items-center justify-center gap-1 text-sm text-muted [&::-webkit-details-marker]:hidden">
            {tm('more')}
            <ChevronDown aria-hidden size={16} className="transition-transform duration-[350ms] ease-in-out group-open:rotate-180" />
          </summary>
          <div className="flex flex-col divide-y divide-border border-t border-border">
            <dl className={`${grid} px-4 py-4 lg:px-6`}>
              <Field label={tm('family')} num value={tax ? n(tax.familyCount) : null} />
              <Field label={tm('children')} num value={tax ? n(tax.childCount) : null} />
              <Field label={tm('loan')} value={yn(tax?.studentLoan.state)} />
              <Field label={tm('loanPeriod')} num range={[loan?.from, loan?.to]} />
              <Field label={tm('loanAmount')} num value={loan?.monthlyAmount != null ? n(loan.monthlyAmount) : null} />
              <Field label={tm('sme')} value={reliefOn.sme ? yn(tax?.reliefs.sme.state) : tm('noV')} />
              <Field label={tm('smePeriod')} num range={[sme?.from, sme?.to]} />
              <Field label={tm('smeRate')} num unit="%" value={sme?.rate ?? null} />
              <Field label={tm('duru')} value={reliefOn.durunuri ? yn(tax?.reliefs.durunuri.state) : tm('noV')} />
              <Field label={tm('duruPension')} num unit="%" value={duru?.pensionRate ?? null} />
              <Field label={tm('duruEmployment')} num unit="%" value={duru?.employmentRate ?? null} />
              {(['pension', 'health', 'employment'] as const).map((k) => (
                <Field key={k} label={ts(`insurer.${k}`)} value={tax && tax.insurance[k].state !== 'UNKNOWN' ? ts(`tri.${tax.insurance[k].state}`) : null} />
              ))}
            </dl>
            <dl className={`${grid} px-4 py-4 lg:px-6`}>
              <Field label={tm('bankName')} />
              <Field label={tm('bankAccount')} />
              <Field label={tm('pensionBankName')} />
              <Field label={tm('pensionAccount')} />
            </dl>
          </div>
        </details>
      </section>

      {/* 급(상)여 명세서 */}
      <section className="flex flex-col gap-3" data-pay-slips>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="pr-2 text-lg font-bold">{tm('slips')}</h2>
          <form action="/punch/payslips" className="flex items-center gap-1.5">
            <label className="flex items-center">
              <span className="sr-only">{tm('monthPick')}</span>
              {/* 브라우저 달력 단추가 칸 오른쪽에 붙는다 — 누르면 달을 고른다 */}
              <input type="month" name="m" defaultValue={m ?? (picked ? picked.slip.month.slice(0, 7) : `${year}-${today.slice(5, 7)}`)} max={today.slice(0, 7)} className="num h-9 rounded-button border border-border bg-bg px-2.5 text-sm" />
            </label>
            <button type="submit" className="inline-flex h-9 items-center gap-1 rounded-button border border-border bg-bg px-3 text-sm font-semibold hover:bg-surface">
              <Search aria-hidden size={14} />
              {tm('search')}
            </button>
          </form>
          <span className="ml-auto flex items-center gap-2">
            <Link href="/punch/retirement" className="inline-flex min-h-9 items-center text-sm text-primary">
              {t('toRetirement')} ›
            </Link>
            {picked && (
              <a href={`/api/payslips/${picked.slip.id}/pdf`} className="inline-flex h-9 items-center gap-1.5 rounded-button border border-border bg-bg px-3 text-sm font-semibold hover:bg-surface">
                <Printer aria-hidden size={14} />
                {tm('printSlip')}
              </a>
            )}
          </span>
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
          <div className="overflow-hidden border-t border-text bg-bg">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="px-3 py-2.5 text-center font-semibold">{tm('colMonth')}</th>
                  <th scope="col" className="hidden px-3 py-2.5 text-center font-semibold sm:table-cell">{tm('colPayDate')}</th>
                  <th scope="col" className="hidden px-3 py-2.5 text-center font-semibold sm:table-cell">{tm('colPay')}</th>
                  <th scope="col" className="hidden px-3 py-2.5 text-center font-semibold sm:table-cell">{tm('colDeduction')}</th>
                  <th scope="col" className="px-3 py-2.5 text-center font-semibold">{tm('colNet')}</th>
                </tr>
              </thead>
              <tbody>
                {inYear.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-faint">{tm('noSlip')}</td>
                  </tr>
                )}
                {inYear.map((s) => {
                  const on = s.id === pickedId;
                  return (
                    <tr key={s.id} className={`border-b border-border ${on ? 'bg-primary-tint' : ''}`}>
                      <td className="px-3 py-2.5 text-center">
                        {/* PC: 오른쪽 칸에 펼친다 · 폰: 한 장 화면으로 */}
                        <Link href={`/punch/payslips?y=${year}&s=${s.id}`} scroll={false} aria-current={on ? 'true' : undefined} className={`num hidden font-semibold lg:inline ${on ? 'text-primary' : ''}`}>
                          {s.month.slice(0, 7)}
                        </Link>
                        <Link href={`/punch/payslips/${s.id}`} className="num font-semibold text-primary lg:hidden">
                          {s.month.slice(0, 7)}
                        </Link>
                        {(s.revision > 1 || s.kind === 'BONUS') && (
                          <span className="flex justify-center gap-1 pt-1">
                            {s.revision > 1 && <Chip tone="warn">{t('corrected', { n: s.revision })}</Chip>}
                            {s.kind === 'BONUS' && <Chip tone="info">{t('bonus')}</Chip>}
                          </span>
                        )}
                      </td>
                      <td className="num hidden px-3 py-2.5 text-center sm:table-cell">{s.payDate}</td>
                      <td className="num hidden px-3 py-2.5 text-right sm:table-cell">{n(s.pay)}</td>
                      <td className="num hidden px-3 py-2.5 text-right sm:table-cell">{n(s.deduction)}</td>
                      <td className="num px-3 py-2.5 text-right font-semibold">{n(s.net)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="hidden border border-border bg-bg lg:block" data-slip-panel>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5 border-b border-border px-5 py-4">
              <Field fill label={tm('empName')} value={picked ? me.name : null} />
              <Field fill label={tm('dept')} value={picked ? group : null} />
              <Field fill label={tm('payTotal')} num value={picked ? n(picked.slip.pay) : null} />
              <Field fill label={tm('dedTotal')} num value={picked ? n(picked.slip.deduction) : null} />
            </dl>
            {picked && (
              <>
                <div className="grid grid-cols-2 divide-x divide-border">
                  {(['PAYMENT', 'DEDUCTION'] as const).map((kind) => {
                    const lines = picked.lines.filter((l) => l.kind === kind);
                    return (
                      <div key={kind} className="flex flex-col gap-2 px-5 py-4">
                        <p className="text-sm font-bold">{t(kind === 'PAYMENT' ? 'pay' : 'deduction')}</p>
                        <dl className="flex flex-col gap-1.5">
                          {lines.map((l, i) => (
                            <div key={`${l.code}${i}`} className="flex items-center gap-3">
                              <dt className="w-28 shrink-0 text-right text-sm">{t.has(`line.${l.code}`) ? t(`line.${l.code}`) : l.label}</dt>
                              <dd className={`${box} num flex-1 justify-end`}>{n(l.amount)}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between border-t border-border bg-surface px-5 py-3">
                  <span className="text-sm font-bold">{tm('colNet')}</span>
                  <span className="num text-xl font-bold">{n(picked.slip.net)}</span>
                </div>
                <p className="px-5 py-2 text-right">
                  <Link href={`/punch/payslips/${picked.slip.id}`} className="text-sm text-primary">
                    {tm('open')} ›
                  </Link>
                </p>
              </>
            )}
          </div>
        </div>
      </section>
    </PageShell>
  );
}
