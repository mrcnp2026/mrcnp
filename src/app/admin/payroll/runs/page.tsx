// 급여대장 목록 — 달마다 정규 대장을 생성하고 상태(초안 → 계산됨 → 검토됨 → 확정)를 본다 (PRD v1.3 18.3 W04). 급여 담당 관리자만.
// 2026-10-26 의뢰인: 설명 카드·순서 안내를 걷어냈다 — 순서는 왼쪽 메뉴(① 사전 준비 → ② 급여대장 …)가 보여 준다.
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { ListHead, ListTable } from '@/components/listframe';
import { Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { getMe } from '@/lib/auth';
import { loadRuns } from '@/lib/payroll/run-data';
import { toKstDate } from '@/lib/time';
import { RunCreateButton } from './RunForms';

const TONE = { DRAFT: 'neutral', CALCULATED: 'info', REVIEWED: 'warn', FINALIZED: 'ok' } as const;

export default async function PayRunsPage({ searchParams }: { searchParams: Promise<{ live?: string; st?: string; new?: string }> }) {
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
      <ListHead title={t('title')} settingsHref="/admin/settings?tab=pay&section=ledger" settingsLabel={tf('item.payLedger')} actions={<RunCreateButton months={months} bonusMonths={recent} today={today} live={sp.live === '1'} defaultOpen={sp.new === '1'} />} />
      {practice && <p className="rounded-card border border-border bg-surface p-3 text-sm text-muted">{t('practice')}</p>}
      {runs.length === 0 ? (
        <p className="rounded-card border border-border bg-bg px-5 py-10 text-center text-sm text-muted">{t('emptyHint')}</p>
      ) : (
        <>
      {/* 상태별 거르기 — 카드 넷 대신 한 줄 탭 (2026-10-26 의뢰인: 카드 박스 배치가 어색하다) */}
      <nav aria-label={t('cardsTitle')} className="flex flex-wrap gap-1.5">
        {[{ k: null, label: t('all'), n: runs.length }, ...STATES.map((k) => ({ k, label: t(`status.${k}`), n: runs.filter((r) => r.status === k).length }))].map((x) => (
          <Link key={x.k ?? 'all'} href={stLink(x.k)} scroll={false} aria-current={st === x.k ? 'page' : undefined} className={`inline-flex min-h-9 items-center gap-1.5 rounded-chip px-3.5 text-sm font-semibold ${st === x.k ? 'bg-primary text-on-primary' : 'bg-surface text-muted hover:text-text'}`}>
            {x.label}
            <span className="num text-xs font-bold opacity-80">{x.n}</span>
          </Link>
        ))}
      </nav>
      <ListTable
        count={
          <>
            {t('count', { n: shown.length })}
          </>
        }
        head={['colMonth', 'colPayDate', 'colStatus', 'colMembers', 'colPay', 'colDeduction', 'colNet', 'colEmployer'].map((k, i) => ({ label: t(k), right: i >= 4 }))}
        empty={shown.length === 0 ? t('empty') : undefined}
      >
        {shown.map((r) => (
          <tr key={r.id} className="relative cursor-pointer hover:bg-primary-tint/50">
            <td className="num whitespace-nowrap">
              <Link href={`/admin/payroll/runs/${r.id}`} className="inline-flex items-center gap-1 rounded-button bg-primary-tint px-2.5 py-1 font-bold text-primary after:absolute after:inset-0 after:content-[''] hover:underline">
                {r.periodFrom.slice(0, 7)} ›
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
            {/* 폰 카드는 달 · 지급일 · 상태 · 대상 · 실지급만 — 지급 · 공제 · 사업주 부담은 대장을 열면 (2026-10-19 디자인: 대장마다 8줄) */}
            <td className="num text-right whitespace-nowrap max-lg:hidden!">{r.generationId && r.totals.pay ? won(r.totals.pay) : <span className="text-faint">–</span>}</td>
            <td className="num text-right whitespace-nowrap max-lg:hidden!">{r.generationId && r.totals.deduction ? won(r.totals.deduction) : <span className="text-faint">–</span>}</td>
            <td className="num text-right font-bold whitespace-nowrap">{r.generationId && r.totals.net ? won(r.totals.net) : <span className="text-faint">–</span>}</td>
            <td className="num text-right whitespace-nowrap max-lg:hidden!">{r.generationId && r.totals.employer ? won(r.totals.employer) : <span className="text-faint">–</span>}</td>
          </tr>
        ))}
      </ListTable>
        </>
      )}
    </PageShell>
  );
}
