// 통합 검색 결과 화면 — 관리자 모드(/admin/search) · 직원 모드(/punch/search)가 같이 쓴다 (2026-10-14 의뢰인: 다우오피스 위쪽 검색, `스샷/스샷2/검색.png`).
// 위: 찾을 곳 고르기 + 찾을 말 · 종류별 탭(건수) · 「'말' 정확히 일치 n건」 + [관련결과 더보기]. 전체 탭은 종류마다 5건씩 카드로, 종류 탭은 전부.
import { Select } from '@/components/Select';
import { Banknote, Bell, ClipboardList, LayoutGrid, MessageSquare, Plane, Search, Users } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { HelpTip } from '@/components/Help';
import { LiveSearchInput } from '@/components/LiveSearchInput';
import { Button, PageShell } from '@/components/ui';
import { getMe } from '@/lib/auth';
import { SEARCH_KINDS, type SearchHit, type SearchKind } from '@/lib/search';
import { runSearch } from '@/lib/search-data';

const ICON: Record<SearchKind, typeof Search> = { menu: LayoutGrid, people: Users, requests: ClipboardList, leave: Plane, notices: Bell, messages: MessageSquare, pay: Banknote };
const PER_CARD = 5;
const isKind = (v: unknown): v is SearchKind => (SEARCH_KINDS as readonly unknown[]).includes(v);

export async function SearchPage({ base, searchParams }: { base: '/admin' | '/punch'; searchParams: Promise<{ q?: string; s?: string; more?: string }> }) {
  const me = await getMe();
  if (!me) redirect('/login');
  const [t, sp] = await Promise.all([getTranslations('search'), searchParams]);
  const q = (sp.q ?? '').trim();
  const scope = isKind(sp.s) ? sp.s : 'all';
  // 비슷한 결과(낱말 일부 · 초성)도 처음부터 함께 — 정확히 맞는 것 다음에 (2026-10-22 의뢰인). 「정확히 일치만」을 고르면 more=0
  const more = sp.more !== '0';
  const r = await runSearch(me, q);
  const shown = (k: SearchKind) => r.counts[k].exact + (more ? r.counts[k].related : 0);
  const hits = r.hits.filter((h) => (more || h.level === 'exact') && (scope === 'all' || h.kind === scope));
  const total = SEARCH_KINDS.reduce((a, k) => a + shown(k), 0);
  const exactTotal = SEARCH_KINDS.reduce((a, k) => a + (scope === 'all' || scope === k ? r.counts[k].exact : 0), 0);
  const relatedTotal = SEARCH_KINDS.reduce((a, k) => a + (scope === 'all' || scope === k ? r.counts[k].related : 0), 0);
  const link = (over: Partial<{ s: string; more: boolean }>) => {
    const p = new URLSearchParams({ q });
    const s = over.s ?? scope;
    if (s !== 'all') p.set('s', s);
    if (!(over.more ?? more)) p.set('more', '0');
    return `${base}/search?${p.toString()}`;
  };
  const field = 'h-10 rounded-button border border-border bg-bg px-3 text-sm';

  const Hit = ({ h }: { h: SearchHit }) => (
    <li className="border-b border-border py-3 last:border-b-0">
      <p className="flex items-center gap-1.5 text-xs text-faint">
        <span>{t(`kind.${h.kind}`)}</span>
        <span aria-hidden>›</span>
        <span className="truncate">{h.where}</span>
        {h.level === 'related' && <span className="ml-1 rounded-chip bg-surface px-1.5 text-faint">{t('relatedChip')}</span>}
      </p>
      <Link href={h.href} className="mt-0.5 block font-bold text-primary hover:underline">
        {h.title}
      </Link>
      {h.body && <p className="mt-0.5 line-clamp-2 text-sm text-muted">{h.body}</p>}
      {h.date && <p className="num mt-0.5 text-xs text-faint">{h.date}</p>}
    </li>
  );

  return (
    <PageShell wide>
      <h1 className="flex items-center gap-1 text-2xl font-bold">
        {t('title')}
        <HelpTip>{t('intro')}</HelpTip>
      </h1>
      <form action={`${base}/search`} role="search" className="flex flex-wrap items-center gap-2">
        <Select name="s" defaultValue={scope} aria-label={t('scope')} className={field}>
          <option value="all">{t('all')}</option>
          {SEARCH_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`kind.${k}`)}
            </option>
          ))}
        </Select>
        <LiveSearchInput key={scope} initial={q} placeholder={t('placeholder')} />
        {!more && <input type="hidden" name="more" value="0" />}
        <Button type="submit" size="md">
          {t('submit')}
        </Button>
      </form>

      {!q ? (
        <p className="rounded-card border border-border bg-bg p-6 text-center text-sm text-faint">{t('empty')}</p>
      ) : (
        <>
          <nav aria-label={t('scope')} className="flex flex-wrap gap-2">
            {(['all', ...SEARCH_KINDS.filter((k) => shown(k) > 0 || scope === k)] as const).map((k) => {
              const n = k === 'all' ? total : shown(k);
              const on = scope === k;
              return (
                <Link key={k} href={link({ s: k })} aria-current={on ? 'page' : undefined} className={`inline-flex h-9 items-center rounded-chip border px-4 text-sm font-semibold ${on ? 'border-text bg-text text-bg' : 'border-border bg-bg text-text hover:bg-surface'}`}>
                  {k === 'all' ? t('all') : t(`kind.${k}`)}({n})
                </Link>
              );
            })}
          </nav>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <p>
              <span className="font-bold text-primary">{t('exact', { q, n: exactTotal })}</span>
              {more && relatedTotal > 0 && <span className="ml-2 text-muted">· {t('related', { n: relatedTotal })}</span>}
            </p>
            {(relatedTotal > 0 || more) && (
              <Link href={link({ more: !more })} className="inline-flex h-8 items-center rounded-button border border-border bg-bg px-3 text-xs font-semibold text-text hover:bg-surface">
                {more ? t('less') : `+ ${t('more')}`}
              </Link>
            )}
          </div>

          {hits.length === 0 ? (
            <p className="rounded-card border border-border bg-bg p-6 text-center text-sm text-faint">{more || relatedTotal === 0 ? t('none') : t('noneExact')}</p>
          ) : scope === 'all' ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {SEARCH_KINDS.filter((k) => hits.some((h) => h.kind === k)).map((k) => {
                const mine = hits.filter((h) => h.kind === k);
                const Icon = ICON[k];
                return (
                  <section key={k} className="rounded-card border border-border bg-bg px-5 py-4">
                    <h2 className="flex items-center gap-2 font-bold">
                      <Icon aria-hidden size={18} strokeWidth={1.75} className="text-primary" />
                      {t(`kind.${k}`)}
                      <span className="num text-sm font-normal text-faint">{mine.length}</span>
                    </h2>
                    <ul className="mt-1">
                      {mine.slice(0, PER_CARD).map((h, i) => (
                        <Hit key={`${h.href}${i}`} h={h} />
                      ))}
                    </ul>
                    {mine.length > PER_CARD && (
                      <Link href={link({ s: k })} className="mt-2 inline-flex min-h-9 items-center text-sm font-bold text-primary">
                        {t('seeAll', { kind: t(`kind.${k}`), n: mine.length })} ›
                      </Link>
                    )}
                  </section>
                );
              })}
            </div>
          ) : (
            <section className="rounded-card border border-border bg-bg px-5 py-2">
              <ul>
                {hits.map((h, i) => (
                  <Hit key={`${h.href}${i}`} h={h} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </PageShell>
  );
}
