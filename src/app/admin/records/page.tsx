// ③ 기록 — 월간 집계 + 내려받기 모음 (마스터 5장, ①-4 7-10, 부록 R-10-5·R-10-6).
// 네 묶음 이름 통일: 실제 · 인정 · 보류 · 미검토. 폰(<768px)은 카드, 넓은 화면만 표 — 표는 자기 상자 안에서만 가로 스크롤.
// 색은 예외에만(지각·미기록·미승인) + 글자/아이콘을 함께.
import { ChevronLeft, ChevronRight, Download, ShieldAlert } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Card, Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { getMe } from '@/lib/auth';
import { FLAG } from '@/lib/flags';
import { buildMonth, isYearMonth } from '@/lib/month-data';
import { toKstDate } from '@/lib/time';

function shift(ym: string, n: number) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export default async function RecordsPage({ searchParams }: { searchParams: Promise<{ m?: string; practice?: string }> }) {
  const t = await getTranslations('admin.records');
  const me = (await getMe())!;
  const sp = await searchParams;
  const ym = isYearMonth(sp.m) ? sp.m : toKstDate(new Date()).slice(0, 7);
  const practice = OFFICE.practiceMode && sp.practice === '1';
  const q = (m: string) => `?m=${m}${practice ? '&practice=1' : ''}`;
  const { data, rows } = await buildMonth(ym, practice);
  const hm = (min: number) => t('hm', { h: Math.floor(min / 60), m: String(min % 60).padStart(2, '0') });

  return (
    <PageShell wide>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-primary-deep">{t('title')}</h1>
        <nav className="flex items-center gap-1" aria-label={t('month')}>
          <Link href={q(shift(ym, -1))} className="flex min-h-11 min-w-11 items-center justify-center" aria-label={t('prev')}>
            <ChevronLeft aria-hidden size={22} strokeWidth={1.75} />
          </Link>
          <span className="num text-xl font-semibold">{ym}</span>
          <Link href={q(shift(ym, 1))} className="flex min-h-11 min-w-11 items-center justify-center" aria-label={t('next')}>
            <ChevronRight aria-hidden size={22} strokeWidth={1.75} />
          </Link>
        </nav>
      </header>
      {OFFICE.practiceMode && (
        <Link href={practice ? `?m=${ym}` : `?m=${ym}&practice=1`} className="inline-flex min-h-11 items-center self-start text-sm text-primary">
          {practice ? t('showLive') : t('showPractice')}
        </Link>
      )}
      {practice && <p className="rounded-card bg-primary-tint p-3 text-sm text-primary">{t('practiceBanner')}</p>}
      {!data.rule && <p className="rounded-card bg-warn-tint p-3 text-sm text-warn">{t('noRule')}</p>}
      {data.rule && rows.length === 0 && <p className="text-muted">{t('empty')}</p>}

      {/* 폰: 직원 한 명 = 카드 한 장 */}
      <ul className="flex flex-col gap-3 md:hidden">
        {rows.map(({ person, summary: s }) => {
          const r = s.row;
          const blocks = String(r.flags).split(';').filter((f) => f.startsWith('block:') && f !== FLAG.LEAVE_MODULE_MISSING);
          return (
            <li key={person.id}>
              <Card className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between">
                  <span className="font-semibold">{person.name}</span>
                  <span className="num text-sm text-muted">{t('worked', { t: hm(s.netMinutes) })}</span>
                </div>
                <dl className="num grid grid-cols-4 gap-1 text-center text-xs">
                  {(['actual', 'approved', 'pending', 'unreviewed'] as const).map((k) => (
                    <div key={k} className="rounded-button bg-surface p-1">
                      <dt className="text-muted">{t(k)}</dt>
                      <dd className="text-base font-semibold">
                        {k === 'actual' ? hm(Number(r.overtime_minutes)) : k === 'approved' ? hm(Number(r.approved_overtime_minutes)) : k === 'pending' ? hm(Number(r.pending_overtime_minutes)) : hm(Number(r.unreviewed_overtime_minutes))}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="num text-xs text-muted">{t('overtimeRow')}</p>
                <div className="num flex flex-wrap gap-2 text-sm">
                  <span>{t('night', { t: hm(Number(r.night_minutes)) })}</span>
                  <span>{t('holiday', { t: hm(Number(r.holiday_within8_minutes) + Number(r.holiday_over8_minutes)) })}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {Number(r.late_count) > 0 && <Chip tone="warn">{t('late', { n: Number(r.late_count), m: Number(r.late_minutes) })}</Chip>}
                  {Number(r.absent_days) > 0 && <Chip tone="warn">{t('absent', { n: Number(r.absent_days) })}</Chip>}
                  {blocks.map((b) => <Chip key={b} tone="warn">{b.slice(6)}</Chip>)}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>

      {/* 넓은 화면: 표 — 자기 상자 안에서만 가로 스크롤 (5장) */}
      {rows.length > 0 && (
        <div className="hidden overflow-x-auto rounded-card border border-border md:block">
          <table className="num w-full table-fixed text-sm">
            <thead className="bg-surface text-xs text-muted">
              <tr>
                {(['name', 'workedCol', 'actual', 'approved', 'pending', 'unreviewed', 'nightCol', 'holidayCol', 'lateCol', 'absentCol'] as const).map((k) => (
                  <th key={k} className="px-2 py-2 text-right leading-tight break-words first:w-1/5 first:text-left">{t(k)}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map(({ person, summary: s }) => {
                const r = s.row;
                return (
                  <tr key={person.id}>
                    <td className="truncate px-2 py-2 text-left font-semibold">{person.name}</td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">{hm(s.netMinutes)}</td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">{hm(Number(r.overtime_minutes))}</td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">{hm(Number(r.approved_overtime_minutes))}</td>
                    <td className={`px-2 py-2 text-right whitespace-nowrap ${Number(r.pending_overtime_minutes) > 0 ? 'text-warn' : ''}`}>{hm(Number(r.pending_overtime_minutes))}</td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">{hm(Number(r.unreviewed_overtime_minutes))}</td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">{hm(Number(r.night_minutes))}</td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">{hm(Number(r.holiday_within8_minutes) + Number(r.holiday_over8_minutes))}</td>
                    <td className={`px-2 py-2 text-right whitespace-nowrap ${Number(r.late_count) > 0 ? 'text-warn' : ''}`}>{r.late_count}</td>
                    <td className={`px-2 py-2 text-right whitespace-nowrap ${Number(r.absent_days) > 0 ? 'text-warn' : ''}`}>{r.absent_days}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-faint">{t('leaveNote')}</p>

      {/* 내려받기 모음 (R-10-6): 한 카드 = 기간 + 형식 + 버튼 */}
      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">{t('downloads')}</h2>
        <p className="flex gap-2 text-sm text-warn">
          <ShieldAlert aria-hidden size={18} strokeWidth={1.75} className="shrink-0" />
          {t('privacyWarning')}
        </p>
        <Card className="flex items-center justify-between gap-2">
          <div>
            <p className="font-semibold">{t('attendanceCsv')}</p>
            <p className="num text-sm text-muted">{ym} · CSV</p>
          </div>
          <a href={`/api/admin/export/attendance${q(ym)}`} className="inline-flex min-h-11 items-center gap-2 rounded-button border border-border px-4 font-semibold text-primary">
            <Download aria-hidden size={18} strokeWidth={1.75} />
            {t('download')}
          </a>
        </Card>
        {me.canViewPayroll && (
          <Card className="flex items-center justify-between gap-2">
            <div>
              <p className="font-semibold">{t('payrollCsv')}</p>
              <p className="num text-sm text-muted">{ym} · CSV</p>
            </div>
            <a href={`/api/admin/export/payroll${q(ym)}`} className="inline-flex min-h-11 items-center gap-2 rounded-button border border-border px-4 font-semibold text-primary">
              <Download aria-hidden size={18} strokeWidth={1.75} />
              {t('download')}
            </a>
          </Card>
        )}
      </section>
    </PageShell>
  );
}
