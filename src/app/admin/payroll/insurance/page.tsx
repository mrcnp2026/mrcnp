// 사회보험 — 취득/상실 확인 목록과 고지 보험료 묶음 (PRD v1.3 18.4 W06). 급여 담당 관리자만.
// 프로그램이 공단에 신고하지 않는다. 「확인 완료」는 담당자가 신고 처리를 확인한 날과 근거를 적은 것이다.
import { getTranslations } from 'next-intl/server';
import { WarnLine } from '@/components/listframe';
import { HelpTip } from '@/components/Help';
import Link from 'next/link';
import { AddSheet } from '@/components/AddSheet';
import { AddTabs } from '@/components/AddTabs';
import { SheetOpener } from '@/components/SheetOpener';
import { Card, CardTitle, Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { getMe } from '@/lib/auth';
import { GAP_RECENT_DAYS, isRecentGap, loadEnrollments, loadNoticeFiles } from '@/lib/payroll/insurance-data';
import { toKstDate } from '@/lib/time';
import { ConfirmOldButton, EnrollAdd, EnrollGroupRow, NoticeManual } from './InsuranceForms';
import { NoticeUpload } from './NoticeUpload';

const TONE = { UNREPORTED: 'warn', CHECKING: 'info', CONFIRMED: 'ok' } as const;

export default async function InsurancePage({ searchParams }: { searchParams: Promise<{ v?: string; live?: string }> }) {
  const [t, me, sp] = await Promise.all([getTranslations('admin.insurance'), getMe(), searchParams]);
  if (!me || me.role !== 'admin' || !me.canViewPayroll) return <PageShell><p className="rounded-card bg-warn-tint p-4 text-sm text-warn">{t('forbidden')}</p></PageShell>;
  const practice = OFFICE.practiceMode && sp.live !== '1';
  const testViewer = !!me.employeeNo?.startsWith('e2e-');
  const notice = sp.v === 'notice';
  const today = toKstDate(new Date());
  const [{ rows: allRows, gaps: allGaps, people }, files] = await Promise.all([loadEnrollments(testViewer), notice ? loadNoticeFiles({ practice, testViewer }) : Promise.resolve([])]);
  // 아직 확정하지 않은 건을 위에, 확정한 건은 접어 둔다 (2026-10-26 의뢰인: 이슈 먼저, 나머지는 더보기)
  // 직원 한 명 · 취득/상실 · 자격일마다 한 줄로 묶는다(보험은 칩으로). 한 줄이라도 확인 전이면 위쪽, 전부 확인 완료면 접는다
  const ORDER = ['NP', 'HI', 'EI', 'IA'];
  const groupMap = new Map<string, typeof allRows>();
  for (const r of allRows) {
    const k = `${r.employeeId}|${r.event}|${r.qualifyOn}`;
    groupMap.set(k, [...(groupMap.get(k) ?? []), r]);
  }
  const groups = [...groupMap.values()].map((g) => g.sort((a, b) => ORDER.indexOf(a.insurer) - ORDER.indexOf(b.insurer)));
  const rows = groups.filter((g) => g.some((r) => r.state !== 'CONFIRMED'));
  const doneRows = groups.filter((g) => g.every((r) => r.state === 'CONFIRMED'));
  const tab = (on: boolean) => `flex min-h-11 items-center border-b-2 px-4 text-sm font-bold ${on ? 'border-text text-text lg:border-primary lg:text-primary' : 'border-transparent text-muted hover:text-text'}`;
  const live = sp.live === '1' ? '&live=1' : '';

  // 최근 입사 · 퇴사만 「확인할 사람」, 오래된 건은 접어서 한꺼번에 처리 (2026-10-26 의뢰인)
  const gaps = allGaps.filter((g) => isRecentGap(g, today));
  const oldGaps = allGaps.filter((g) => !isRecentGap(g, today));
  const gapList = (list: typeof gaps) => (
    <ul className="flex flex-col divide-y divide-border text-sm" data-gaps>
                {list.map((g) => (
                  <li key={`${g.employeeId}${g.event}${g.qualifyOn}`} className="flex items-center justify-between gap-3 py-2">
                    <span className="num min-w-0">
                      <b>{g.name}</b> <span className="text-xs text-muted">{g.employeeNo}</span> · {t(`event.${g.event}`)} · {g.qualifyOn}
                    </span>
                    <EnrollAdd people={[]} today={today} preset={{ employeeId: g.employeeId, event: g.event, qualifyOn: g.qualifyOn, label: t('gapAddOf', { name: g.name }) }} />
                  </li>
                ))}
              </ul>
  );
  const enrollList = (list: typeof groups) => (
    list.length > 0 && (
      <ul className="flex flex-col divide-y divide-border rounded-card border border-border bg-bg">
        {list.map((g) => (
          <EnrollGroupRow
            key={g[0].employeeId + g[0].event + g[0].qualifyOn}
            name={g[0].name}
            employeeNo={g[0].employeeNo}
            eventLabel={t(`event.${g[0].event}`)}
            qualifyOn={g[0].qualifyOn}
            progress={t('groupProgress', { done: g.filter((r) => r.state === 'CONFIRMED').length, total: g.length })}
            lines={g.map((r) => ({ id: r.id, insurerLabel: t(`insurer.${r.insurer}`), state: r.state, stateLabel: t(`state.${r.state}`), version: r.version, confirmedOn: r.confirmedOn, evidence: r.evidence }))}
            today={today}
          />
        ))}
      </ul>
    )
  );

  return (
    <PageShell wide>
      <div>
        <h1 className="flex flex-wrap items-center gap-x-1 text-2xl font-bold">
          {t('title')}
          {practice && notice && <Chip>{t('practice')}</Chip>}
        <HelpTip>{t('intro')}</HelpTip></h1>
      </div>
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
              {gapList(gaps.slice(0, 5))}
              {gaps.length > 5 && (
                <details className="group">
                  <summary className="flex min-h-10 cursor-pointer items-center text-sm font-bold text-primary">
                    {t('gapMore', { n: Math.min(gaps.length, 50) - 5 })}
                  </summary>
                  {gapList(gaps.slice(5, 50))}
                </details>
              )}
            </Card>
          )}
          {oldGaps.length > 0 && (
            <details className="group rounded-card border border-border bg-bg">
              <summary className="flex min-h-11 cursor-pointer items-center justify-between px-4 text-sm font-bold">
                {t('gapOldTitle', { n: oldGaps.length })}
                <span className="text-xs font-normal text-muted group-open:hidden">{t('showAll')}</span>
              </summary>
              <div className="flex flex-col gap-3 border-t border-border p-4">
                <p className="text-sm text-muted">{t('gapOldNote', { days: GAP_RECENT_DAYS })}</p>
                <ConfirmOldButton n={oldGaps.length} />
              </div>
            </details>
          )}
          {allRows.length === 0 && <p className="rounded-card border border-border bg-bg p-4 text-sm text-faint">{t('enrollEmpty')}</p>}
          {enrollList(rows)}
          {doneRows.length > 0 && (
            <details className="group rounded-card border border-border bg-bg">
              <summary className="flex min-h-11 cursor-pointer items-center justify-between px-4 text-sm font-bold">
                {t('doneGroup', { n: doneRows.length })}
                <span className="text-xs font-normal text-muted group-open:hidden">{t('showAll')}</span>
              </summary>
              <div className="border-t border-border p-2">{enrollList(doneRows)}</div>
            </details>
          )}
        </>
      ) : (
        <>
          {/* 손으로 넣기 · 고지서 파일 올리기를 단추 하나 + 가운데 창의 두 탭으로 (2026-10-20 의뢰인: 새 창 모양으로 맞추기) */}
          <div className="flex justify-end">
            <SheetOpener id="notice" label={t('manualTitle')} />
          </div>
          <AddSheet id="notice" title={t('manualTitle')} modal wide>
            <AddTabs
              labels={{ one: t('upload.tabManual'), many: t('upload.tabFile'), group: t('manualTitle') }}
              one={<NoticeManual people={people} month={today.slice(0, 7)} live={sp.live === '1'} />}
              many={<NoticeUpload people={people} month={today.slice(0, 7)} live={sp.live === '1'} />}
            />
          </AddSheet>
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
