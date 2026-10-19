// 설정 (더보기 › 설정) — 근무시간 · 휴일 · 사무실 인터넷 주소를 화면에서 바꾼다 (2026-10-05: 지금까지는 개발자가 DB·열쇠 파일을 고쳐야 했다).
// 근무시간은 이력이다: 고치지 않고 "언제부터 적용"되는 새 규칙을 넣는다 (② 4-1). 휴일·주소는 지우지 않고 빼거나 끈다 (변경 기록에 남는다).
import { getFormatter, getTranslations } from 'next-intl/server';
import { getSettingAt } from '@/lib/settings';
import { ScheduleModeForm } from './ScheduleModeForm';
import { HelpTip } from '@/components/Help';
import { headers } from 'next/headers';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { SettingBox, SettingGroup, SettingRow, UseMark } from '@/components/settings';
import { Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { addDays } from '@/lib/calendar';
import { createAdminClient } from '@/lib/supabase/admin';
import { hhmm, toKstDate } from '@/lib/time';
import { isOfficeIp, parseCidr, traceClientIp } from '@/lib/verify-location';
import { loadOfficeLocations } from '@/lib/geo-data';
import { loadOrgGroups } from '@/lib/org-data';
import { PAY_SECTIONS } from '@/lib/payroll/settings';
import { PaySettings } from './pay/PaySettings';
import { PinReset } from './PinReset';
import { CompanyForm } from './CompanyForm';
import { companyProfile } from '@/lib/company';
import { isSwitchKey, switches } from '@/lib/switches';
import { SwitchToggle } from '@/components/SwitchToggle';
import { BRAND } from '@/config/brand';
import { getMe } from '@/lib/auth';
import { ConfirmButton, HolidayForm, NetworkForm, RuleForm } from './SettingsForms';

// 탭 이름 · 순서는 시프티의 회사 설정 (2026-10-11 의뢰인 스샷 `스샷/관리-회사설정*.png`). 일반 · 근무일정 · 출퇴근기록 · 휴게시간은 바꿀 수 있는 설정이고,
// 나머지 탭은 지금 앱이 동작하는 방식을 같은 줄 모양으로 보여 준다(on = 쓰는 기능인가, href = 관련 관리 화면)
const TABS = ['general', 'holidays', 'notify', 'access', 'branch', 'staff', 'work', 'punch', 'break', 'leave', 'request', 'message', 'esign', 'closing', 'report', 'pay', 'security', 'advanced'] as const;
type Tab = (typeof TABS)[number];
const INFO: Partial<Record<Tab, { k: string; on: boolean; href?: string }[]>> = {
  notify: [{ k: 'notice', on: true }, { k: 'request', on: true }, { k: 'push', on: true }],
  access: [{ k: 'admin', on: true }, { k: 'payroll', on: true }, { k: 'employee', on: true }, { k: 'change', on: true }],
  branch: [{ k: 'parent', on: true }, { k: 'places', on: true, href: '/admin/branches' }],
  staff: [{ k: 'number', on: true }, { k: 'invite', on: true }, { k: 'device', on: true, href: '/admin/members' }],
  leave: [{ k: 'hourly', on: true, href: '/admin/leave/types' }, { k: 'pending', on: true }, { k: 'accrual', on: true, href: '/admin/leave/ledger' }],
  request: [{ k: 'punch', on: true }, { k: 'correction', on: true }, { k: 'overtime', on: true }, { k: 'shift', on: true }, { k: 'leave', on: true }, { k: 'leaveDelete', on: true }, { k: 'work', on: true }, { k: 'approver', on: true, href: '/admin/manage/approval-rules' }, { k: 'custom', on: false }],
  message: [{ k: 'notice', on: true, href: '/admin/notices' }, { k: 'translate', on: true }, { k: 'auto', on: false }],
  closing: [{ k: 'day', on: true }, { k: 'month', on: true, href: '/admin/closing' }],
  report: [{ k: 'monthly', on: true, href: '/admin/records' }, { k: 'week52', on: true }],
  pay: [{ k: 'scope', on: true, href: '/admin/payroll' }, { k: 'viewer', on: true }, { k: 'tax', on: true, href: '/admin/payroll/staff' }],
  esign: [{ k: 'use', on: false }],
  advanced: [{ k: 'homeCards', on: true }, { k: 'bulk', on: false }, { k: 'brand', on: true }],
  security: [{ k: 'login', on: true }, { k: 'audit', on: true }, { k: 'consent', on: true }, { k: 'ip', on: false }],
};

// PC 설정 줄 — 통합설정 부품(components/settings.tsx). side: 짧은 값은 오른쪽에, 아니면(표 · 양식 · 설명) 이름 아래에 펼친다
function SetRow({ label, children, side = false }: { label: string; children: ReactNode; side?: boolean; last?: boolean }) {
  return (
    <SettingRow label={label} wide={!side}>
      {children}
    </SettingRow>
  );
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string; section?: string; v?: string; year?: string; from?: string; edit?: string; add?: string }> }) {
  // PC: 시프티의 회사 설정 구성 (2026-10-11 의뢰인 스샷 `스샷/관리-회사설정*.png`) — 사이드 메뉴 옆 둘째 메뉴에서 탭을 고르고,
  // 본문은 「굵은 항목 이름 — 값」 줄 + 회색 띠 묶음 제목 + 오른쪽 위 버튼. 폰은 예전처럼 카드 네 장을 한 화면에
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? '') ? (sp.tab as Tab) : 'general';
  // 급여 탭은 9개 화면이 있는 따로 된 구성이다 (PRD v1.3 4.1 · 17장) — PC · 폰 같은 화면
  if (tab === 'pay') {
    // 화면 제목 = 메뉴 이름 (2026-10-14 의뢰인) — employee-defaults → payEmployeeDefaults
    const section = (PAY_SECTIONS as readonly string[]).includes(sp.section ?? '') ? (sp.section as string) : 'employee-defaults';
    const tfp = await getTranslations('frame');
    const tpay = await getTranslations('admin.paySettings');
    return (
      <PageShell wide>
        <h1 className="flex flex-wrap items-center gap-x-1 text-2xl font-bold">
          {tfp(`item.pay${section.split('-').map((x) => x[0].toUpperCase() + x.slice(1)).join('')}`)}
          <HelpTip>{tpay(`intro.${section}`)}</HelpTip>
        </h1>
        <PaySettings sp={sp} />
      </PageShell>
    );
  }
  const info = INFO[tab];
  const tsm = await getTranslations('admin.settings.scheduleMode');
  const scheduleMode = (await getSettingAt('schedule.request_mode', toKstDate(new Date()))) as 'approval' | 'direct';
  // 권한 한 화면 (2026-10-14 문서 07 ④-4): 관리자 · 지점관리자 · 급여 담당을 표로. 바꾸기는 직원 화면에서(다른 관리자 확인 규칙을 그대로 쓴다)
  const access =
    tab === 'access'
      ? await (async () => {
          const db0 = createAdminClient();
          const [{ data: ppl }, { data: scopes }, groups, { data: pins }] = await Promise.all([
            db0.from('profiles').select('id, name, employee_no, role, admin_level, can_view_payroll').eq('active', true).order('name'), // 시스템관리자도 여기에는 한 줄 보인다 (2026-10-18 의뢰인)
            db0.from('staff_manager_scopes').select('manager_id, group_id').eq('active', true),
            loadOrgGroups(),
            db0.from('console_pins').select('employee_id'),
          ]);
          const hasPin = new Set((pins ?? []).map((x) => x.employee_id as string));
          const real = (ppl ?? []).filter((x) => !(x.employee_no as string | null)?.startsWith('e2e-'));
          const gname = new Map(groups.map((g) => [g.id, g.name]));
          return {
            staff: real.filter((x) => x.admin_level !== 'system').length,
            rows: real
              .filter((x) => x.role !== 'employee')
              .sort((a, b) => (a.role === b.role ? 0 : a.role === 'admin' ? -1 : 1))
              .map((x) => ({ id: x.id as string, name: x.name as string, no: x.employee_no as string | null, role: x.role as string, level: x.admin_level as string | null, pay: x.role === 'admin', scope: (scopes ?? []).filter((c) => c.manager_id === x.id).map((c) => gname.get(c.group_id as string) ?? '').filter(Boolean), pin: hasPin.has(x.id as string) })),
            meId: (await getMe())?.id ?? '',
          };
        })()
      : null;
  const ta = await getTranslations('admin.settings.access');
  const tco = await getTranslations('admin.settings.company');
  const company = await companyProfile();
  const ti = await getTranslations('admin.settings.info');
  const tsw = await getTranslations('admin.settings.switch');
  const sw = await switches(); // 켜고 끄는 항목 (2026-10-19 의뢰인) — 나머지는 법 · 계산에 걸려 있어 고정
  const t = await getTranslations('admin.settings');
  const ts = await getTranslations('side');
  const memberText = await getTranslations('admin.members');
  const tf = await getTranslations('frame'); // 화면 제목 = 메뉴 이름 (2026-10-14 의뢰인)
  const tp = await getTranslations('admin.settings.pc');
  const tm = await getTranslations('admin.more');
  const f = await getFormatter();
  const today = toKstDate(new Date());
  const monthStart = `${today.slice(0, 7)}-01`;
  const db = createAdminClient();
  const [{ data: rules }, { data: holidays }, { data: networks }] = await Promise.all([
    db.from('work_rules').select('id, start_time, end_time, late_grace_min, break_start, break_end, extra_breaks, round_step_min, workdays, weekly_rest_day, effective_from').eq('active', true).order('effective_from', { ascending: false }),
    db.from('holidays').select('the_date, label, kind').gte('the_date', monthStart).order('the_date').limit(60),
    db.from('office_networks').select('id, cidr, label, active').order('created_at'),
  ]);
  // 검사 스크립트가 넣었다 끈 위치(메모가 e2e-…)는 목록에 보이지 않게
  const locations = (await loadOfficeLocations(true)).filter((l) => l.active || !l.label?.startsWith('e2e-'));
  const current = (rules ?? []).find((r) => r.effective_from <= today) ?? null;
  const upcoming = (rules ?? []).filter((r) => r.effective_from > today).reverse();
  // 2024-01-01은 월요일 — 요일 이름(월…일)을 화면 언어로
  const weekdays = [...Array(7)].map((_, i) => f.dateTime(new Date(`2024-01-0${i + 1}T12:00:00+09:00`), { weekday: 'short' }));
  const day = (d: string) => f.dateTime(new Date(`${d}T12:00:00+09:00`), { year: 'numeric', month: 'short', day: 'numeric', weekday: 'short' });
  const ruleLine = (r: NonNullable<typeof current>) => (
    <dl className="num grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      <dt className="text-muted">{t('hours')}</dt>
      <dd>{hhmm(r.start_time)} ~ {hhmm(r.end_time)}</dd>
      <dt className="text-muted">{t('break')}</dt>
      <dd>{r.break_start && r.break_end ? [`${hhmm(r.break_start)} ~ ${hhmm(r.break_end)}`, ...((r.extra_breaks as { start: string; end: string }[] | null) ?? []).map((x) => `${x.start} ~ ${x.end}`)].join(' · ') : t('none')}</dd>
      <dt className="text-muted">{t('roundShort')}</dt>
      <dd>{r.round_step_min ? t('roundValue', { n: r.round_step_min }) : t('roundOff')}</dd>
      <dt className="text-muted">{t('graceShort')}</dt>
      <dd>{t('minutes', { n: r.late_grace_min })}</dd>
      <dt className="text-muted">{t('workdays')}</dt>
      <dd>{(r.workdays as number[]).map((d) => weekdays[d - 1]).join(' · ')}</dd>
      <dt className="text-muted">{t('restDay')}</dt>
      <dd>{weekdays[r.weekly_rest_day - 1]}</dd>
    </dl>
  );
  const trace = traceClientIp(await headers(), OFFICE.ipHeaderOrder);
  const activeCidrs = [...(networks ?? []).filter((n) => n.active).map((n) => String(n.cidr)), ...OFFICE.allowedCidrs].filter((c) => parseCidr(c));
  const here = isOfficeIp(trace.ip, activeCidrs);
  const base = current ?? upcoming[0] ?? null;
  const breaks = current?.break_start && current.break_end ? [{ start: hhmm(current.break_start), end: hhmm(current.break_end) }, ...((current.extra_breaks as { start: string; end: string }[] | null) ?? [])] : [];
  // 폰 카드와 PC 줄이 같은 조각을 쓴다
  const ruleForm = (
        <RuleForm
          tomorrow={addDays(today, 1)}
          weekdays={weekdays}
          initial={{
            startTime: base ? hhmm(base.start_time) : '09:00', endTime: base ? hhmm(base.end_time) : '18:00', lateGraceMin: base?.late_grace_min ?? 0,
            breakStart: base?.break_start ? hhmm(base.break_start) : '', breakEnd: base?.break_end ? hhmm(base.break_end) : '',
            break2Start: (base?.extra_breaks as { start: string; end: string }[] | null)?.[0]?.start ?? '', break2End: (base?.extra_breaks as { start: string; end: string }[] | null)?.[0]?.end ?? '', roundStepMin: base?.round_step_min ?? 0,
            workdays: (base?.workdays as number[] | undefined) ?? [1, 2, 3, 4, 5], weeklyRestDay: base?.weekly_rest_day ?? 7,
          }}
        />
  );
  const networkList = (
        <ul className="divide-y divide-border">
          {/* 검사 스크립트가 넣었다 끈 주소(메모가 e2e-…)는 목록에 보이지 않게 — 검사 계정·검사 그룹과 같은 규칙 */}
          {(networks ?? []).filter((n) => n.active || !n.label?.startsWith('e2e-')).map((n) => (
            <li key={n.id} className={`flex min-h-12 items-center gap-2 ${n.active ? '' : 'opacity-60'}`}>
              <span className="min-w-0 flex-1">
                <span className="num block truncate text-sm">{String(n.cidr)}</span>
                {n.label && <span className="block truncate text-xs text-muted">{n.label}</span>}
              </span>
              {!n.active && <Chip>{t('off')}</Chip>}
              {n.active ? (
                <ConfirmButton body={{ action: 'network.toggle', id: n.id, active: false }} label={t('turnOff')} confirmLabel={t('turnOffConfirm')} ariaLabel={t('turnOffOf', { what: String(n.cidr) })} />
              ) : (
                <ConfirmButton body={{ action: 'network.toggle', id: n.id, active: true }} label={t('turnOn')} confirmLabel={t('turnOn')} ariaLabel={t('turnOnOf', { what: String(n.cidr) })} />
              )}
            </li>
          ))}
          {OFFICE.allowedCidrs.map((c) => (
            <li key={c} className="flex min-h-12 items-center gap-2">
              <span className="num min-w-0 flex-1 truncate text-sm">{c}</span>
              <Chip>{t('fromEnv')}</Chip>
            </li>
          ))}
        </ul>
  );

  return (
    <PageShell wide>
      {/* PC · 폰 같은 내용 — 고른 탭의 줄만 보인다 (2026-10-18 의뢰인: 폰에서는 어느 탭을 눌러도 근무시간 · 휴일 · 인터넷 · 근무지 카드 넉 장만 보였다).
          설정 줄(components/settings)은 폰에서 세로로 쌓인다. 폰에서 옆으로 넘치는 표(공휴일 · 권한)만 폰용 목록을 따로 둔다 */}
      <div className="flex flex-col gap-3 lg:gap-4">
        <div className="flex flex-wrap items-start gap-3 lg:flex-nowrap lg:gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="flex flex-wrap items-center gap-x-1 text-2xl font-bold">{tf(`item.set${tab[0].toUpperCase()}${tab.slice(1)}`)}<HelpTip>{tp(tab === 'general' ? 'descGeneral' : tab === 'holidays' ? 'descHolidays' : tab === 'work' ? 'descWork' : tab === 'punch' ? 'descPunch' : tab === 'break' ? 'descBreak' : `desc_${tab}`)}</HelpTip></h1>
          </div>
          {(tab === 'work' || tab === 'punch' || tab === 'break') && ruleForm}
        </div>
        <SettingBox>
          {info &&
            info.map((r) => (
              <SettingRow
                key={r.k}
                label={ti(`${tab}.${r.k}.label`)}
                desc={
                  <>
                    {ti(`${tab}.${r.k}.note`)}
                    {r.href && (
                      <Link href={r.href} className="ml-2 font-bold whitespace-nowrap text-primary">
                        {tp('go')} ›
                      </Link>
                    )}
                  </>
                }
              >
                {isSwitchKey(`${tab}.${r.k}`) ? (
                  <>
                    {/* 스위치는 PC에서 바꾼다 (2026-10-19 의뢰인: PC에만 있어도 된다) · 폰은 지금 상태만 */}
                    <span className="hidden lg:inline-flex">
                      <SwitchToggle k={`${tab}.${r.k}`} on={sw[`${tab}.${r.k}` as keyof typeof sw]} label={ti(`${tab}.${r.k}.label`)} />
                    </span>
                    <span className="lg:hidden">
                      <UseMark on={sw[`${tab}.${r.k}` as keyof typeof sw]} label={tsw(sw[`${tab}.${r.k}` as keyof typeof sw] ? 'on' : 'off')} />
                    </span>
                  </>
                ) : (
                  <span className="inline-flex flex-col items-end gap-1">
                    <UseMark on={r.on} label={ti(`${tab}.${r.k}.value`)} />
                    <span className="text-xs text-faint" title={tsw('fixedWhy')}>{tsw('fixed')}</span>
                  </span>
                )}
              </SettingRow>
            ))}
          {tab === 'request' && (
            <SettingRow label={tsm('label')} desc={tsm('desc')}>
              <ScheduleModeForm mode={scheduleMode} />
            </SettingRow>
          )}
          {tab === 'general' && (
            <>
              {/* 회사 정보 (2026-10-18 의뢰인: 휴일 넣고 빼기보다 회사 정보가 먼저 — 휴일은 「휴일」 메뉴로 뺐다) */}
              <SettingGroup>{tco('title')}</SettingGroup>
              <CompanyForm initial={{ name: company.name || BRAND.name, ceo: company.ceo, bizNo: company.bizNo, address: company.address, phone: company.phone, policy: company.policy, hasLogo: !!company.logoPath, logoAt: company.logoAt }} />
              <SettingGroup>{tco('fixedTitle')}</SettingGroup>
              {(['country', 'unit', 'weekStart', 'timeFormat', 'holidayCountry', 'night'] as const).map((k) => (
                <SetRow key={k} side label={tco(`fixed.${k}`)}>
                  <p className="font-bold">{tco(`fixedValue.${k}`)}</p>
                </SetRow>
              ))}
              <p className="pb-4 text-xs text-faint">{tco('fixedNote')}</p>
            </>
          )}
          {tab === 'holidays' && (
            <>
              <SetRow label={tp('companyHolidays')}>
                <p className="text-muted">{t('holidayNote')}</p>
                {/* 폰: 다가오는 5개만 펼쳐 두고 나머지는 접는다 — 1년 치 25개가 화면을 길게 늘였다 (2026-10-17 디자인) */}
                <div className="lg:hidden">
                  {(() => {
                    const li = (h: { the_date: string; label: string; kind: string }) => (
                      <li key={h.the_date} className="flex min-h-12 items-center gap-2">
                        <span className="min-w-0 flex-1">
                          <span className="num block text-sm">{day(h.the_date)}</span>
                          <span className="block truncate text-xs text-muted">{h.label}</span>
                        </span>
                        {h.kind === 'company' && <Chip tone="info">{t('kind.company')}</Chip>}
                        <ConfirmButton body={{ action: 'holiday.remove', date: h.the_date }} label={t('remove')} confirmLabel={t('removeConfirm')} ariaLabel={t('removeOf', { what: `${h.the_date} ${h.label}` })} />
                      </li>
                    );
                    const all = holidays ?? [];
                    if (all.length === 0) return <p className="text-sm text-faint">{t('holidayNone')}</p>;
                    return (
                      <>
                        <ul className="divide-y divide-border">{all.slice(0, 5).map(li)}</ul>
                        {all.length > 5 && (
                          <details className="group border-t border-border">
                            <summary className="flex min-h-11 cursor-pointer items-center text-sm font-bold text-primary group-open:hidden">{t('holidayMore', { n: all.length - 5 })}</summary>
                            <ul className="divide-y divide-border">{all.slice(5).map(li)}</ul>
                          </details>
                        )}
                      </>
                    );
                  })()}
                </div>
                <table className="num hidden w-full max-w-3xl text-sm lg:table">
                  <thead>
                    <tr className="bg-surface">
                      <th scope="col" className="px-3 py-2 text-left">{tp('colDate')}</th>
                      <th scope="col" className="px-3 py-2 text-left">{tp('colName')}</th>
                      <th scope="col" className="px-3 py-2 text-left">{tp('colKind')}</th>
                      <th scope="col" className="w-32 px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {(holidays ?? []).length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-4 text-faint">{t('holidayNone')}</td>
                      </tr>
                    )}
                    {(holidays ?? []).map((h) => (
                      <tr key={h.the_date} className="border-t border-border">
                        <td className="px-3 py-1">{day(h.the_date)}</td>
                        <td className="px-3 py-1">{h.label}</td>
                        <td className="px-3 py-1 text-muted">{t(h.kind === 'company' ? 'kind.company' : 'kind.public')}</td>
                        <td className="px-3 py-1 text-right">
                          <ConfirmButton body={{ action: 'holiday.remove', date: h.the_date }} label={t('remove')} confirmLabel={t('removeConfirm')} ariaLabel={t('removeOf', { what: `${h.the_date} ${h.label}` })} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <HolidayForm monthStart={monthStart} />
              </SetRow>
            </>
          )}
          {tab === 'work' && (
            <>
              {!current && <p className="m-4 rounded-button bg-warn-tint p-3 text-sm text-warn">{t('ruleNone')}</p>}
              {current && (
                <>
                  <SetRow label={tp('applied')}>
                    <p className="font-bold">{t('since', { date: day(current.effective_from) })}</p>
                    <p className="text-muted">{t('ruleAddHint')}</p>
                  </SetRow>
                  <SetRow side label={tp('workHours')}>
                    <p className="num font-bold">{hhmm(current.start_time)} ~ {hhmm(current.end_time)}</p>
                  </SetRow>
                  <SetRow side label={t('workdays')}>
                    <p className="font-bold">{(current.workdays as number[]).map((d) => weekdays[d - 1]).join(' · ')}</p>
                  </SetRow>
                  <SetRow side label={t('restDay')}>
                    <p className="font-bold">{weekdays[current.weekly_rest_day - 1]}</p>
                  </SetRow>
                  <SetRow side label={t('graceShort')}>
                    <p className="num font-bold">{t('minutes', { n: current.late_grace_min })}</p>
                  </SetRow>
                </>
              )}
              <SetRow label={tp('deemed')}>
                <UseMark on label={tp('use')} />
                <p className="text-muted">{tp('deemedNote')}</p>
              </SetRow>
              <SettingGroup>{tp('upcomingBand')}</SettingGroup>
              {upcoming.length === 0 && <p className="pb-5 text-sm text-faint">{tp('noRuleChange')}</p>}
              {upcoming.map((r) => (
                <SetRow key={r.id} label={t('upcoming', { date: day(r.effective_from) })}>
                  {ruleLine(r)}
                  <span className="self-start">
                    <ConfirmButton body={{ action: 'rule.hide', id: r.id }} label={t('ruleHide')} confirmLabel={t('ruleHideConfirm')} ariaLabel={t('ruleHideOf', { date: r.effective_from })} />
                  </span>
                </SetRow>
              ))}
            </>
          )}
          {tab === 'punch' && (
            <>
              <SettingGroup>{tp('bandPunch')}</SettingGroup>
              <SetRow label={tp('pcPunch')}>
                <UseMark on={false} label={tp('notUse')} />
                <p className="text-muted">{tp('pcPunchNote')}</p>
              </SetRow>
              <SettingGroup>{tp('bandRound')}</SettingGroup>
              <SetRow side label={tp('roundIn')}>
                <p className="num font-bold">{current?.round_step_min ? tp('roundInValue', { n: current.round_step_min }) : tp('roundNone')}</p>
              </SetRow>
              <SetRow label={tp('roundOut')}>
                <p className="num font-bold">{current?.round_step_min ? tp('roundOutValue', { n: current.round_step_min }) : tp('roundNone')}</p>
                <p className="text-muted">{t('roundHint')}</p>
              </SetRow>
              <SettingGroup>{tp('bandPlace')}</SettingGroup>
              <SetRow label={t('networkTitle')}>
                <p className={`font-bold ${here ? 'text-ok' : 'text-warn'}`}>{trace.ip ? t(here ? 'hereYes' : 'hereNo', { ip: trace.ip }) : t('hereUnknown')}</p>
                <p className="text-muted">{t('networkNote')}</p>
                <div className="max-w-3xl">{networkList}</div>
                <NetworkForm currentIp={trace.ip} currentKnown={here} />
              </SetRow>
              <SetRow label={t('locationTitle')}>
                <UseMark on={locations.some((l) => l.active)} label={t('placesCount', { n: locations.filter((l) => l.active).length })} />
                <p className="text-muted">{t(locations.some((l) => l.active) ? 'gpsOn' : 'gpsOff')}</p>
                <Link href="/admin/places" className="inline-flex min-h-8 items-center self-start font-bold text-primary">
                  {t('placesLink')} ›
                </Link>
              </SetRow>
            </>
          )}
          {tab === 'break' && (
            <>
              <SetRow label={tp('autoBreak')}>
                <UseMark on={breaks.length > 0} label={breaks.length > 0 ? tp('byClock') : tp('notUse')} />
                {breaks.length === 0 ? (
                  <p className="text-faint">{tp('breakNone')}</p>
                ) : (
                  <table className="num w-full max-w-xl text-sm">
                    <thead>
                      <tr className="bg-surface">
                        <th scope="col" className="px-3 py-2 text-left">{tp('colBreakStart')}</th>
                        <th scope="col" className="px-3 py-2 text-left">{tp('colBreakEnd')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {breaks.map((b) => (
                        <tr key={b.start} className="border-t border-border">
                          <td className="px-3 py-2">{b.start}</td>
                          <td className="px-3 py-2">{b.end}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <p className="text-muted">{tp('breakNote')}</p>
              </SetRow>
              <SetRow label={tp('manualBreak')}>
                <UseMark on={false} label={tp('notUse')} />
                <p className="text-muted">{tp('manualBreakNote')}</p>
              </SetRow>
            </>
          )}
        </SettingBox>
        {access && (
          <SettingBox className="pb-4">
            <SettingGroup>{ta('title')}</SettingGroup>
            <p className="pb-3 text-sm text-muted">{ta('desc', { n: access.staff })}</p>
            {/* 폰: 사람마다 한 줄 묶음 (표는 열이 6개라 옆으로 넘친다) */}
            <ul className="divide-y divide-border lg:hidden">
              {access.rows.length === 0 && <li className="py-6 text-center text-sm text-faint">{ta('none')}</li>}
              {access.rows.map((r) => (
                <li key={r.id} className="flex flex-col gap-1.5 py-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 font-semibold">
                      {r.name}
                      {r.no && <span className="num pl-2 text-xs font-normal text-faint">{r.no}</span>}
                    </span>
                    {r.role !== 'employee' && <Chip tone={r.role === 'admin' ? 'info' : 'neutral'}>{r.role === 'admin' ? (r.level === 'system' ? ta('levelSystem') : memberText(r.level === 'ceo' ? 'levelCeo' : 'levelSuper')) : ts('roleManager')}</Chip>}
                  </div>
                  <p className="text-muted">
                    {ta('colScope')}: {r.role === 'manager' ? r.scope.join(' · ') || ta('scopeNone') : r.role === 'admin' ? ta('scopeAll') : '–'}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {r.pay && <UseMark on label={ta('payYes')} />}
                    {r.role === 'admin' && (r.pin ? <UseMark on label={ta('pinSet')} /> : <UseMark on={false} label={ta('pinNone')} />)}
                    {r.role === 'admin' && r.pin && r.id !== access.meId && <PinReset employeeId={r.id} name={r.name} />}
                    <Link href={`/admin/members/${r.id}`} className="ml-auto inline-flex min-h-11 items-center font-bold text-primary">{ta('change')} ›</Link>
                  </div>
                </li>
              ))}
            </ul>
            <table className="hidden w-full text-sm lg:table">
              <thead>
                <tr>
                  {[ta('colName'), ta('colRole'), ta('colPayroll'), ta('colScope'), ta('colPin'), ''].map((h, i) => (
                    <th key={i} scope="col" className="px-3 py-2 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {access.rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-faint">{ta('none')}</td>
                  </tr>
                )}
                {access.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-3 font-semibold">
                      {r.name}
                      {r.no && <span className="num pl-2 text-xs font-normal text-faint">{r.no}</span>}
                    </td>
                    <td className="px-3 py-3">
                      {r.role === 'employee' ? <span className="text-faint">{ts('roleEmployee')}</span> : <Chip tone={r.role === 'admin' ? 'info' : 'neutral'}>{r.role === 'admin' ? (r.level === 'system' ? ta('levelSystem') : memberText(r.level === 'ceo' ? 'levelCeo' : 'levelSuper')) : ts('roleManager')}</Chip>}
                    </td>
                    <td className="px-3 py-3">{r.pay ? <UseMark on label={ta('payYes')} /> : <span className="text-faint">–</span>}</td>
                    <td className="px-3 py-3 text-muted">{r.role === 'manager' ? r.scope.join(' · ') || ta('scopeNone') : r.role === 'admin' ? ta('scopeAll') : '–'}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {r.role !== 'admin' ? <span className="text-faint">–</span> : r.pin ? (
                        <span className="inline-flex items-center gap-2">
                          <UseMark on label={ta('pinSet')} />
                          {r.id !== access.meId && <PinReset employeeId={r.id} name={r.name} />}
                        </span>
                      ) : (
                        <UseMark on={false} label={ta('pinNone')} />
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Link href={`/admin/members/${r.id}`} className="font-bold whitespace-nowrap text-primary">{ta('change')} ›</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="pt-3 text-sm text-faint">{ta('how')}</p>
          </SettingBox>
        )}
      </div>

      {/* 진단 — 사무실 확인이 이상할 때만 보는 화면이라 메뉴에서 빼고 여기에 둔다 (2026-10-06) */}
      <Link href="/admin/diag" className="inline-flex min-h-11 items-center self-start px-1 text-sm text-muted">
        {tm('diag')} · {tm('diagHint')} ›
      </Link>
    </PageShell>
  );
}
