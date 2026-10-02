// ⑤ 급여 탭 (2026-10-02 의뢰인: 관리자 하단 메뉴에 급여). 급여 담당자(can_view_payroll)만 (부록 R-2의 7).
// 지금: 이 달 직원별 근무·연장·야간·휴일 요약 + 급여 계산용 파일. 명세서 계산(③ 급여 문서)은 이 화면에 이어 붙인다.
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Card, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { getMe } from '@/lib/auth';
import { buildMonth, isYearMonth } from '@/lib/month-data';
import { toKstDate } from '@/lib/time';

function shift(ym: string, n: number) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ m?: string; live?: string }> }) {
  const t = await getTranslations('admin.payroll');
  const tr = await getTranslations('admin.records');
  const me = (await getMe())!;
  const sp = await searchParams;
  const ym = isYearMonth(sp.m) ? sp.m : toKstDate(new Date()).slice(0, 7);
  // 연습 모드에서는 연습 기록이 기본 (관리자 홈·요청·기록과 같은 기준)
  const practice = OFFICE.practiceMode && sp.live !== '1';
  const q = (m: string) => `?m=${m}${OFFICE.practiceMode && !practice ? '&live=1' : ''}`;
  const hm = (min: number) => tr('hm', { h: Math.floor(min / 60), m: String(min % 60).padStart(2, '0') });

  if (!me.canViewPayroll) {
    return (
      <PageShell>
        <h1 className="px-1 pt-2 text-2xl font-extrabold tracking-tight">{t('title')}</h1>
        <Card>
          <p className="text-muted">{t('noAccess')}</p>
        </Card>
      </PageShell>
    );
  }
  const { rows } = await buildMonth(ym, practice);

  return (
    <PageShell>
      <header className="flex items-center justify-between gap-2 px-1 pt-2">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted">{t('subtitle')}</p>
        </div>
        <nav className="flex shrink-0 items-center" aria-label={tr('month')}>
          <Link href={q(shift(ym, -1))} aria-label={tr('prev')} className="flex size-11 items-center justify-center text-primary">
            <ChevronLeft aria-hidden size={22} strokeWidth={2} />
          </Link>
          <span className="num text-lg font-bold">{ym}</span>
          <Link href={q(shift(ym, 1))} aria-label={tr('next')} className="flex size-11 items-center justify-center text-primary">
            <ChevronRight aria-hidden size={22} strokeWidth={2} />
          </Link>
        </nav>
      </header>
      {practice && <p className="rounded-card bg-primary-tint p-3 text-sm text-primary">{tr('practiceBanner')}</p>}
      <p className="rounded-card bg-bg p-4 text-sm text-muted">{t('building')}</p>

      <Card className="p-0 py-1">
        {rows.length === 0 && <p className="px-5 py-4 text-sm text-faint">{t('empty')}</p>}
        <ul>
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

      <a href={`/api/admin/export/payroll${q(ym)}`} className="flex min-h-12 items-center justify-center gap-2 rounded-button bg-primary-tint font-bold text-primary">
        <Download aria-hidden size={18} strokeWidth={2} />
        {t('download')}
      </a>
    </PageShell>
  );
}
