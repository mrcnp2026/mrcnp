// 급여대장 목록 — 달마다 정규 대장을 만들고 상태(초안 → 계산됨 → 검토됨 → 확정)를 본다 (PRD v1.3 18.3 W04). 급여 담당 관리자만.
import { getFormatter, getTranslations } from 'next-intl/server';
import { PayFlow } from '@/components/PayFlow';
import { Upload } from 'lucide-react';
import Link from 'next/link';
import { ListHead, ListTable, StatusCards } from '@/components/listframe';
import { Card, CardTitle, Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { getMe } from '@/lib/auth';
import { loadRuns } from '@/lib/payroll/run-data';
import { toKstDate } from '@/lib/time';
import { RunCreate } from './RunForms';

const TONE = { DRAFT: 'neutral', CALCULATED: 'info', REVIEWED: 'warn', FINALIZED: 'ok' } as const;

export default async function PayRunsPage({ searchParams }: { searchParams: Promise<{ live?: string; st?: string }> }) {
  const [t, tf, f, me, sp] = await Promise.all([getTranslations('admin.payRuns'), getTranslations('frame'), getFormatter(), getMe(), searchParams]);
  if (!me || me.role !== 'admin' || !me.canViewPayroll) return <PageShell><p className="rounded-card bg-warn-tint p-4 text-sm text-warn">{t('forbidden')}</p></PageShell>;
  const practice = OFFICE.practiceMode && sp.live !== '1';
  const runs = await loadRuns(practice);
  const today = toKstDate(new Date());
  // 만들 수 있는 달: 이번 달부터 거꾸로 12달 가운데 아직 대장이 없는 달
  const have = new Set(runs.filter((r) => r.kind === 'REGULAR').map((r) => r.periodFrom.slice(0, 7)));
  const recent = [...Array(12)].map((_, i) => new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - i, 1)).toISOString().slice(0, 7));
  const months = recent.filter((m) => !have.has(m));
  const won = (v: unknown) => t('won', { n: f.number(Number(v ?? 0)) });
  // 상태 카드로 거르기 (목록 틀 — components/listframe)
  const STATES = ['DRAFT', 'CALCULATED', 'REVIEWED', 'FINALIZED'] as const;
  const st = (STATES as readonly string[]).includes(sp.st ?? '') ? sp.st : null;
  const live = sp.live === '1' ? 'live=1' : '';
  const stLink = (s: string | null) => `/admin/payroll/runs?${[s ? `st=${s}` : '', live].filter(Boolean).join('&')}`;
  const shown = st ? runs.filter((r) => r.status === st) : runs;

  return (
    <PageShell wide>
      {/* 명세서를 회사 엑셀로 올리는 길 (2026-10-16 의뢰인: 다운로드 외 업로드 버튼) */}
      <ListHead title={t('title')} desc={t('intro')} settingsHref="/admin/settings?tab=pay&section=ledger" settingsLabel={tf('item.payLedger')} actions={<Link href="/admin/payroll/slips" className="inline-flex min-h-11 items-center gap-2 rounded-button bg-primary px-4 text-sm font-bold text-on-primary" data-slip-entry><Upload aria-hidden size={18} strokeWidth={2} />{t('uploadSlips')}</Link>} />
      <PayFlow now="runs" />
      {practice && <p className="rounded-card border border-border bg-surface p-3 text-sm text-muted">{t('practice')}</p>}
      <Card>
        <CardTitle>{t('createTitle')}</CardTitle>
        <p className="pt-1 pb-3 text-sm text-faint">{t('createIntro')}</p>
        <RunCreate months={months} bonusMonths={recent} today={today} live={sp.live === '1'} />
      </Card>
      <StatusCards groups={[{ title: t('cardsTitle'), cards: STATES.map((k) => ({ key: k, label: t(`status.${k}`), n: runs.filter((r) => r.status === k).length, unit: t('unit'), href: stLink(st === k ? null : k), on: st === k, tone: k === 'FINALIZED' ? ('ok' as const) : k === 'REVIEWED' ? ('warn' as const) : undefined })) }]} />
      <ListTable
        count={
          <>
            {t('count', { n: shown.length })}
            {st && (
              <Link href={stLink(null)} className="pl-3 font-bold text-primary">
                {t('showAll')}
              </Link>
            )}
          </>
        }
        head={['colMonth', 'colPayDate', 'colStatus', 'colMembers', 'colPay', 'colDeduction', 'colNet', 'colEmployer'].map((k, i) => ({ label: t(k), right: i >= 4 }))}
        empty={shown.length === 0 ? t('empty') : undefined}
      >
        {shown.map((r) => (
          <tr key={r.id}>
            <td className="num whitespace-nowrap">
              <Link href={`/admin/payroll/runs/${r.id}`} className="font-bold text-primary hover:underline">
                {r.periodFrom.slice(0, 7)}
              </Link>
              {r.kind !== 'REGULAR' && <span className="ml-2 text-xs font-bold text-muted">{t('kindSeq', { kind: t(`kind.${r.kind}`), n: r.sequence })}{r.title ? ` · ${r.title}` : ''}</span>}
              {r.revision > 1 && <span className="ml-2 text-xs text-faint">{t('revision', { n: r.revision })}</span>}
              {runs.some((x) => x.kind === r.kind && x.periodFrom === r.periodFrom && x.sequence === r.sequence && x.revision > r.revision) && <span className="ml-2 text-xs text-faint">{t('older')}</span>}
            </td>
            <td className="num whitespace-nowrap">{r.payDate}</td>
            <td>
              <Chip tone={TONE[r.status]}>{t(`status.${r.status}`)}</Chip>
            </td>
            <td className="num">{r.generationId ? t('membersValue', { ok: Number(r.totals.ok ?? 0), blocked: Number(r.totals.blocked ?? 0) }) : ''}</td>
            <td className="num text-right whitespace-nowrap">{r.generationId ? won(r.totals.pay) : ''}</td>
            <td className="num text-right whitespace-nowrap">{r.generationId ? won(r.totals.deduction) : ''}</td>
            <td className="num text-right font-bold whitespace-nowrap">{r.generationId ? won(r.totals.net) : ''}</td>
            <td className="num text-right whitespace-nowrap">{r.generationId ? won(r.totals.employer) : ''}</td>
          </tr>
        ))}
      </ListTable>
    </PageShell>
  );
}
