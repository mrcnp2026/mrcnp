// 이상자 관리 — 달마다 누락 · 겹침 · 일정과 다른 기록 · 확인 안 된 근무지를 한 목록으로 보고, 유형마다 마감을 막을지 정한다 (PRD v1.3 A15).
// 여기서는 보여 주기만 한다. 고치는 길은 그 직원의 기록 화면(정정 승인 · 대리 입력)이다.
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Card, CardTitle, Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { ANOMALY_TYPES, summarizeAnomalies, type AnomalyType } from '@/lib/anomaly';
import { collectAnomalies, loadAnomalyPolicy } from '@/lib/anomaly-data';
import { isMonth, monthSpan } from '@/lib/close-review';
import { groupPath } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { loadPeriod } from '@/lib/period-data';
import { toKstDate } from '@/lib/time';
import { PolicyForm } from './PolicyForm';

const shift = (ym: string, by: number) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
};

export default async function AnomaliesPage({ searchParams }: { searchParams: Promise<{ m?: string; live?: string; k?: string }> }) {
  const [t, sp] = await Promise.all([getTranslations('admin.anomalies'), searchParams]);
  const today = toKstDate(new Date());
  const month = isMonth(sp.m) && sp.m <= today.slice(0, 7) ? sp.m : today.slice(0, 7);
  const practice = OFFICE.practiceMode && sp.live !== '1';
  const { from, last } = monthSpan(month);
  const [data, groups, saved] = await Promise.all([loadPeriod(from, last, practice), loadOrgGroups(), loadAnomalyPolicy()]);
  const sum = summarizeAnomalies(collectAnomalies(data, from, last), saved.policy);
  const only = (ANOMALY_TYPES as readonly string[]).includes(sp.k ?? '') ? (sp.k as AnomalyType) : null;
  const nameOf = new Map(data.people.map((p) => [p.id, p]));
  const rows = sum.shown
    .filter((x) => !only || x.types.includes(only))
    .sort((a, b) => Number(b.block) - Number(a.block) || b.workDate.localeCompare(a.workDate) || (nameOf.get(a.employeeId)?.name ?? '').localeCompare(nameOf.get(b.employeeId)?.name ?? ''));
  const live = sp.live === '1' ? '&live=1' : '';
  const link = (m: string, k?: string | null) => `/admin/anomalies?m=${m}${k ? `&k=${k}` : ''}${live}`;
  const blocks = sum.shown.filter((x) => x.block).length;

  return (
    <PageShell wide>
      <div>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="pt-1 text-sm text-faint">{t('intro')}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center">
          <Link href={link(shift(month, -1), only)} aria-label={t('prev')} className="inline-flex size-9 items-center justify-center rounded-l-button border border-border bg-bg text-muted">
            <ChevronLeft aria-hidden size={18} />
          </Link>
          <span className="num -ml-px inline-flex h-9 items-center border border-border bg-bg px-4 font-bold">{month}</span>
          {shift(month, 1) <= today.slice(0, 7) && (
            <Link href={link(shift(month, 1), only)} aria-label={t('next')} className="-ml-px inline-flex size-9 items-center justify-center rounded-r-button border border-border bg-bg text-muted">
              <ChevronRight aria-hidden size={18} />
            </Link>
          )}
        </span>
        <Chip tone={blocks > 0 ? 'warn' : 'ok'}>{t('sumBlock', { n: blocks })}</Chip>
        <Chip tone="info">{t('sumCheck', { n: sum.shown.length - blocks })}</Chip>
        <Link href={`/admin/closing?m=${month}${live}`} className="text-sm font-bold text-primary underline">
          {t('toClosing')}
        </Link>
      </div>
      {practice && <p className="text-sm text-faint">{t('practice')}</p>}

      <Card>
        <CardTitle>{t('listTitle', { n: rows.length })}</CardTitle>
        {only && (
          <p className="flex items-center gap-2 pt-2 text-sm">
            <Chip tone="info">{t(`type.${only}`)}</Chip>
            <Link href={link(month)} className="text-primary underline">
              {t('showAll')}
            </Link>
          </p>
        )}
        {rows.length === 0 ? (
          <p className="pt-3 text-sm text-faint">{t('empty')}</p>
        ) : (
          <div className="mt-3 overflow-x-auto border border-border bg-bg">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  {[t('colDate'), t('colName'), t('colGroup'), t('colWhat'), t('colEffect'), t('colGo')].map((h) => (
                    <th key={h} scope="col" className="px-3 py-2 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const p = nameOf.get(r.employeeId);
                  return (
                    <tr key={`${r.employeeId}${r.workDate}`} className="border-b border-border">
                      <td className="num px-3 py-2 whitespace-nowrap">{r.workDate}</td>
                      <td className="px-3 py-2 font-bold whitespace-nowrap">{p?.name}</td>
                      <td className="px-3 py-2 text-muted">{groupPath(groups, p?.groupId) ?? ''}</td>
                      <td className="px-3 py-2">
                        <span className="flex flex-wrap gap-1">
                          {r.types.map((k) => (
                            <Link key={k} href={link(month, k)}>
                              <Chip tone={saved.policy[k] === 'block' ? 'warn' : 'neutral'}>{t(`type.${k}`)}</Chip>
                            </Link>
                          ))}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{r.block ? <span className="font-bold text-warn">{t('effectBlock')}</span> : <span className="text-muted">{t('effectCheck')}</span>}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <Link href={`/admin/records/${r.employeeId}?m=${month}${live}`} className="font-bold text-primary underline">
                          {t('toRecords')}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardTitle>{t('policyTitle')}</CardTitle>
        <p className="pt-1 pb-3 text-sm text-faint">{t(saved.saved ? 'policyIntro' : 'policyDefault')}</p>
        <PolicyForm policy={saved.policy} version={saved.version} counts={sum.byType} />
      </Card>
    </PageShell>
  );
}
