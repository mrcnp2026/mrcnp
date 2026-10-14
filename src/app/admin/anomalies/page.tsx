// 이상자 관리 — 달마다 누락 · 겹침 · 일정과 다른 기록 · 확인 안 된 근무지를 한 목록으로 보고, 유형마다 마감을 막을지 정한다 (PRD v1.3 A15).
// 여기서는 보여 주기만 한다. 고치는 길은 그 직원의 기록 화면(정정 승인 · 대리 입력)이다.
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { FilterBar, ListHead, ListTable, StatusCards } from '@/components/listframe';
import { Card, CardTitle, Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { ANOMALY_TYPES, summarizeAnomalies, type AnomalyType } from '@/lib/anomaly';
import { collectAnomalies, loadAnomalyPolicy, loadAnomalyReviews } from '@/lib/anomaly-data';
import { isMonth, monthSpan } from '@/lib/close-review';
import { groupPath } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { loadPeriod } from '@/lib/period-data';
import { toKstDate } from '@/lib/time';
import { PolicyForm, ReviewButton } from './PolicyForm';

const shift = (ym: string, by: number) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
};

export default async function AnomaliesPage({ searchParams }: { searchParams: Promise<{ m?: string; live?: string; k?: string; st?: string }> }) {
  const [t, sp] = await Promise.all([getTranslations('admin.anomalies'), searchParams]);
  const today = toKstDate(new Date());
  const month = isMonth(sp.m) && sp.m <= today.slice(0, 7) ? sp.m : today.slice(0, 7);
  const practice = OFFICE.practiceMode && sp.live !== '1';
  const { from, last } = monthSpan(month);
  const [data, groups, saved] = await Promise.all([loadPeriod(from, last, practice), loadOrgGroups(), loadAnomalyPolicy()]);
  const reviews = await loadAnomalyReviews(from, last, practice);
  const sum = summarizeAnomalies(collectAnomalies(data, from, last), saved.policy, new Set(reviews.keys()));
  const only = (ANOMALY_TYPES as readonly string[]).includes(sp.k ?? '') ? (sp.k as AnomalyType) : null;
  // 처리 상태 거르기: block = 마감 차단, check = 확인 필요, done = 확인함
  const st = sp.st === 'block' || sp.st === 'check' || sp.st === 'done' ? sp.st : null;
  const stateOf = (x: (typeof sum.shown)[number]) => (x.block ? 'block' : x.reviewed ? 'done' : 'check');
  const nameOf = new Map(data.people.map((p) => [p.id, p]));
  const rows = sum.shown
    .filter((x) => (!only || x.types.includes(only)) && (!st || stateOf(x) === st))
    .sort((a, b) => Number(b.block) - Number(a.block) || b.workDate.localeCompare(a.workDate) || (nameOf.get(a.employeeId)?.name ?? '').localeCompare(nameOf.get(b.employeeId)?.name ?? ''));
  const live = sp.live === '1' ? '&live=1' : '';
  const link = (m: string, k?: string | null, s?: string | null) => `/admin/anomalies?m=${m}${k ? `&k=${k}` : ''}${s ? `&st=${s}` : ''}${live}`;
  const count = (s: string) => sum.shown.filter((x) => stateOf(x) === s).length;
  // 유형 카드는 이 달에 한 건이라도 있었던 유형 + 마감을 막는 유형만 (꺼 둔 유형은 아래 기준표에서 본다)
  const typeCards = ANOMALY_TYPES.filter((k) => saved.policy[k] !== 'off' && (sum.byType[k] > 0 || saved.policy[k] === 'block'));

  return (
    <PageShell wide>
      <ListHead title={t('title')} desc={t('intro')} settingsHref="#policy" settingsLabel={t('policyTitle')} />
      <FilterBar>
        <span className="inline-flex items-center">
          <Link href={link(shift(month, -1), only, st)} aria-label={t('prev')} className="inline-flex size-9 items-center justify-center rounded-l-button border border-border bg-bg text-muted">
            <ChevronLeft aria-hidden size={18} />
          </Link>
          <span className="num -ml-px inline-flex h-9 items-center border border-border bg-bg px-4 font-bold">{month}</span>
          {shift(month, 1) <= today.slice(0, 7) && (
            <Link href={link(shift(month, 1), only, st)} aria-label={t('next')} className="-ml-px inline-flex size-9 items-center justify-center rounded-r-button border border-border bg-bg text-muted">
              <ChevronRight aria-hidden size={18} />
            </Link>
          )}
        </span>
        {practice && <span className="text-sm text-faint">{t('practice')}</span>}
        <Link href={`/admin/closing?m=${month}${live}`} className="ml-auto inline-flex h-9 items-center rounded-button border border-border bg-bg px-3.5 text-sm font-semibold text-text hover:bg-surface">
          {t('toClosing')} ›
        </Link>
      </FilterBar>

      <StatusCards
        groups={[
          {
            title: t('cardsState'),
            cards: (['block', 'check', 'done'] as const).map((s) => ({ key: s, label: t(`state.${s}`), n: count(s), unit: t('unitDay'), href: link(month, only, st === s ? null : s), on: st === s, tone: s === 'block' ? ('warn' as const) : s === 'done' ? ('ok' as const) : undefined })),
          },
          {
            title: t('cardsType'),
            cards: typeCards.map((k) => ({ key: k, label: t(`type.${k}`), n: sum.byType[k], unit: t('unitCase'), href: link(month, only === k ? null : k, st), on: only === k, tone: saved.policy[k] === 'block' ? ('warn' as const) : undefined })),
          },
        ]}
      />

      <ListTable
        count={
          <>
            {t('listTitle', { n: rows.length })}
            {(only || st) && (
              <Link href={link(month)} className="pl-3 font-bold text-primary">
                {t('showAll')}
              </Link>
            )}
          </>
        }
        head={[{ label: t('colDate') }, { label: t('colName') }, { label: t('colGroup') }, { label: t('colWhat') }, { label: t('colEffect') }, { label: '' }]}
        empty={rows.length === 0 ? t('empty') : undefined}
      >
        {rows.map((r) => {
          const p = nameOf.get(r.employeeId);
          return (
            <tr key={`${r.employeeId}${r.workDate}`}>
              <td className="num whitespace-nowrap">{r.workDate}</td>
              <td className="font-bold whitespace-nowrap">{p?.name}</td>
              <td className="text-muted">{groupPath(groups, p?.groupId) ?? ''}</td>
              <td>
                <span className="flex flex-wrap gap-1 py-2">
                  {r.types.map((k) => (
                    <Chip key={k} tone={saved.policy[k] === 'block' ? 'warn' : 'neutral'}>
                      {t(`type.${k}`)}
                    </Chip>
                  ))}
                </span>
              </td>
              <td className="whitespace-nowrap">
                {r.block ? <Chip tone="warn">{t('effectBlock')}</Chip> : <ReviewButton employeeId={r.employeeId} workDate={r.workDate} types={r.types} reviewed={r.reviewed} live={sp.live === '1'} />}
              </td>
              <td className="text-right whitespace-nowrap">
                <Link href={`/admin/records/${r.employeeId}?m=${month}${live}`} className="font-bold text-primary hover:underline">
                  {t('toRecords')} ›
                </Link>
              </td>
            </tr>
          );
        })}
      </ListTable>

      <Card className="scroll-mt-20">
        <span id="policy" />
        <CardTitle>{t('policyTitle')}</CardTitle>
        <p className="pt-1 pb-3 text-sm text-faint">{t(saved.saved ? 'policyIntro' : 'policyDefault')}</p>
        <PolicyForm policy={saved.policy} version={saved.version} counts={sum.byType} />
      </Card>
    </PageShell>
  );
}
