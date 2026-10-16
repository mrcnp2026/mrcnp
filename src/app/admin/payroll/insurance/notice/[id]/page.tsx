// 고지 보험료 한 묶음 — 직원마다 고지액 · 고른 대장에서 이미 뗀 금액 · 차액, 대장에 넣기/빼기 (PRD v1.3 18.4 W06). 급여 담당 관리자만.
// 차액 = 근로자 고지액 − 이미 뗀 금액. 추가 공제는 양수, 환급은 음수. 넣으면 그 대장을 다시 계산해야 한다.
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { getMe } from '@/lib/auth';
import { loadNotice } from '@/lib/payroll/insurance-data';
import { AllocateButton, FileWithdraw } from '../../InsuranceForms';

const field = 'min-h-9 rounded-button border border-border bg-bg px-3 text-sm';

export default async function NoticePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ run?: string; live?: string }> }) {
  const [t, f, me, { id }, sp] = await Promise.all([getTranslations('admin.insurance'), getFormatter(), getMe(), params, searchParams]);
  if (!me || me.role !== 'admin' || !me.canViewPayroll) return <PageShell><p className="rounded-card bg-warn-tint p-4 text-sm text-warn">{t('forbidden')}</p></PageShell>;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  const practice = OFFICE.practiceMode && sp.live !== '1';
  const v = await loadNotice({ id, runId: sp.run && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sp.run) ? sp.run : null, practice, testViewer: !!me.employeeNo?.startsWith('e2e-') });
  if (!v) notFound();
  const won = (n: number | null) => (n === null ? '' : t('won', { n: f.number(n) }));
  const signed = (n: number | null) => (n === null ? '' : t('won', { n: f.number(n, { signDisplay: 'exceptZero' }) }));
  const sum = (k: 'notice' | 'deducted' | 'diff') => v.lines.reduce((a, l) => a + (l[k] ?? 0), 0);
  const live = sp.live === '1';

  return (
    <PageShell wide>
      <Link href={`/admin/payroll/insurance?v=notice${live ? '&live=1' : ''}`} className="inline-flex min-h-9 items-center self-start text-sm font-medium text-muted">
        ‹ {t('tabNotice')}
      </Link>
      <div>
        <h1 className="num flex flex-wrap items-center gap-2 text-2xl font-bold">
          {t('noticeTitle', { month: v.file.month, insurer: t(`insurer.${v.file.insurer}`) })}
          <Chip tone={v.file.state === 'SAVED' ? 'ok' : 'neutral'}>{t(`fileState.${v.file.state}`)}</Chip>
          {v.file.isTest && <Chip>{t('practice')}</Chip>}
        </h1>
        {v.file.state === 'WITHDRAWN' && <p className="pt-1 text-sm text-muted">{t('withdrawnNote', { reason: v.file.withdrawReason ?? '' })}</p>}
      </div>
      <form className="flex flex-wrap items-end gap-3 text-sm">
        {live && <input type="hidden" name="live" value="1" />}
        <label className="flex flex-col gap-1">
          <span className="font-bold">{t('fRun')}</span>
          <select name="run" defaultValue={v.run?.id ?? ''} className={field}>
            <option value="">{t('pickRun')}</option>
            {v.runs.map((r) => (
              <option key={r.id} value={r.id}>{t('runOption', { month: r.periodFrom.slice(0, 7), status: t(`runStatus.${r.status}`), rev: r.revision })}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="inline-flex min-h-9 items-center rounded-button border border-border bg-bg px-4 text-sm font-bold text-primary">{t('compare')}</button>
      </form>
      {v.why && <p className="rounded-card border border-border bg-surface p-3 text-sm">{t(`why.${v.why}`)}</p>}
      {v.run && v.run.periodFrom.slice(0, 7) !== v.file.month && <p className="rounded-card border border-warn bg-warn-tint p-3 text-sm text-warn">{t('monthDiffers', { notice: v.file.month, run: v.run.periodFrom.slice(0, 7) })}</p>}
      <div className="overflow-x-auto rounded-card border border-border bg-bg">
        <table className="w-full text-sm" data-notice>
          <thead>
            <tr className="border-b border-border bg-surface text-left">
              <th scope="col" className="px-3 py-2">{t('colName')}</th>
              {['colNotice', 'colEmployer', 'colDeducted', 'colDiff'].map((k) => (
                <th key={k} scope="col" className="px-3 py-2 text-right whitespace-nowrap">{t(k)}</th>
              ))}
              <th scope="col" className="px-3 py-2">{t('colAllocated')}</th>
              <th scope="col" className="px-3 py-2">{t('colManage')}</th>
            </tr>
          </thead>
          <tbody>
            {v.lines.map((l) => (
              <tr key={l.id} className="border-b border-border align-top">
                <td className="px-3 py-3">
                  <b>{l.name}</b> <span className="num text-xs text-muted">{l.employeeNo}</span>
                  <span className="block text-xs text-faint">{l.basis}</span>
                </td>
                <td className="num px-3 py-3 text-right whitespace-nowrap">{won(l.notice)}</td>
                <td className="num px-3 py-3 text-right whitespace-nowrap">{won(l.employer)}</td>
                <td className="num px-3 py-3 text-right whitespace-nowrap">{v.run ? (l.deducted === null ? t('noStatement') : won(l.deducted)) : ''}</td>
                <td className="num px-3 py-3 text-right font-bold whitespace-nowrap">{v.run ? signed(l.diff) : ''}</td>
                <td className="num px-3 py-3 whitespace-nowrap">{l.allocation ? t(l.allocation.here ? 'allocatedHere' : 'allocatedElsewhere', { amount: f.number(l.allocation.amount, { signDisplay: 'exceptZero' }) }) : ''}</td>
                <td className="px-3 py-3">
                  {v.canAllocate && <AllocateButton noticeId={l.id} runId={v.run?.id ?? null} allocationId={l.allocation?.here ? l.allocation.id : null} diff={l.allocation ? null : l.diff} name={l.name} live={live} />}
                </td>
              </tr>
            ))}
            <tr className="bg-surface font-bold">
              <td className="px-3 py-2">{t('sum')}</td>
              <td className="num px-3 py-2 text-right">{won(sum('notice'))}</td>
              <td />
              <td className="num px-3 py-2 text-right">{v.run ? won(sum('deducted')) : ''}</td>
              <td className="num px-3 py-2 text-right">{v.run ? signed(sum('diff')) : ''}</td>
              <td colSpan={2} />
            </tr>
          </tbody>
        </table>
      </div>
      {v.run && (
        <p className="text-sm">
          <Link href={`/admin/payroll/runs/${v.run.id}`} className="font-bold text-primary hover:underline">{t('toRun')}</Link> — {t('recalcNote')}
        </p>
      )}
      <p className="text-xs text-faint">{t('diffNote')}</p>
      {v.file.state === 'SAVED' && <FileWithdraw id={v.file.id} />}
    </PageShell>
  );
}
