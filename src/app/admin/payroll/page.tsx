// ⑤ 급여 탭 (2026-10-02 의뢰인: 관리자 하단 메뉴에 급여). 최고관리자(관리자 전원)만 — 2026-10-16 권한-10, 급여 담당 구분 없앰.
// 지금: 이 달 직원별 근무·연장·야간·휴일 요약 + 급여 계산용 파일. 명세서 계산(③ 급여 문서)은 이 화면에 이어 붙인다.
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Help } from '@/components/Help';
import { QuickFind } from '@/components/QuickFind';
import { Card, Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { getMe } from '@/lib/auth';
import { buildMonth, isYearMonth, monthRange } from '@/lib/month-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';
import { NOT_SYSTEM_ADMIN } from '@/lib/system-admin'; // 시스템관리자는 목록에 보이지 않는다 (2026-10-18)

function shift(ym: string, n: number) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ m?: string; live?: string }> }) {
  const t = await getTranslations('admin.payroll');
  const tr = await getTranslations('admin.records');
  const tn = await getTranslations('side');
  const tc = await getTranslations('common');
  const me = (await getMe())!;
  const sp = await searchParams;
  const ym = isYearMonth(sp.m) ? sp.m : toKstDate(new Date()).slice(0, 7);
  // 연습 모드에서는 연습 기록이 기본 (관리자 홈·요청·기록과 같은 기준)
  const practice = OFFICE.practiceMode && sp.live !== '1';
  const q = (m: string) => `?m=${m}${OFFICE.practiceMode && !practice ? '&live=1' : ''}`;
  const today = toKstDate(new Date());
  const lastDay = monthRange(ym).to;
  const monthEnd = lastDay < today ? lastDay : today;
  const hm = (min: number) => tr('hm', { h: Math.floor(min / 60), m: String(min % 60).padStart(2, '0') });
  const hmOrDash = (min: number) => (min > 0 ? hm(min) : <span className="text-faint">–</span>); // 0은 흐린 줄표 — 값이 있는 칸이 눈에 띄게 (2026-10-26)

  if (!me.canViewPayroll) {
    // 누가 급여 담당인지 알려 준다 (2026-10-06 의뢰인: 급여 담당이 있다는데 왜 못 보는지 알 수 없었다)
    const { data: viewers } = await createAdminClient().from('profiles').select('name').or(NOT_SYSTEM_ADMIN).eq('active', true).eq('role', 'admin').eq('can_view_payroll', true).order('name');
    const names = (viewers ?? []).map((v) => v.name).join(', ') || t('noAccessNone');
    return (
      <PageShell>
        <h1 className="px-1 pt-2 text-2xl font-extrabold tracking-tight">{t('title')}</h1>
        <Card className="flex flex-col gap-3">
          <p className="text-muted">{t('noAccess', { names })}</p>
          <Link href="/admin/members" className="inline-flex min-h-11 items-center self-start rounded-button bg-primary-tint px-4 text-sm font-bold text-primary">
            {tn('members')} ›
          </Link>
        </Card>
      </PageShell>
    );
  }
  // 확정한 기록만 급여 계산에 쓴다 (의뢰인 2026-10-11) — 미확정 기록이 있으면 위에 알린다
  const { rows } = await buildMonth(ym, practice, { confirmedOnly: true, sync: true });
  const unconfirmed = rows.reduce((a, r) => a + r.summary.unconfirmedDates.length, 0);

  // 이 달 합계 (숫자 칸) — 표와 같은 값의 합
  const sum = (pick: (r: (typeof rows)[number]) => number) => rows.reduce((a, r) => a + pick(r), 0);
  const holidayOf = (r: (typeof rows)[number]) => Number(r.summary.row.approved_holiday_within8_minutes) + Number(r.summary.row.approved_holiday_over8_minutes);
  const nightOf = (r: (typeof rows)[number]) => Number(r.summary.row.approved_night_minutes);
  const overtimeOf = (r: (typeof rows)[number]) => Number(r.summary.row.approved_overtime_minutes);
  // 급여에 영향을 주는 날 수 · 횟수 — 결근 · 무급휴가는 공제, 지각은 참고 (2026-10-26 의뢰인: 시간 4가지만으로는 부족)
  const absentOf = (r: (typeof rows)[number]) => Number(r.summary.row.absent_days ?? 0);
  const unpaidOf = (r: (typeof rows)[number]) => Number(r.summary.row.unpaid_leave_days ?? 0);
  const lateOf = (r: (typeof rows)[number]) => Number(r.summary.row.late_count ?? 0);
  const totals = [
    ['worked', sum((r) => r.summary.netMinutes)],
    ['overtime', sum(overtimeOf)],
    ['night', sum(nightOf)],
    ['holiday', sum(holidayOf)],
  ] as const;
  // 확정하지 않은 기록이 있는 직원을 맨 위로
  const ordered = [...rows].sort((a, b) => Number(b.summary.unconfirmedDates.length > 0) - Number(a.summary.unconfirmedDates.length > 0));
  const days = (n: number) => (n > 0 ? t('unitDays', { n }) : <span className="text-faint">–</span>);
  const times = (n: number) => (n > 0 ? t('unitTimes', { n }) : <span className="text-faint">–</span>);

  return (
    <PageShell wide>
      {/* 제목·달 고르기·내려받기를 한 줄에 — 가장 자주 쓰는 내려받기는 색을 채운 버튼 하나 (2026-10-06 의뢰인: 화면이 밋밋하고 흩어져 있었다) */}
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1 pt-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-1">
          <h1 className="text-2xl font-extrabold tracking-tight">{t('title')}</h1>
          <Help>{t('building')}</Help>
          <p className="basis-full text-sm text-muted">{t('subtitle')}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <nav className="flex items-center rounded-button bg-bg" aria-label={tr('month')}>
            <Link href={q(shift(ym, -1))} aria-label={tr('prev')} className="flex size-11 items-center justify-center text-primary">
              <ChevronLeft aria-hidden size={22} strokeWidth={2} />
            </Link>
            <span className="num px-1 text-lg font-bold">{ym}</span>
            <Link href={q(shift(ym, 1))} aria-label={tr('next')} className="flex size-11 items-center justify-center text-primary">
              <ChevronRight aria-hidden size={22} strokeWidth={2} />
            </Link>
          </nav>
          {/* 내려받기: 폰은 달 옆의 아이콘 버튼(목록 맨 아래까지 내리지 않게, 2026-10-17 디자인) · PC는 글자 버튼 */}
          <a href={`/api/admin/export/payroll${q(ym)}`} aria-label={t('download')} title={t('download')} className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-button bg-primary text-sm font-bold text-on-primary lg:h-9 lg:min-h-0 lg:gap-1.5 lg:px-3.5 lg:font-semibold">
            <Download aria-hidden size={16} />
            <span className="hidden lg:inline">{t('download')}</span>
          </a>
        </div>
      </header>
      {/* 연습 · 실제 기록 바꾸기 — 근태 월 집계와 같은 링크 (2026-10-16: 실제 기록을 옮긴 뒤 이 화면에서는 실제 쪽으로 갈 길이 없었다) */}
      {OFFICE.practiceMode && (
        <p className={`flex flex-wrap items-center gap-x-3 text-sm text-primary ${practice ? 'rounded-card bg-primary-tint p-3' : '-my-2'}`}>
          {practice && <span className="min-w-0 flex-1">{tr('practiceBanner')}</span>}
          <Link href={practice ? `?m=${ym}&live=1` : `?m=${ym}`} className="ml-auto inline-flex min-h-9 items-center font-bold underline">
            {practice ? tr('showLive') : tr('showPractice')}
          </Link>
        </p>
      )}
      {unconfirmed > 0 ? (
        <p className="rounded-card border border-warn bg-warn-tint p-3 text-sm text-warn">
          {t('unconfirmed', { n: unconfirmed })}{' '}
          <Link href={`/admin/records/list?from=${ym}-01&to=${monthEnd}`} className="font-bold underline">
            {t('toConfirm')} ›
          </Link>
        </p>
      ) : null}

      <p className="flex flex-wrap items-baseline gap-x-5 gap-y-1 px-1 text-sm text-muted">
        <b className="text-base text-text">{t('peopleN', { n: rows.length })}</b>
        {totals.map(([k, v]) => (
          <span key={k}>
            {t(k)} <b className="num text-base text-text">{hmOrDash(v)}</b>
          </span>
        ))}
      </p>

      {rows.length === 0 && <p className="rounded-card border border-border bg-bg px-5 py-4 text-sm text-faint">{t('empty')}</p>}
      {/* PC: 직원 한 명 = 표 한 줄 */}
      {rows.length > 0 && (
        <Card className="hidden overflow-x-auto p-0 lg:block">
          <table className="num w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {[t('staff'), t('worked'), t('overtime'), t('night'), t('holiday'), t('absent'), t('unpaid'), t('late')].map((x, i) => (
                  <th key={x} scope="col" className={`px-5 py-3 text-xs font-medium whitespace-nowrap text-faint ${i === 0 ? 'text-left' : 'text-right'} ${i === 5 ? 'border-l border-border' : ''}`}>{x}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ordered.map((x) => (
                <tr key={x.person.id}>
                  <td className="px-5 py-3 text-left font-semibold">
                    {x.person.name}
                    {x.summary.unconfirmedDates.length > 0 && (
                      <Link href={`/admin/records/list?from=${ym}-01&to=${monthEnd}&q=${encodeURIComponent(x.person.name)}`} className="ml-2 align-middle"><Chip tone="warn">{t('unconfirmedOf', { n: x.summary.unconfirmedDates.length })}</Chip></Link>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right font-bold">{hmOrDash(x.summary.netMinutes)}</td>
                  <td className="px-5 py-3 text-right">{hmOrDash(overtimeOf(x))}</td>
                  <td className="px-5 py-3 text-right">{hmOrDash(nightOf(x))}</td>
                  <td className="px-5 py-3 text-right">{hmOrDash(holidayOf(x))}</td>
                  <td className="px-5 py-3 text-right border-l border-border">{days(absentOf(x))}</td>
                  <td className="px-5 py-3 text-right">{days(unpaidOf(x))}</td>
                  <td className="px-5 py-3 text-right">{times(lateOf(x))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {/* 폰: 직원별 줄 */}
      {rows.length > 0 && (
        <div className="flex flex-col gap-2 lg:hidden">
          {rows.length > 6 && <QuickFind target="pay-hours" placeholder={tc('findName')} clearLabel={tc('clear')} emptyText={t('empty')} />}
          {/* 폰: 한 사람 한 줄 — 「근무」는 머리에 한 번, 연장 · 야간 · 휴일은 0이 아닌 것만 (2026-10-17 디자인: 0:00이 줄마다 세 번씩 반복됐다) */}
          <Card className="p-0 py-1">
            <p className="flex justify-between px-5 pt-2 pb-1 text-xs text-faint">
              <span>{t('staff')}</span>
              <span>{t('worked')}</span>
            </p>
            <ul id="pay-hours" className="divide-y divide-border">
              {ordered.map(({ person, summary: s }) => {
                const r = s.row;
                const extra = [
                  [t('overtime'), Number(r.approved_overtime_minutes)],
                  [t('night'), Number(r.approved_night_minutes)],
                  [t('holiday'), Number(r.approved_holiday_within8_minutes) + Number(r.approved_holiday_over8_minutes)],
                ].filter(([, v]) => Number(v) > 0).map(([k, v]) => `${k} ${hm(Number(v))}`).concat(
                  [[t('absent'), t('unitDays', { n: Number(r.absent_days ?? 0) }), Number(r.absent_days ?? 0)], [t('unpaid'), t('unitDays', { n: Number(r.unpaid_leave_days ?? 0) }), Number(r.unpaid_leave_days ?? 0)], [t('late'), t('unitTimes', { n: Number(r.late_count ?? 0) }), Number(r.late_count ?? 0)]].filter((x) => Number(x[2]) > 0).map((x) => `${x[0]} ${x[1]}`),
                ).join(' · ');
                return (
                  <li key={person.id} data-find={person.name} className="flex min-h-12 items-center gap-3 px-5 py-1.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{person.name}</span>
                      {extra && <span className="num block truncate text-xs text-faint">{extra}</span>}
                    </span>
                    <span className="num shrink-0 font-bold">{hm(s.netMinutes)}</span>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      )}

    </PageShell>
  );
}
