// 사회보험 — 취득/상실 확인 목록과 고지 보험료 묶음 (PRD v1.3 18.4 W06). 급여 담당 관리자만.
// 프로그램이 공단에 신고하지 않는다. 「확인 완료」는 담당자가 신고 처리를 확인한 날과 근거를 적은 것이다.
import { getTranslations } from 'next-intl/server';
import { PayFlow } from '@/components/PayFlow';
import { WarnLine } from '@/components/listframe';
import { HelpTip } from '@/components/Help';
import Link from 'next/link';
import { AddSheet } from '@/components/AddSheet';
import { SheetOpener } from '@/components/SheetOpener';
import { Card, CardTitle, Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { getMe } from '@/lib/auth';
import { loadEnrollments, loadNoticeFiles } from '@/lib/payroll/insurance-data';
import { toKstDate } from '@/lib/time';
import { EnrollAdd, EnrollControls, NoticeManual } from './InsuranceForms';
import { NoticeUpload } from './NoticeUpload';

const TONE = { UNREPORTED: 'warn', CHECKING: 'info', CONFIRMED: 'ok' } as const;

export default async function InsurancePage({ searchParams }: { searchParams: Promise<{ v?: string; live?: string }> }) {
  const [t, me, sp] = await Promise.all([getTranslations('admin.insurance'), getMe(), searchParams]);
  if (!me || me.role !== 'admin' || !me.canViewPayroll) return <PageShell><p className="rounded-card bg-warn-tint p-4 text-sm text-warn">{t('forbidden')}</p></PageShell>;
  const practice = OFFICE.practiceMode && sp.live !== '1';
  const testViewer = !!me.employeeNo?.startsWith('e2e-');
  const notice = sp.v === 'notice';
  const today = toKstDate(new Date());
  const [{ rows, gaps, people }, files] = await Promise.all([loadEnrollments(testViewer), notice ? loadNoticeFiles({ practice, testViewer }) : Promise.resolve([])]);
  const tab = (on: boolean) => `flex min-h-11 items-center border-b-2 px-4 text-sm font-bold ${on ? 'border-text text-text lg:border-primary lg:text-primary' : 'border-transparent text-muted hover:text-text'}`;
  const live = sp.live === '1' ? '&live=1' : '';

  return (
    <PageShell wide>
      <div>
        <h1 className="flex flex-wrap items-center gap-x-1 text-2xl font-bold">
          {t('title')}
          {practice && notice && <Chip>{t('practice')}</Chip>}
        <HelpTip>{t('intro')}</HelpTip></h1>
      </div>
      <PayFlow now="after" />
      <nav className="flex border-b border-border">
        <Link href={`/admin/payroll/insurance${live ? '?live=1' : ''}`} aria-current={!notice ? 'page' : undefined} className={tab(!notice)}>{t('tabEnroll')}</Link>
        <Link href={`/admin/payroll/insurance?v=notice${live}`} aria-current={notice ? 'page' : undefined} className={tab(notice)}>{t('tabNotice')}</Link>
      </nav>
      <WarnLine short={t(notice ? 'noticeLegalShort' : 'enrollLegalShort')}>{t(notice ? 'noticeLegal' : 'enrollLegal')}</WarnLine>
      {!notice ? (
        <>
          {/* 넣는 양식은 단추를 눌러 여는 창으로 — 화면은 확인할 사람 · 목록이 먼저 (2026-10-14) */}
          <div className="flex justify-end">
            <SheetOpener id="enroll" label={t('addTitle')} />
          </div>
          <AddSheet id="enroll" title={t('addTitle')} modal>
            <EnrollAdd people={people} today={today} />
          </AddSheet>
          {gaps.length > 0 && (
            <Card className="flex flex-col gap-2">
              <CardTitle help={t('gapNote')}>{t('gapTitle', { n: gaps.length })}</CardTitle>
              <ul className="flex flex-col divide-y divide-border text-sm" data-gaps>
                {gaps.slice(0, 50).map((g) => (
                  <li key={`${g.employeeId}${g.event}${g.qualifyOn}`} className="flex items-center justify-between gap-3 py-2">
                    <span className="num min-w-0">
                      <b>{g.name}</b> <span className="text-xs text-muted">{g.employeeNo}</span> · {t(`event.${g.event}`)} · {g.qualifyOn}
                    </span>
                    <EnrollAdd people={[]} today={today} preset={{ employeeId: g.employeeId, event: g.event, qualifyOn: g.qualifyOn, label: t('gapAddOf', { name: g.name }) }} />
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {rows.length === 0 && <p className="rounded-card border border-border bg-bg p-4 text-sm text-faint">{t('enrollEmpty')}</p>}
          {/* 폰: 한 줄 = 카드 (표가 옆으로 넘치던 것, 2026-10-17 디자인) */}
          {rows.length > 0 && (
            <ul className="flex flex-col divide-y divide-border rounded-card border border-border bg-bg lg:hidden">
              {rows.map((r) => (
                <li key={r.id} className="flex flex-col gap-1.5 px-4 py-3 text-sm">
                  <span className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate"><b>{r.name}</b> <span className="num text-xs text-muted">{r.employeeNo}</span></span>
                    <Chip tone={TONE[r.state]}>{t(`state.${r.state}`)}</Chip>
                  </span>
                  <span className="num text-muted">{t(`insurer.${r.insurer}`)} · {t(`event.${r.event}`)} · {r.qualifyOn}{r.confirmedOn ? ` · ${r.confirmedOn}` : ''}</span>
                  <EnrollControls id={r.id} version={r.version} state={r.state} name={r.name} today={today} />
                </li>
              ))}
            </ul>
          )}
          {rows.length > 0 && (
          <div className="hidden overflow-x-auto table-ruled lg:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface text-left">
                  {['colName', 'colInsurer', 'colEvent', 'colQualify', 'colState', 'colConfirmed', 'colManage'].map((k) => (
                    <th key={k} scope="col" className="px-3 py-2.5 text-xs font-semibold whitespace-nowrap text-muted">{t(k)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border align-top">
                    <td className="px-3 py-3 whitespace-nowrap"><b>{r.name}</b> <span className="num text-xs text-muted">{r.employeeNo}</span></td>
                    <td className="px-3 py-3 whitespace-nowrap">{t(`insurer.${r.insurer}`)}</td>
                    <td className="px-3 py-3 whitespace-nowrap">{t(`event.${r.event}`)}</td>
                    <td className="num px-3 py-3 whitespace-nowrap">{r.qualifyOn}</td>
                    <td className="px-3 py-3"><Chip tone={TONE[r.state]}>{t(`state.${r.state}`)}</Chip></td>
                    <td className="num px-3 py-3">{r.confirmedOn && <>{r.confirmedOn}<span className="block text-xs text-muted">{r.evidence}</span></>}</td>
                    <td className="px-3 py-3"><EnrollControls id={r.id} version={r.version} state={r.state} name={r.name} today={today} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </>
      ) : (
        <>
          <Card className="flex flex-col gap-3">
            <CardTitle>{t('manualTitle')}</CardTitle>
            <NoticeManual people={people} month={today.slice(0, 7)} live={sp.live === '1'} />
          </Card>
          <Card className="flex flex-col gap-3">
            <CardTitle>{t('upload.title')}</CardTitle>
            <NoticeUpload people={people} month={today.slice(0, 7)} live={sp.live === '1'} />
          </Card>
          {files.length === 0 && <p className="rounded-card border border-border bg-bg p-4 text-sm text-faint">{t('noticeEmpty')}</p>}
          {files.length > 0 && (
            <ul className="flex flex-col divide-y divide-border rounded-card border border-border bg-bg lg:hidden">
              {files.map((f) => (
                <li key={f.id}>
                  <Link href={`/admin/payroll/insurance/notice/${f.id}${live ? '?live=1' : ''}`} className="flex items-center justify-between gap-2 px-4 py-3 text-sm">
                    <span className="min-w-0">
                      <b className="num text-primary">{f.month}</b> · {t(`insurer.${f.insurer}`)}
                      <span className="num block text-xs text-muted">{t('rowsValue', { n: f.rows })} · {t(`source.${f.source}`)} · {toKstDate(new Date(f.createdAt))}</span>
                    </span>
                    <Chip tone={f.state === 'SAVED' ? 'ok' : 'neutral'}>{t(`fileState.${f.state}`)}</Chip>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {files.length > 0 && (
          <div className="hidden overflow-x-auto table-ruled lg:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface text-left">
                  {['colMonth', 'colInsurer', 'colRows', 'colSource', 'colFileState', 'colMade'].map((k) => (
                    <th key={k} scope="col" className="px-3 py-2.5 text-xs font-semibold whitespace-nowrap text-muted">{t(k)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {files.map((f) => (
                  <tr key={f.id} className="border-b border-border last:border-b-0">
                    <td className="num px-3 py-3 whitespace-nowrap">
                      <Link href={`/admin/payroll/insurance/notice/${f.id}${live ? '?live=1' : ''}`} className="font-bold text-primary hover:underline">{f.month}</Link>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">{t(`insurer.${f.insurer}`)}</td>
                    <td className="num px-3 py-3">{t('rowsValue', { n: f.rows })}</td>
                    <td className="px-3 py-3">{t(`source.${f.source}`)}</td>
                    <td className="px-3 py-3"><Chip tone={f.state === 'SAVED' ? 'ok' : 'neutral'}>{t(`fileState.${f.state}`)}</Chip></td>
                    <td className="num px-3 py-3 whitespace-nowrap">{toKstDate(new Date(f.createdAt))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </>
      )}
    </PageShell>
  );
}
