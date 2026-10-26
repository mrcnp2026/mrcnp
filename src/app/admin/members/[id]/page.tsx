// 직원 상세 (2026-10-05 의뢰인: 샤플 대조) — 한 사람에 관한 일을 한 화면에서: 소속·연락처, 로그인(가입 여부), 기록 바로가기, 정보 수정.
// 지우는 버튼은 없다 (4-6). 퇴사·권한·로그인 초기화는 아래 「관리」 묶음에서 사유와 함께 한다.
import { CalendarDays, ChevronDown, KeyRound, Smartphone } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DetailBar } from '@/components/detail';
import { Card, CardTitle, Chip, PageShell } from '@/components/ui';
import { Fold } from '@/components/Fold';
import { CountUp } from '@/components/CountUp';
import { entriesFor, ledgerBalance, minutesToDays } from '@/lib/leave-ledger';
import { loadEntries, loadLots } from '@/lib/leave-ledger-data';
import { getMe } from '@/lib/auth';
import { consentAt } from '@/lib/consent';
import { groupPath, orgOptions } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { loadManagedGroups } from '@/lib/scope';
import { resignChecklist } from '@/lib/staff-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';
import { NewInviteButton } from '../NewInviteButton';
import { ManagerScope } from '../ManagerScope';
import { ManageAction } from './ManageAction';
import { RoleRequestCard } from './RoleRequestCard';
import { loadJobs } from '@/lib/job-data';
import { MAX_TOP, SHOWN_GRADES } from '@/lib/staff-rules';
import { GradeForm, type GradeKey } from './GradeForm';
import { Pager, pageOf } from '@/components/Pager';
import { loadMySlips } from '@/lib/payroll/publish-data';
import { OFFICE } from '@/config/office';
import { ProfileSection } from './ProfileSection';
import { StaffNotes } from './StaffNotes';
import { loadStaffNotes } from '@/lib/staff-notes';
import { StaffDetailsForm } from '@/components/StaffDetailsForm';
import { ForeignInfoForm } from '@/components/ForeignInfoForm';
import { daysToStayEnd } from '@/lib/foreign-rules';
import { loadForeignInfo, loadStaffDetails } from '@/lib/staff-details';

export default async function MemberDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sp?: string }> }) {
  const t = await getTranslations('admin.members');
  const td = await getTranslations('details');
  const tc = await getTranslations('common');
  const tm = await getTranslations('admin.manage');
  const tn = await getTranslations('admin.notes');
  const f = await getFormatter();
  const me = (await getMe())!;
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  const db = createAdminClient();
  const [{ data: p }, { data: keys }, groups] = await Promise.all([
    db.from('profiles').select('id, name, employee_no, role, active, joined_on, locale, can_view_payroll, group_id, phone, email, job_title, password_set_at, shift_template_id, job_id, admin_level').eq('id', id).maybeSingle(),
    db.from('user_passkeys').select('id, device_label, created_at, last_used_at').eq('employee_id', id).is('revoked_at', null),
    loadOrgGroups(),
  ]);
  if (!p) notFound();
  const [details, foreign] = await Promise.all([loadStaffDetails(p.id), loadForeignInfo(p.id)]); // 개인 정보 (묶음 17) — 직원이 넣고 관리자도 고친다 · 외국인 정보 (묶음 31) — 관리자만
  // 부양가족 · 자녀 수 (미팅 2026-10-15): 급여 세무 판(사원별 급여 › 세금)에 있는 값을 여기서도 보여 준다 — 고치는 곳은 급여 한 곳
  const today = toKstDate(new Date());
  const { data: taxNow } = await db.from('payroll_employee_tax_versions').select('family_count, child_count').eq('employee_id', id).eq('status', 'active').lte('valid_from', today).order('valid_from', { ascending: false }).limit(1).maybeSingle();
  // 가입 = 비밀번호를 만들었거나, 출퇴근 기기를 등록해 둔 사람. 출퇴근 기기(key)는 직원당 1대
  const key = keys?.[0] ?? null;
  const hasPasskey = !!key;
  const joined = !!p.password_set_at || hasPasskey;
  const managed = p.role === 'manager' ? await loadManagedGroups(p.id) : []; // 지점관리자가 맡은 지점
  const options = orgOptions(groups);
  const path = groupPath(groups, p.group_id);
  const jobList = (await loadJobs()).filter((x) => x.active || x.id === p.job_id);
  const jobName = p.job_id ? (jobList.find((x) => x.id === p.job_id)?.name ?? null) : null;
  // 근무 · 급여 (2026-10-19 의뢰인): 근무일정 틀은 여기서 바로 고르고(틀 만들기는 통합설정), 급여 계약은 보이기만 하고 고치기는 사원별 급여
  const tw = await getTranslations('admin.members.workPay');
  const tpay = await getTranslations('admin.staffPay.payType');
  const seePay = me.canViewPayroll;
  const { data: contract } = seePay
    ? await db.from('payroll_contract_versions').select('pay_type, amount, valid_from').eq('employee_id', id).eq('status', 'active').lte('valid_from', today).or(`valid_to.is.null,valid_to.gt.${today}`).order('valid_from', { ascending: false }).limit(1).maybeSingle()
    : { data: null };
  const payText = contract ? tw('payValue', { type: tpay(contract.pay_type as string), amount: f.number(Number(contract.amount)), from: contract.valid_from as string }) : tw('payNone');
  // 급(상)여 명세서 (2026-10-19 의뢰인: 직원 화면에서 최근 6개월, 넘으면 쪽 넘김) — 그 직원이 「내 급여」에서 보는 공개된 명세서 그대로. 급여를 볼 수 있는 관리자만
  const slipSp = (await searchParams).sp;
  const slips = seePay ? await loadMySlips(id, OFFICE.practiceMode) : [];
  const slipPage = pageOf(slips, slipSp, 6);
  const tps = await getTranslations('payslip');
  const slipSummary = slips.length ? tw('slipLatest', { month: slips[0].month, kind: slips[0].kind === 'BONUS' ? tps('bonus') : tw('slipPay'), net: f.number(slips[0].net), n: slips.length }) : tw('slipNone');
  const slipHref = (x: (typeof slips)[number]) => (x.runId ? `/admin/payroll/runs/${x.runId}/${id}` : `/admin/payroll/slips?m=${x.month}`);
  const day = (s: string) => f.dateTime(new Date(s), { dateStyle: 'medium' });
  const agreedAt = await consentAt(p.id);
  const notes = await loadStaffNotes(p.id); // 비고 (묶음 19) — 표가 없으면 null
  const joinedText = p.joined_on ? day(`${p.joined_on}T12:00:00+09:00`) : '–';
  const basicRows = [
    { k: t('colNo'), v: p.employee_no ?? '–' },
    { k: t('infoPhone'), v: p.phone ?? '–' },
    { k: t('emailShort'), v: p.email ?? '–' },
    { k: t('colGroup'), v: path ?? t('unassigned') },
    { k: t('jobTitleShort'), v: p.job_title ?? '–' },
    { k: t('colJob'), v: jobName ?? t('jobNone') },
    { k: t('infoJoined'), v: joinedText },
  ];
  const basicSummary = [path ?? t('unassigned'), p.job_title, t('joinedShort', { date: joinedText })].filter(Boolean).join(' · ');
  const personalBits = [
    details.birthDate ? td('sumBirth', { date: details.birthDate }) : null,
    details.emergencyContacts.length ? td('sumContacts', { n: details.emergencyContacts.length }) : null,
    details.certificates.length ? td('sumCerts', { n: details.certificates.length }) : null,
    details.carModel || details.carNumber ? td('sumCar') : null,
    taxNow ? td('sumFamily', { n: taxNow.family_count as number }) : null,
  ].filter(Boolean);
  const personalSummary = personalBits.length ? personalBits.join(' · ') : td('sumEmpty');
  const notesSummary = notes === null ? tn('notReadyShort') : notes.length ? tn('sumLatest', { body: notes[0].body.replace(/\s+/g, ' ').slice(0, 40) }) : tn('none');
  // 관리 동작: 본인 것은 스스로 못 바꾼다 (R-2). 퇴사 처리 전에 남은 일을 보여 준다 (②-2 7-2 요점 3)
  const self = me.id === p.id;
  const todo = p.active && !self ? await resignChecklist(p.id) : null;
  const todoNotes = todo
    ? ([['overtime', todo.overtime], ['corrections', todo.corrections], ['leave', todo.leave], ['work', todo.work]] as const).filter(([, n]) => n > 0).map(([k, n]) => tm(`todo.${k}`, { n }))
    : [];
  const api = `/api/admin/employees/${p.id}`;
  // 머리 숫자 칸 (2026-10-22 의뢰인: 「고급지지 않다」 — 이름 아래 글자만 있었다): 근속 · 남은 연차 · 로그인 · 출퇴근 기기
  const [lots, ledgerAll] = await Promise.all([loadLots({ employeeId: p.id, states: ['APPROVED'] }), loadEntries(p.id)]);
  const lb = lots.length > 0 ? ledgerBalance(lots, entriesFor(ledgerAll, OFFICE.practiceMode), today) : null;
  const tenure = (() => {
    if (!p.joined_on) return null;
    const [y1, m1, d1] = (p.joined_on as string).split('-').map(Number);
    const [y2, m2, d2] = today.split('-').map(Number);
    const months = (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
    return months < 0 ? null : { y: Math.floor(months / 12), m: months % 12 };
  })();
  // 등급 (2026-10-16 의뢰인 권한-10): 관리자 = 최고관리자(대표자 포함 최대 3명, 대표자 1명) · 지점관리자 · 일반직원
  const grade: GradeKey = p.role === 'admin' ? (p.admin_level === 'ceo' ? 'ceo' : 'super') : (p.role as GradeKey);
  const targetTop = p.role === 'admin';
  const { data: tops } = await db.from('profiles').select('id, name, admin_level').eq('role', 'admin').eq('active', true).or('admin_level.is.null,admin_level.neq.system'); // 시스템관리자는 최고관리자 3명에 세지 않는다 (묶음 23)
  const topNames = (tops ?? []).map((x) => x.name as string);
  const ceoName = (tops ?? []).find((x) => x.admin_level === 'ceo' && x.id !== p.id)?.name as string | undefined;
  // 오너는 다른 관리자가 있어도 자기 출퇴근 기기를 직접 해제한다 (staff-rules.checkDeviceRevoke)
  const soleAdmin = self && (me.top || ((await db.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin').eq('active', true).neq('id', me.id)).count ?? 0) === 0);
  // 대기 중인 권한 변경 (두 번째 관리자 확인, R-2의 8)
  const { data: pendingRole } = await db.from('role_change_requests').select('id, new_role, new_can_view_payroll, reason, requested_by').eq('target_id', p.id).eq('status', 'pending').maybeSingle();
  const requesterName = pendingRole ? ((await db.from('profiles').select('name').eq('id', pendingRole.requested_by).maybeSingle()).data?.name ?? '') : '';
  const changeLabel = pendingRole
    ? [
        pendingRole.new_role !== p.role ? tm(pendingRole.new_role === 'admin' ? 'makeAdmin' : pendingRole.new_role === 'manager' ? 'makeManager' : p.role === 'manager' ? 'removeManager' : 'removeAdmin') : null,
      ].filter(Boolean).join(' · ')
    : '';

  const stayLeft = daysToStayEnd(foreign.stayUntil, today);
  const stayChip = stayLeft !== null && stayLeft <= 60 ? <Chip tone={stayLeft <= 30 ? 'danger' : 'warn'}>{stayLeft < 0 ? td('foreign.stayOver', { n: -stayLeft }) : td('foreign.stayLeft', { n: stayLeft })}</Chip> : null;
  const foreignText = foreign.nationality ? `${td.has(`foreign.country.${foreign.nationality}`) ? td(`foreign.country.${foreign.nationality}`) : foreign.nationality} · ${foreign.visaType ?? td('foreign.visaNone')}` : td('foreign.domestic');

  return (
    <PageShell wide>
      <DetailBar plain back={p.active ? '/admin/members' : '/admin/members?f=inactive'} backLabel={tc('back')} title={t('title')} />
      {/* 머리: 누구인지(이름·소속·상태) + 가장 자주 가는 곳(날짜별 기록) — 한 카드 (2026-10-06 의뢰인: 상세 화면이 흩어져 보였다) */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-card border border-border bg-bg p-5 shadow-card lg:p-6">
        <span aria-hidden className="flex size-14 shrink-0 items-center justify-center rounded-chip bg-primary-tint text-xl font-extrabold text-primary">
          {p.name.slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-extrabold tracking-tight">{p.name}</h1>
          <p className="truncate text-sm text-muted">{[p.job_title, path ?? t('unassigned')].filter(Boolean).join(' · ')}</p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="num text-xs text-faint">{[...new Set([p.employee_no, p.phone, p.email].filter(Boolean))].join(' · ')}</span>
            {p.role === 'admin' && <Chip tone="info">{t(p.admin_level === 'ceo' ? 'levelCeo' : 'levelSuper')}</Chip>}
            {p.role === 'manager' && <Chip tone="info">{t('managerChip')}</Chip>}
            {!p.active && <Chip>{t('inactive')}</Chip>}
            {p.active && (agreedAt ? <Chip tone="ok">{t('consentYes', { date: day(agreedAt) })}</Chip> : <Chip tone="warn">{t('consentNo')}</Chip>)}
          </p>
        </div>
        <Link href={`/admin/records/${p.id}`} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-button bg-primary-tint px-4 text-sm font-bold text-primary lg:w-auto">
          <CalendarDays aria-hidden size={18} strokeWidth={2} />
          {t('toRecords')}
        </Link>
        {/* 숫자 네 칸: 상자 없이 여백 + 가는 세로선으로만 나눈다 (2026-10-23 의뢰인: 카드 남발) */}
        <dl className="grid w-full grid-cols-2 gap-x-6 gap-y-5 border-t border-border pt-5 md:grid-cols-4 md:gap-x-0 md:divide-x md:divide-border [&>*]:md:px-6 [&>*:first-child]:md:pl-0">
          <div className="flex flex-col gap-1">
            <dt className="text-xs text-muted">{t('stat.tenure')}</dt>
            <dd className="num text-2xl leading-tight font-extrabold tracking-tight">{tenure ? <CountUp value={tenure.y > 0 ? t('stat.tenureYm', { y: tenure.y, m: tenure.m }) : t('stat.tenureM', { m: tenure.m })} /> : <span className="text-faint">–</span>}</dd>
          </div>
          <Link href={`/admin/leave/emp/${p.id}`} className="flex flex-col gap-1 hover:opacity-80">
            <dt className="text-xs text-muted">{t('stat.leave')} ›</dt>
            <dd className="num text-2xl leading-tight font-extrabold tracking-tight text-primary-ink">{lb ? <CountUp value={t('stat.leaveDays', { n: f.number(minutesToDays(lb.remaining), { maximumFractionDigits: 2 }) })} /> : <span className="font-normal text-faint">–</span>}</dd>
          </Link>
          <div className="flex flex-col gap-1">
            <dt className="text-xs text-muted">{t('stat.login')}</dt>
            <dd className={`flex items-center gap-1.5 text-base font-bold ${joined ? 'text-ok' : 'text-warn'}`}>
              <KeyRound aria-hidden size={16} />
              {t(joined ? 'stat.loginOk' : 'stat.loginNo')}
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-xs text-muted">{t('stat.device')}</dt>
            <dd className={`flex items-center gap-1.5 text-base font-bold ${key ? 'text-ok' : 'text-warn'}`}>
              <Smartphone aria-hidden size={16} />
              {t(key ? 'stat.deviceOk' : 'stat.deviceNo')}
            </dd>
          </div>
        </dl>
      </header>

      {pendingRole && <RoleRequestCard id={pendingRole.id} change={changeLabel} requester={requesterName} reason={pendingRole.reason} mine={pendingRole.requested_by === me.id} />}

      {/* 2026-10-16 의뢰인 디자인: 한 사람의 정보를 접고 펴는 칸으로 — 접혀 있어도 한 줄 요약이 보인다.
          PC: 왼쪽(넓게) = 기본 정보 · 개인 정보 · 비고, 오른쪽 = 로그인 · 관리 / 폰: 기본 → 개인 → 비고 → 로그인 → 관리 */}
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-3 lg:items-start lg:gap-4">
        <div className="flex min-w-0 flex-col gap-3 lg:col-span-2 lg:gap-4">
          <Fold title={t('basicTitle')} summary={basicSummary} open>
            <ProfileSection
              employeeId={p.id}
              rows={basicRows}
              initial={{ name: p.name, employeeNo: p.employee_no ?? '', phone: p.phone ?? '', email: p.email ?? '', groupId: p.group_id ?? '', jobTitle: p.job_title ?? '', joinedOn: p.joined_on ?? '', locale: p.locale, jobId: p.job_id ?? '' }}
              groups={options}
              today={today}
              cell={
                // 입사일 오른쪽 빈칸: 국적 · 체류 (2026-10-23 의뢰인: 외국인 정보를 기본 정보로). 체류 기간이 60일 안이면 남은 날
                <div className="flex min-w-0 gap-3 border-b border-border py-2.5 text-sm">
                  <dt className="w-24 shrink-0 text-muted">{td('foreign.cell')}</dt>
                  <dd className="num flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 font-semibold break-words">
                    {foreignText}
                    {stayChip}
                  </dd>
                </div>
              }
              jobs={jobList.map((j) => ({ id: j.id, label: j.name }))}
              foreign={foreign}
              payHref={`/admin/payroll/staff/${p.id}`}
            />
          </Fold>

          {/* 개인 정보 (묶음 17): 생년월일 · 비상연락처 · 자격증 · 차량 + 부양가족(급여 세무 칸 값) */}
          <Fold id="details" title={td('title')} summary={personalSummary}>
            <p className="pb-3 text-xs text-faint">{td('adminNote')}</p>
            <StaffDetailsForm endpoint={`${api}/details`} initial={details} today={today} startEditing={false} />
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-3">
              <span className="w-20 shrink-0 text-sm text-muted">{td('family')}</span>
              <span className="num min-w-0 flex-1 text-sm font-semibold">{taxNow ? td('familyValue', { n: taxNow.family_count as number, c: taxNow.child_count as number }) : td('familyNone')}</span>
              <Link href={`/admin/payroll/staff/${p.id}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-primary lg:min-h-9">
                {td('familyEdit')} ›
              </Link>
            </div>
          </Fold>

          {/* 급(상)여 명세서 (2026-10-19 의뢰인): 접힌 채 한 줄(가장 최근 달 · 실지급) — 펴면 6개월씩, 넘으면 쪽 넘김. 폰 · PC 같은 접기 카드 */}
          {seePay && (
            <Fold id="slips" title={tw('slipTitle')} summary={`${contract ? tpay(contract.pay_type as string) : tw('payNoneShort')} · ${slipSummary}`} open={!!slipSp} aside={!contract ? <Chip tone="warn">{tw('payNoneShort')}</Chip> : slips.length > 0 ? <Chip tone="info">{tw('slipCount', { n: slips.length })}</Chip> : undefined}>
              {/* 급여 계약은 보이기만 — 고치는 곳은 사원별 급여 */}
              <div className="flex flex-col gap-1.5 border-b border-border pb-3 lg:flex-row lg:items-center lg:gap-3">
                <span className="w-24 shrink-0 text-sm text-muted">{tw('pay')}</span>
                <span className={`num min-w-0 flex-1 text-sm font-semibold ${contract ? '' : 'text-warn'}`}>{payText}</span>
                <Link href={`/admin/payroll/staff/${p.id}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-primary lg:min-h-9">
                  {tw(contract ? 'payEdit' : 'payAdd')} ›
                </Link>
              </div>
              {slips.length === 0 ? (
                <p className="pt-3 text-sm text-faint">{tw('slipEmpty')}</p>
              ) : (
                <div className="flex flex-col gap-2 pt-1">
                  <ul className="flex flex-col divide-y divide-border">
                    {slipPage.items.map((x) => (
                      <li key={x.id}>
                        <Link href={slipHref(x)} className="flex flex-col gap-0.5 py-2.5 hover:bg-surface lg:flex-row lg:items-center lg:gap-4 lg:px-1">
                          <span className="flex items-center gap-2 lg:w-44 lg:shrink-0">
                            <span className="num font-bold">{x.month}</span>
                            <Chip tone={x.kind === 'BONUS' ? 'info' : 'neutral'}>{x.kind === 'BONUS' ? tps('bonus') : tw('slipPay')}</Chip>
                            {x.revision > 1 && <span className="text-xs text-warn">{tps('corrected', { n: x.revision })}</span>}
                          </span>
                          <span className="num flex flex-1 flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 text-sm">
                            <span className="text-muted">
                              {tps('pay')} {f.number(x.pay)} · {tps('deduction')} {f.number(x.deduction)}
                            </span>
                            <span>
                              <span className="text-muted">{tps('net')} </span>
                              <b className="text-base">{tps('won', { n: f.number(x.net) })}</b>
                            </span>
                          </span>
                          <span className="num text-xs text-faint lg:w-32 lg:text-right">{tps('payDate', { date: x.payDate })}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <Pager page={slipPage.page} pages={slipPage.pages} param="sp" params={{}} anchor="slips" label={tc('pages')} />
                </div>
              )}
            </Fold>
          )}

          {/* 비고 (묶음 19): 관리자만 보는 그 사람에 대한 메모 — 4건씩 넘겨 본다 */}
          <Fold id="notes" title={tn('title')} summary={notesSummary} aside={notes && notes.length > 0 ? <Chip tone="info">{tn('countChip', { n: notes.length })}</Chip> : undefined}>
            <StaffNotes employeeId={p.id} notes={notes} />
          </Fold>
        </div>

        <div className="flex min-w-0 flex-col gap-3 lg:gap-4">
      <Card className="flex flex-col gap-3">
        <CardTitle>{t('loginCard')}</CardTitle>
        <div className="flex items-center gap-3">
          <KeyRound aria-hidden size={22} strokeWidth={1.75} className={`shrink-0 ${joined ? 'text-ok' : 'text-warn'}`} />
          <div className="min-w-0 flex-1">
            <p className={`font-bold ${joined ? '' : 'text-warn'}`}>{t(joined ? 'loginReady' : 'loginNone')}</p>
            <p className="num text-xs text-muted">
              {t('loginId', { no: p.employee_no ?? '' })}
              {p.password_set_at ? ` · ${t('loginSince', { date: day(p.password_set_at) })}` : hasPasskey ? ` · ${t('loginPasskeyOnly')}` : ''}
            </p>
          </div>
          {p.active && <NewInviteButton employeeId={p.id} name={p.name} compact again={joined} />}
        </div>
        {p.active && <p className="text-xs text-faint">{t(joined ? 'loginResetHint' : 'loginInviteHint')}</p>}
        {/* 출퇴근 기기: 직원이 자기 폰에서 직접 등록한다. 바꾸려면 아래 「관리 › 출퇴근 기기 해제」 */}
        <div className="flex items-center gap-3 border-t border-border pt-3">
          <Smartphone aria-hidden size={22} strokeWidth={1.75} className={`shrink-0 ${key ? 'text-ok' : 'text-warn'}`} />
          <div className="min-w-0 flex-1">
            <p className={`font-bold ${key ? '' : 'text-warn'}`}>{key ? t('deviceOk', { label: key.device_label || t('deviceUnknown') }) : t('deviceNone')}</p>
            <p className="num text-xs text-muted">
              {key ? `${t('deviceSince', { date: day(key.created_at) })}${key.last_used_at ? ` · ${t('deviceLast', { date: day(key.last_used_at) })}` : ''}` : t('deviceNoneHint')}
            </p>
          </div>
        </div>
      </Card>

      <Card id="manage" className="scroll-mt-20 p-0 py-1">
        <div className="px-5 pt-3 pb-1">
          <CardTitle>{tm('title')}</CardTitle>
        </div>
        {self ? (
          <>
            <p className="px-5 py-3 text-sm text-muted">{tm('selfNote')}</p>
            {/* 관리자가 혼자면 자기 출퇴근 기기는 스스로 해제할 수 있다 — 아니면 폰을 바꿀 길이 없다 */}
            {key && soleAdmin && (
              <ManageAction title={tm('revokeDevice')} hint={tm('revokeDeviceHint')} confirmLabel={tm('revokeDevice')} endpoint={`${api}/device`} body={{}} presets={[tm('preset.lost'), tm('preset.newPhone')]} notes={[tm('revokeDeviceNote')]} danger />
            )}
          </>
        ) : (
          <>
            {pendingRole && <p className="px-5 py-3 text-sm text-muted">{tm('pendingHide')}</p>}
            {/* 권한 등급 — 최고관리자 · 대표자 · 지점관리자 · 일반직원 (2026-10-16 의뢰인 권한-10) */}
            {!pendingRole && p.active && (!targetTop || me.top) && (
              <details className="group/grade border-t border-border first:border-t-0">
                <summary className="flex min-h-14 cursor-pointer list-none items-center gap-2 px-5 py-3 hover:bg-surface [&::-webkit-details-marker]:hidden">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-medium">{tm('gradeTitle')}</span>
                    <span className="text-xs text-muted">{tm('gradeNowLine', { grade: tm(`grade.${grade}`) })}</span>
                  </span>
                  <ChevronDown aria-hidden size={18} className="shrink-0 text-muted transition-transform group-open/grade:rotate-180" />
                </summary>
                <GradeForm
                  employeeId={p.id}
                  current={grade}
                  allowed={SHOWN_GRADES.filter((g) => g !== grade && (!(g === 'super' || g === 'ceo') || targetTop || topNames.length < MAX_TOP) && (g !== 'ceo' || !ceoName))}
                  topNames={topNames}
                  ceoName={ceoName}
                />
              </details>
            )}
            {!pendingRole && p.active && targetTop && !me.top && <p className="px-5 py-3 text-sm text-muted">{tm('owner_only')}</p>}
            {p.active && p.role === 'manager' && <ManagerScope employeeId={p.id} groups={orgOptions(groups)} picked={managed} />}
            {key && (
              <ManageAction title={tm('revokeDevice')} hint={tm('revokeDeviceHint')} confirmLabel={tm('revokeDevice')} endpoint={`${api}/device`} body={{}} presets={[tm('preset.lost'), tm('preset.newPhone')]} notes={[tm('revokeDeviceNote')]} danger />
            )}
            {joined && (
              <ManageAction title={tm('revokePhone')} hint={tm('revokePhoneHint')} confirmLabel={tm('revokePhone')} endpoint={`${api}/phone`} body={{}} presets={[tm('preset.lost'), tm('preset.changed')]} notes={[tm('revokePhoneNote')]} danger />
            )}
            {p.active ? (
              <ManageAction title={tm('resign')} hint={tm('resignHint')} confirmLabel={tm('resign')} endpoint={`${api}/status`} body={{ action: 'resign' }} presets={[tm('preset.resigned'), tm('preset.contractEnd')]} notes={[tm('resignNote'), ...todoNotes]} danger />
            ) : (
              <ManageAction title={tm('reinstate')} hint={tm('reinstateHint')} confirmLabel={tm('reinstate')} endpoint={`${api}/status`} body={{ action: 'reinstate' }} presets={[tm('preset.rejoin'), tm('preset.mistake')]} />
            )}
          </>
        )}
      </Card>
        </div>
      </div>
    </PageShell>
  );
}
