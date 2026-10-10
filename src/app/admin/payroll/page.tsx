// ⑤ 급여 탭 (2026-10-02 의뢰인: 관리자 하단 메뉴에 급여). 급여 담당자(can_view_payroll)만 (부록 R-2의 7).
// 지금: 이 달 직원별 근무·연장·야간·휴일 요약 + 급여 계산용 파일. 명세서 계산(③ 급여 문서)은 이 화면에 이어 붙인다.
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Help } from '@/components/Help';
import { Card, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { getMe } from '@/lib/auth';
import { buildMonth, isYearMonth, monthRange } from '@/lib/month-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';

function shift(ym: string, n: number) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ m?: string; live?: string }> }) {
  const t = await getTranslations('admin.payroll');
  const tr = await getTranslations('admin.records');
  const tn = await getTranslations('side');
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

  if (!me.canViewPayroll) {
    // 누가 급여 담당인지 알려 준다 (2026-10-06 의뢰인: 급여 담당이 있다는데 왜 못 보는지 알 수 없었다)
    const { data: viewers } = await createAdminClient().from('profiles').select('name').eq('active', true).eq('role', 'admin').eq('can_view_payroll', true).order('name');
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
  const { rows } = await buildMonth(ym, practice, { confirmedOnly: true });
  const unconfirmed = rows.reduce((a, r) => a + r.summary.unconfirmedDates.length, 0);

  // 이 달 합계 (숫자 칸) — 표와 같은 값의 합
  const sum = (pick: (r: (typeof rows)[number]) => number) => rows.reduce((a, r) => a + pick(r), 0);
  const holidayOf = (r: (typeof rows)[number]) => Number(r.summary.row.approved_holiday_within8_minutes) + Number(r.summary.row.approved_holiday_over8_minutes);
  const tiles = [
    { k: 'people', v: t('peopleN', { n: rows.length }) },
    { k: 'totalWorked', v: hm(sum((r) => r.summary.netMinutes)) },
    { k: 'totalOvertime', v: hm(sum((r) => Number(r.summary.row.approved_overtime_minutes))) },
    { k: 'totalNightHoliday', v: hm(sum((r) => Number(r.summary.row.approved_night_minutes) + holidayOf(r))) },
  ] as const;

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
          <a href={`/api/admin/export/payroll${q(ym)}`} className="hidden min-h-11 items-center gap-2 rounded-button bg-primary px-4 text-sm font-bold text-on-primary lg:inline-flex">
            <Download aria-hidden size={18} strokeWidth={2} />
            {t('download')}
          </a>
        </div>
      </header>
      {practice && <p className="rounded-card bg-primary-tint p-3 text-sm text-primary">{tr('practiceBanner')}</p>}
      {unconfirmed > 0 ? (
        <p className="rounded-card border border-warn bg-warn-tint p-3 text-sm text-warn">
          {t('unconfirmed', { n: unconfirmed })}{' '}
          <Link href={`/admin/records/list?from=${ym}-01&to=${monthEnd}`} className="font-bold underline">
            {t('toConfirm')} ›
          </Link>
        </p>
      ) : (
        <p className="px-1 text-sm text-muted">{t('confirmedOnly')}</p>
      )}

      <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-4">
        {tiles.map((x) => (
          <div key={x.k} className="flex flex-col gap-2 rounded-card bg-bg p-4 lg:p-5">
            <dt className="text-sm text-muted">{t(x.k)}</dt>
            <dd className="num text-2xl leading-none font-extrabold lg:text-3xl">{x.v}</dd>
          </div>
        ))}
      </dl>

      {rows.length === 0 && <p className="rounded-card bg-bg px-5 py-4 text-sm text-faint">{t('empty')}</p>}
      {/* PC: 직원 한 명 = 표 한 줄 */}
      {rows.length > 0 && (
        <Card className="hidden overflow-x-auto p-0 lg:block">
          <table className="num w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {[t('staff'), t('worked'), t('overtime'), t('night'), t('holiday')].map((x, i) => (
                  <th key={x} scope="col" className={`px-5 py-3 text-xs font-medium whitespace-nowrap text-faint ${i === 0 ? 'text-left' : 'text-right'}`}>{x}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((x) => (
                <tr key={x.person.id}>
                  <td className="px-5 py-3 text-left font-semibold">{x.person.name}</td>
                  <td className="px-5 py-3 text-right font-bold">{hm(x.summary.netMinutes)}</td>
                  <td className="px-5 py-3 text-right">{hm(Number(x.summary.row.approved_overtime_minutes))}</td>
                  <td className="px-5 py-3 text-right">{hm(Number(x.summary.row.approved_night_minutes))}</td>
                  <td className="px-5 py-3 text-right">{hm(holidayOf(x))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {/* 폰: 직원별 줄 */}
      {rows.length > 0 && (
        <Card className="p-0 py-1 lg:hidden">
          <ul className="divide-y divide-border">
            {rows.map(({ person, summary: s }) => {
              const r = s.row;
              return (
                <li key={person.id} className="flex min-h-14 items-center gap-3 px-5 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{person.name}</span>
                    <span className="num block text-xs text-faint">
                      {t('overtime')} {hm(Number(r.approved_overtime_minutes))} · {t('night')} {hm(Number(r.approved_night_minutes))} · {t('holiday')}{' '}
                      {hm(Number(r.approved_holiday_within8_minutes) + Number(r.approved_holiday_over8_minutes))}
                    </span>
                  </span>
                  <span className="num shrink-0 text-right">
                    <span className="block text-xs text-muted">{t('worked')}</span>
                    <span className="font-bold">{hm(s.netMinutes)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <a href={`/api/admin/export/payroll${q(ym)}`} className="flex min-h-12 items-center justify-center gap-2 rounded-button bg-primary font-bold text-on-primary lg:hidden">
        <Download aria-hidden size={18} strokeWidth={2} />
        {t('download')}
      </a>
    </PageShell>
  );
}
