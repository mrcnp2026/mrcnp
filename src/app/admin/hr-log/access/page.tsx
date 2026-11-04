// 이력 · 내역 › 접속 기록 (2026-10-29 남은 일 9-5, DB 묶음 40) — 최고관리자만, 읽기 전용. 탭 셋:
//   로그인(누가 언제 어디서 · 실패 · 막힘) · 내려받기(엑셀 · PDF — 개인정보가 든 파일) · 변경(누가 무엇을 고쳤나, audit_logs)
// 위에 「이번 달 점검함」 — 개인정보 안전성 확보조치 기준의 접속 기록 점검(월 1회 이상). 31일 넘게 안 했으면 경고.
// 최근 30일이 기본이고 90일 · 1년 · 2년(보관 기간)까지. 이름을 누르면 그 사람만. 폰은 카드, PC는 표.
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Pager, pageOf } from '@/components/Pager';
import { Chip, PageShell } from '@/components/ui';
import { getMe } from '@/lib/auth';
import { deviceLabel, loadChanges, loadDownloads, loadLoginEvents, type LoginResult } from '@/lib/access-log';
import { companyProfile } from '@/lib/company';
import { canViewLogs } from '@/lib/log-access';
import { createAdminClient } from '@/lib/supabase/admin';
import { ReviewButton } from './ReviewButton';
import { adminPage } from '@/lib/admin-gate';

export const dynamic = 'force-dynamic';
const RANGES = { '30': 30, '90': 90, '365': 365, '730': 730 } as const;
const TABS = ['login', 'download', 'change'] as const;
const RESULTS = ['OK', 'FAIL', 'THROTTLED'] as const;
const TONE = { OK: 'ok', FAIL: 'warn', THROTTLED: 'danger' } as const;
type Row = { key: string; when: string; who: string | null; cells: string[]; chip?: { tone: 'ok' | 'warn' | 'danger' | 'neutral' | 'info'; text: string } };

export default async function AccessLogPage({ searchParams }: { searchParams: Promise<{ d?: string; r?: string; p?: string; tab?: string; pg?: string }> }) {
  await adminPage(); // 관리 화면 이중 확인 (lib/admin-gate)
  const me = await getMe();
  if (!me || !(await canViewLogs(me))) notFound(); // 이상준 최고관리자 · 시스템관리자만 (2026-10-30)
  const [t, tc, f, sp, profile] = await Promise.all([getTranslations('admin.accessLog'), getTranslations('common'), getFormatter(), searchParams, companyProfile()]);
  const tab = (TABS as readonly string[]).includes(sp.tab ?? '') ? (sp.tab as (typeof TABS)[number]) : 'login';
  const days = RANGES[(sp.d ?? '30') as keyof typeof RANGES] ?? 30;
  const result = (RESULTS as readonly string[]).includes(sp.r ?? '') ? (sp.r as LoginResult) : null;
  const person = /^[0-9a-f-]{36}$/i.test(sp.p ?? '') ? sp.p! : null;
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const [{ data: people }, logins, downloads, changes] = await Promise.all([
    createAdminClient().from('profiles').select('id, name'),
    tab === 'login' ? loadLoginEvents({ since, employeeId: person, limit: 2000 }) : Promise.resolve({ rows: [], missing: false }),
    tab === 'download' ? loadDownloads(since, person) : Promise.resolve([]),
    tab === 'change' ? loadChanges(since, person) : Promise.resolve([]),
  ]);
  const who = new Map((people ?? []).map((p) => [p.id as string, p.name as string]));
  const name = (id: string | null) => (id ? who.get(id) ?? t('unknown') : t(tab === 'login' ? 'unknownId' : 'system')); // 변경 기록에서 사람이 없는 줄 = 앱이 스스로 한 일
  const at = (iso: string) => f.dateTime(new Date(iso), { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' });
  const href = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams({ ...(sp.tab ? { tab: sp.tab } : {}), ...(sp.d ? { d: sp.d } : {}), ...(result ? { r: result } : {}), ...(person ? { p: person } : {}) });
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) q.delete(k);
      else q.set(k, v);
    }
    const s = q.toString();
    return s ? `?${s}` : '?';
  };
  const label = (ns: string, k: string) => (t.has(`${ns}.${k}`) ? t(`${ns}.${k}`) : k.startsWith('list_') && t.has(`${ns}.list`) ? t(`${ns}.list`) : k);

  // 점검: 마지막 점검이 31일보다 오래됐으면 경고
  const last = profile.accessReviews?.[0] ?? null;
  const overdue = !last || Date.now() - Date.parse(last.at) > 31 * 86_400_000;

  const loginRows = result ? logins.rows.filter((r) => r.result === result) : logins.rows;
  const count = (k: LoginResult) => logins.rows.filter((r) => r.result === k).length;
  const rows: Row[] =
    tab === 'login'
      ? loginRows.map((r) => ({ key: `l${r.id}`, when: r.createdAt, who: r.employeeId, cells: [t(`method.${r.method}`), deviceLabel(r.userAgent), r.clientIp ?? '—'], chip: { tone: TONE[r.result], text: t(`result.${r.result}`) } }))
      : tab === 'download'
        ? downloads.map((r) => ({ key: `d${r.id}`, when: r.createdAt, who: r.actorId, cells: [label('kind', r.kind), r.fileName, r.purpose ?? ''] }))
        : changes.map((r) => ({ key: `c${r.id}`, when: r.createdAt, who: r.actorId, cells: [label('table', r.table), t(`action.${r.action}`), r.reason ?? ''] }));
  // 한 쪽에 50줄 (2026-10-29: 기록이 수백 줄이라 화면이 끝없이 길었다)
  const paged = pageOf(rows, sp.pg, 50);
  const cols = { login: ['method', 'device', 'ip'], download: ['kind', 'file', 'purpose'], change: ['table', 'action', 'reason'] }[tab];

  return (
    <PageShell wide>
      <div>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted">{t('intro')}</p>
      </div>
      {/* 월 1회 점검 */}
      <div className={`flex flex-wrap items-center gap-3 rounded-card border p-3 text-sm ${overdue ? 'border-warn bg-warn-tint' : 'border-border bg-bg'}`}>
        <span className={`min-w-0 flex-1 ${overdue ? 'font-bold text-warn' : 'text-muted'}`}>
          {last ? t('reviewLast', { date: at(last.at), name: name(last.by) }) : t('reviewNever')}
          {overdue && ` · ${t('reviewDue')}`}
        </span>
        <ReviewButton />
      </div>
      <nav className="flex border-b border-border">
        {TABS.map((k) => (
          <Link prefetch={false} key={k} href={href({ tab: k === 'login' ? null : k, r: null })} aria-current={tab === k ? 'page' : undefined} className={`flex min-h-11 flex-1 items-center justify-center border-b-2 px-2 text-sm font-bold whitespace-nowrap sm:flex-none sm:px-4 ${tab === k ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-text'}`}>
            {t(`tab.${k}`)}
          </Link>
        ))}
      </nav>
      {tab === 'login' && logins.missing ? (
        <p className="rounded-card bg-warn-tint p-4 text-sm text-warn">{t('missing')}</p>
      ) : (
        <>
          <nav className="flex flex-wrap gap-2" aria-label={t('range')}>
            {Object.keys(RANGES).map((d) => (
              <Link prefetch={false} key={d} href={href({ d: d === '30' ? null : d })} aria-current={String(days) === d ? 'true' : undefined} className={`inline-flex h-9 items-center rounded-button border px-3 text-sm font-bold ${String(days) === d ? 'border-primary bg-primary-tint text-primary' : 'border-border text-muted'}`}>
                {t(`d.${d}`)}
              </Link>
            ))}
            {person && (
              <Link prefetch={false} href={href({ p: null })} className="inline-flex h-9 items-center gap-1 rounded-button bg-surface px-3 text-sm font-bold">
                {name(person)} ✕
              </Link>
            )}
          </nav>
          {tab === 'login' && (
            <div className="grid grid-cols-3 gap-3">
              {RESULTS.map((k) => (
                <Link prefetch={false} key={k} href={href({ r: result === k ? null : k })} aria-current={result === k ? 'true' : undefined} className={`rounded-card border p-3 ${result === k ? 'border-primary bg-primary-tint' : 'border-border bg-bg'}`}>
                  <p className="text-xs text-muted">{t(`result.${k}`)}</p>
                  <p className={`num pt-1 text-xl font-bold ${k !== 'OK' && count(k) > 0 ? 'text-warn' : ''}`}>{t('count', { n: count(k) })}</p>
                </Link>
              ))}
            </div>
          )}
          {rows.length === 0 ? (
            <p className="rounded-card border border-border p-6 text-center text-sm text-faint">{t('empty')}</p>
          ) : (
            <>
              <div className="hidden overflow-x-auto rounded-card border border-border lg:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface text-left text-xs text-muted">
                      {['when', 'who', ...(tab === 'login' ? ['result'] : []), ...cols].map((c) => <th key={c} scope="col" className="px-3 py-2.5 font-semibold">{t(`c.${c}`)}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {paged.items.map((r) => (
                      <tr key={r.key} className="border-b border-border last:border-0">
                        <td className="num px-3 py-2.5 whitespace-nowrap">{at(r.when)}</td>
                        <td className="px-3 py-2.5">{r.who ? <Link prefetch={false} href={href({ p: r.who })} className="font-bold text-primary hover:underline">{name(r.who)}</Link> : <span className="text-muted">{name(null)}</span>}</td>
                        {r.chip && <td className="px-3 py-2.5"><Chip tone={r.chip.tone}>{r.chip.text}</Chip></td>}
                        {r.cells.map((c, i) => <td key={i} className="num max-w-80 truncate px-3 py-2.5 text-muted" title={c}>{c || '—'}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="flex flex-col divide-y divide-border rounded-card border border-border bg-bg lg:hidden">
                {paged.items.map((r) => (
                  <li key={r.key} className="flex flex-col gap-1 px-4 py-3 text-sm">
                    <span className="flex items-center gap-2">
                      <b className="min-w-0 flex-1 truncate">{name(r.who)}</b>
                      {r.chip && <Chip tone={r.chip.tone}>{r.chip.text}</Chip>}
                    </span>
                    <span className="num text-xs break-all text-muted">{[at(r.when), ...r.cells].filter(Boolean).join(' · ')}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <Pager page={paged.page} pages={paged.pages} param="pg" params={{ tab: sp.tab, d: sp.d, r: result ?? undefined, p: person ?? undefined }} label={tc('pages')} />
          <p className="text-xs text-faint">{t('note')}</p>
        </>
      )}
    </PageShell>
  );
}
