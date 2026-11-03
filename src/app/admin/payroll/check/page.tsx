// 급여 점검 (결정 급여-68, 2026-11-03 의뢰인) — 근태 마감 다음, 급여대장 만들기 전.
// 이번 달 근태 기록으로 급여대장과 같은 엔진이 미리 계산하고(아무것도 저장하지 않는다), 계산 세부의 이상한 점만 점검 항목으로 띄운다.
// 항목을 누르면 근거(날짜 · 시간 · 금액)를 보고 그 자리에서 정산에 어떻게 반영할지 고른다. 모두 처리해야 급여대장을 만든다.
// 지난달과 다른 것은 이슈가 아니다 — 「비교 · 교차 분석」 탭은 참고용이고 처리할 것이 없다.
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Card, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { getMe } from '@/lib/auth';
import { buildPayCheck, lastMonthParts, loadDecisions, type CheckItem, type Parts } from '@/lib/payroll/check';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';
import { CheckItemRow, type ItemView } from './CheckForms';

export const maxDuration = 60;

export default async function PayCheckPage({ searchParams }: { searchParams: Promise<{ m?: string; live?: string; tab?: string }> }) {
  const [t, tb, f, me, sp] = await Promise.all([getTranslations('payCheck'), getTranslations('admin.payRuns.blocker'), getFormatter(), getMe(), searchParams]);
  if (!me || me.role !== 'admin' || !me.canViewPayroll) return <PageShell><p className="rounded-card bg-warn-tint p-4 text-sm text-warn">{t('forbidden')}</p></PageShell>;
  const practice = OFFICE.practiceMode && sp.live !== '1';
  const live = sp.live === '1';
  const today = toKstDate(new Date());
  const monthOf = (back: number) => new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - back, 1)).toISOString().slice(0, 7);
  const months = [monthOf(2), monthOf(1), monthOf(0)];
  const ym = /^\d{4}-\d{2}$/.test(sp.m ?? '') ? (sp.m as string) : months[1];
  const tab = sp.tab === 'compare' ? 'compare' : 'check';
  const q = (o: Record<string, string>) => `/admin/payroll/check?${new URLSearchParams({ m: ym, ...(live ? { live: '1' } : {}), ...o })}`;

  const [check, decisions, last] = await Promise.all([buildPayCheck(ym, practice), loadDecisions(ym, practice), lastMonthParts(ym, practice)]);
  const deciders = [...new Set([...decisions.values()].flatMap((m) => [...m.values()].map((d) => d.by)))];
  const { data: who } = deciders.length ? await createAdminClient().from('profiles').select('id, name').in('id', deciders) : { data: [] };
  const nameOf = new Map((who ?? []).map((p) => [p.id as string, p.name as string]));
  const won = (n: number | null) => (n === null ? '—' : `${f.number(n)}${t('won')}`);
  const lv = live ? '&live=1' : '';

  // 항목 → 화면 (제목 · 근거 · 고칠 곳)
  const has = (k: string) => tb.has(k);
  const view = (pid: string, it: CheckItem): ItemView => {
    const v = it.values ?? {};
    const what = String(v.what ?? '');
    const title =
      it.code === 'blocked' ? (t.has(`what.${what}`) ? t('item.blocked', { what: t(`what.${what}`) }) : t('item.blockedPlain'))
      : it.code === 'warning' ? (t.has(`what.${what}`) ? t(`what.${what}`) : what)
      : t(`item.${it.code}`, v);
    const evidence: string[] = [];
    if ((it.code === 'blocked' || it.code === 'warning') && has(what)) evidence.push(tb(what, { detail: String(v.detail ?? '') }));
    else if (it.code === 'blocked' || it.code === 'warning') evidence.push(t('ev.unknown', { what, detail: String(v.detail ?? '') }));
    else if (t.has(`ev.${it.code}`)) evidence.push(t(`ev.${it.code}`, v));
    const fixHref =
      it.fix === 'closing' ? `/admin/closing?m=${ym}${lv}`
      : it.fix === 'staff' ? `/admin/payroll/staff/${pid}${it.code.startsWith('contract') ? '#contract' : ''}`
      : it.fix === 'inbox' ? '/admin/inbox'
      : it.fix === 'leave' ? `/admin/records/${pid}?m=${ym}&f=leave${lv}#days`
      : it.fix === 'records' ? `/admin/records/${pid}?m=${ym}${lv}` : null;
    const d = decisions.get(pid)?.get(it.key) ?? null;
    return {
      key: it.key, title, evidence, must: it.level === 'must_fix',
      dates: (it.dates ?? []).map((date) => ({ date, href: `/admin/records/${pid}/${date}${live ? '?live=1' : ''}` })),
      fixHref, fixLabel: it.fix ? t(`fix.${it.fix}`) : null,
      decided: d ? { decision: d.decision, note: d.note, by: nameOf.get(d.by) ?? '', at: d.at } : null,
    };
  };
  const rows = check.people.map((p) => ({ p, items: p.items.map((it) => view(p.employeeId, it)) }));
  const open = rows.filter((r) => r.items.some((i) => !i.decided));
  const settled = rows.filter((r) => r.items.length > 0 && r.items.every((i) => i.decided));
  const clean = rows.filter((r) => r.items.length === 0);
  const totalItems = rows.reduce((a, r) => a + r.items.length, 0);
  const doneItems = rows.reduce((a, r) => a + r.items.filter((i) => i.decided).length, 0);
  const allClosed = check.closed >= check.total && check.total > 0;
  const ready = allClosed && open.length === 0;
  const payTotal = check.people.reduce((a, p) => a + (p.pay ?? 0), 0);
  const lastTotal = [...last.parts.values()].reduce((a, x) => a + x.base + x.overtime + x.allowance - x.cut, 0);

  const person = (r: (typeof rows)[number]) => (
    <Card key={r.p.employeeId} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <Link href={`/admin/records/${r.p.employeeId}?m=${ym}${lv}`} className="font-bold hover:underline">{r.p.name}<span className="ml-2 text-xs font-normal text-muted">{r.p.group ?? ''}</span></Link>
        <span className="num text-sm text-muted">{r.p.state === 'OK' ? t('netLine', { pay: won(r.p.pay), net: won(r.p.net) }) : t('notCalculated')}</span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {r.items.map((i) => <CheckItemRow key={i.key} month={ym} employeeId={r.p.employeeId} item={i} live={live} />)}
      </ul>
    </Card>
  );

  return (
    <PageShell wide>
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <nav className="flex gap-1.5" aria-label={t('month')}>
          {months.map((m) => (
            <Link key={m} href={`/admin/payroll/check?m=${m}${lv}${tab === 'compare' ? '&tab=compare' : ''}`} aria-current={m === ym ? 'page' : undefined} className={`num inline-flex min-h-11 items-center rounded-button border px-3 text-sm font-semibold lg:min-h-9 ${m === ym ? 'border-primary bg-primary-tint text-primary' : 'border-border bg-bg text-muted'}`}>{m}</Link>
          ))}
        </nav>
      </div>

      {/* 흐름: 근태 마감 → 점검 처리 → 급여대장 */}
      <Card className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <ol className="grid flex-1 grid-cols-3 gap-2 text-center text-sm">
          <li className={`rounded-button px-2 py-2 ${allClosed ? 'bg-ok-tint text-ok' : 'bg-warn-tint text-warn'}`}>
            <Link href={`/admin/closing?m=${ym}${lv}`} className="flex flex-col"><span className="text-xs">{t('step1')}</span><b className="num">{check.closed} / {check.total}</b></Link>
          </li>
          <li className={`rounded-button px-2 py-2 ${open.length === 0 ? 'bg-ok-tint text-ok' : 'bg-warn-tint text-warn'}`}>
            <span className="flex flex-col"><span className="text-xs">{t('step2')}</span><b className="num">{doneItems} / {totalItems}</b></span>
          </li>
          <li className="rounded-button bg-surface px-2 py-2 text-muted"><span className="flex flex-col"><span className="text-xs">{t('step3')}</span><b className="num">{won(payTotal)}</b></span></li>
        </ol>
        {ready ? (
          <Link href={`/admin/payroll/runs?new=1${lv}`} className="inline-flex min-h-12 items-center justify-center rounded-button bg-primary px-5 font-bold text-on-primary">{t('next')} ›</Link>
        ) : (
          <p className="text-sm text-muted lg:max-w-64">{!allClosed ? t('waitClose') : t('waitItems', { n: open.length })}</p>
        )}
      </Card>
      {check.globalNotes.length > 0 && (
        <p className="px-1 text-xs text-faint">{check.globalNotes.map((g) => t(`global.${g.code}`, { n: g.n })).join(' · ')}</p>
      )}

      <nav className="flex gap-1 border-b border-border" aria-label={t('tabs')}>
        {(['check', 'compare'] as const).map((k) => (
          <Link key={k} href={q(k === 'compare' ? { tab: 'compare' } : {})} aria-current={tab === k ? 'page' : undefined} className={`-mb-px inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-bold ${tab === k ? 'border-primary text-primary' : 'border-transparent text-muted'}`}>
            {t(`tab.${k}`)}{k === 'check' && open.length > 0 && <span className="num ml-1.5 rounded-chip bg-warn-tint px-1.5 text-xs text-warn">{open.length}</span>}
          </Link>
        ))}
      </nav>

      {tab === 'check' ? (
        <>
          {open.length === 0 && totalItems === 0 && <p className="rounded-card bg-ok-tint p-4 text-sm font-semibold text-ok">{t('nothing')}</p>}
          <div className="grid gap-3 lg:grid-cols-2">{open.map(person)}</div>
          {settled.length > 0 && (
            <details className="group rounded-card border border-border bg-bg">
              <summary className="flex min-h-11 cursor-pointer items-center justify-between px-4 text-sm font-bold [&::-webkit-details-marker]:hidden">{t('settledGroup', { n: settled.length })}<span className="text-xs font-normal text-muted">{t('showAll')}</span></summary>
              <div className="grid gap-3 border-t border-border p-3 lg:grid-cols-2">{settled.map(person)}</div>
            </details>
          )}
          {clean.length > 0 && (
            <details className="group rounded-card border border-border bg-bg">
              <summary className="flex min-h-11 cursor-pointer items-center justify-between px-4 text-sm font-bold [&::-webkit-details-marker]:hidden">{t('cleanGroup', { n: clean.length })}<span className="text-xs font-normal text-muted">{t('showAll')}</span></summary>
              <ul className="flex flex-col divide-y divide-border border-t border-border text-sm">
                {clean.map((r) => (
                  <li key={r.p.employeeId} className="flex items-center justify-between gap-2 px-4 py-2.5">
                    <span className="font-semibold">{r.p.name}<span className="ml-2 text-xs font-normal text-muted">{r.p.group ?? ''}</span></span>
                    <span className="num text-muted">{won(r.p.net)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {ready && lastTotal > 0 && (
            <p className="rounded-card bg-surface p-3 text-sm text-muted">{t('vsLast', { month: last.month, total: won(payTotal), diff: `${payTotal >= lastTotal ? '+' : ''}${f.number(Math.round(((payTotal - lastTotal) / lastTotal) * 1000) / 10)}%` })}</p>
          )}
        </>
      ) : (
        <CompareTab rows={check.people} last={last} won={won} t={t} f={f} ym={ym} lv={lv} />
      )}
    </PageShell>
  );
}

/** 비교 · 교차 분석 (참고) — 칸별로 지난달과 · 같은 지점 평균과. 경고 · 처리 단추는 없다 */
function CompareTab({ rows, last, won, t, f, ym, lv }: { rows: Awaited<ReturnType<typeof buildPayCheck>>['people']; last: { month: string; parts: Map<string, Parts> }; won: (n: number | null) => string; t: Awaited<ReturnType<typeof getTranslations<'payCheck'>>>; f: Awaited<ReturnType<typeof getFormatter>>; ym: string; lv: string }) {
  const KEYS = ['base', 'overtime', 'allowance', 'cut', 'deduction', 'net'] as const;
  const groupAvg = new Map<string, number>();
  for (const g of new Set(rows.map((r) => r.groupId ?? ''))) {
    const xs = rows.filter((r) => (r.groupId ?? '') === g).map((r) => r.overtimeHours);
    groupAvg.set(g, xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  }
  const diff = (a: number, b: number | undefined) => (b === undefined ? '' : `${a - b >= 0 ? '+' : ''}${f.number(a - b)}`);
  const shown = rows.filter((r) => r.parts);
  return (
    <div className="flex flex-col gap-3">
      <p className="px-1 text-sm text-muted">{t('compareIntro', { month: last.month, has: last.parts.size > 0 ? 'yes' : 'no' })}</p>
      {/* PC: 표 */}
      <div className="hidden overflow-x-auto rounded-card border border-border bg-bg lg:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-faint">
              <th className="px-3 py-2">{t('c.name')}</th>
              {KEYS.map((k) => <th key={k} className="px-3 py-2 text-right">{t(`c.${k}`)}</th>)}
              <th className="px-3 py-2 text-right">{t('c.ot')}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const prev = last.parts.get(r.employeeId);
              const avg = groupAvg.get(r.groupId ?? '') ?? 0;
              return (
                <tr key={r.employeeId} className="border-b border-border last:border-0">
                  <td className="px-3 py-2"><Link href={`/admin/records/${r.employeeId}?m=${ym}${lv}`} className="font-semibold hover:underline">{r.name}</Link><span className="block text-xs text-muted">{r.group ?? ''}</span></td>
                  {KEYS.map((k) => (
                    <td key={k} className="num px-3 py-2 text-right">
                      {f.number(r.parts![k])}
                      {prev && <span className="block text-xs text-faint">{diff(r.parts![k], prev[k])}</span>}
                    </td>
                  ))}
                  <td className="num px-3 py-2 text-right">{r.overtimeHours}h<span className="block text-xs text-faint">{t('c.avg', { h: Math.round(avg * 10) / 10 })}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* 폰: 사람마다 카드 — 지급 · 연장 · 실지급만 크게, 나머지는 한 줄 */}
      <ul className="flex flex-col gap-2 lg:hidden">
        {shown.map((r) => {
          const prev = last.parts.get(r.employeeId);
          const avg = groupAvg.get(r.groupId ?? '') ?? 0;
          return (
            <li key={r.employeeId} className="rounded-card border border-border bg-bg p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-bold">{r.name}<span className="ml-2 text-xs font-normal text-muted">{r.group ?? ''}</span></span>
                <span className="num font-bold">{won(r.parts!.net)}</span>
              </div>
              {prev && <p className="num text-xs text-faint">{t('c.netVs', { d: diff(r.parts!.net, prev.net) })}</p>}
              <dl className="num mt-2 grid grid-cols-3 gap-1 text-xs">
                {(['base', 'overtime', 'deduction'] as const).map((k) => (
                  <div key={k} className="rounded-button bg-surface px-2 py-1.5"><dt className="text-faint">{t(`c.${k}`)}</dt><dd className="font-semibold text-text">{f.number(r.parts![k])}</dd>{prev && <dd className="text-faint">{diff(r.parts![k], prev[k])}</dd>}</div>
                ))}
              </dl>
              <p className="mt-1 text-xs text-muted">{t('c.otLine', { h: r.overtimeHours, avg: Math.round(avg * 10) / 10 })}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
