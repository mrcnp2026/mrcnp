// 도움말 센터 (2026-10-26 의뢰인: 다우오피스 서비스 가이드를 보고 PC 화면 기준으로 · 직원용 + 관리자용, 다우오피스를 전부 따라 만들 필요는 없다).
// 구성: 왼쪽 차례 · 가운데 글 · 오른쪽 이 글의 차례(넓은 화면). 처음 화면 · 글 · 자주 묻는 질문 · 검색 결과 네 가지 보기.
// 내용은 lib/help/content.ts 한 곳에 있고 이 파일에는 문장이 없다(화면 틀 글자는 messages의 help 열쇠).
import { AlertTriangle, ChevronRight, Info } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { ARTICLES, articleById, FAQS, GROUPS, type Article, type Block, type Faq } from '@/lib/help/content';
import { pieces, searchHelp } from '@/lib/help/search';
import { Card, Chip, PageShell } from './ui';
import { LiveSearchInput } from './LiveSearchInput';

type Base = '/admin' | '/punch';
type Params = { a?: string; v?: string; q?: string };
type Tr = Awaited<ReturnType<typeof getTranslations>>;

const link = (base: Base, p: Params = {}) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v) q.set(k, v);
  const s = q.toString();
  return `${base}/help${s ? `?${s}` : ''}`;
};

/** [대괄호]로 적은 단추 · 메뉴 이름은 굵게 */
function Rich({ text }: { text: string }) {
  return (
    <>
      {pieces(text).map((x, i) => (x.bold ? <b key={i} className="font-semibold text-text">{x.text}</b> : <span key={i}>{x.text}</span>))}
    </>
  );
}

function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="flex flex-col gap-3">
      {blocks.map((b, i) => {
        if (b.t === 'p') return <p key={i} className="text-sm leading-7 text-text"><Rich text={b.text} /></p>;
        if (b.t === 'list') {
          return (
            <ul key={i} className="flex list-disc flex-col gap-1.5 pl-5 text-sm leading-7 text-text">
              {b.items.map((x, j) => <li key={j}><Rich text={x} /></li>)}
            </ul>
          );
        }
        if (b.t === 'steps') {
          return (
            <ol key={i} className="flex flex-col gap-2.5">
              {b.items.map((x, j) => (
                <li key={j} className="flex gap-3 text-sm leading-7 text-text">
                  <span className="num mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-chip bg-primary-tint text-xs font-bold text-primary">{j + 1}</span>
                  <span className="min-w-0"><Rich text={x} /></span>
                </li>
              ))}
            </ol>
          );
        }
        const warn = b.tone === 'warn';
        const Icon = warn ? AlertTriangle : Info;
        return (
          <div key={i} className={`flex gap-2.5 rounded-button border px-4 py-3 text-sm leading-6 ${warn ? 'border-warn/30 bg-warn-tint text-text' : 'border-primary/25 bg-bg/70 text-muted'}`}>
            <Icon aria-hidden size={16} strokeWidth={1.75} className={`mt-1 shrink-0 ${warn ? 'text-warn' : 'text-primary'}`} />
            <p className="min-w-0"><Rich text={b.text} /></p>
          </div>
        );
      })}
    </div>
  );
}

function FaqItem({ f, base, t, showWho }: { f: Faq; base: Base; t: Tr; showWho: boolean }) {
  const art = f.article ? articleById(f.article) : undefined;
  return (
    <details className="group rounded-button border border-border bg-bg px-4 py-3">
      <summary className="flex cursor-pointer list-none items-start gap-2 text-sm font-semibold text-text">
        <ChevronRight aria-hidden size={16} strokeWidth={1.75} className="mt-1 shrink-0 text-muted transition-transform group-open:rotate-90" />
        <span className="min-w-0 flex-1">{f.q}</span>
        {showWho && <Chip tone={f.audience === 'admin' ? 'info' : 'neutral'}>{t(f.audience === 'admin' ? 'audAdmin' : 'audStaff')}</Chip>}
      </summary>
      <div className="mt-2 flex flex-col gap-2 pl-6 text-sm leading-7 text-muted">
        <p><Rich text={f.a} /></p>
        {art && <Link href={link(base, { a: art.id })} className="w-fit font-medium text-primary hover:underline">{t('seeArticle')}</Link>}
      </div>
    </details>
  );
}

export async function HelpCenter({ base, isAdmin, searchParams }: { base: Base; isAdmin: boolean; searchParams: Promise<Params> }) {
  const [t, sp, locale] = await Promise.all([getTranslations('help'), searchParams, getLocale()]);
  const articles = ARTICLES.filter((a) => isAdmin || a.audience === 'staff');
  const faqs = FAQS.filter((f) => isAdmin || f.audience === 'staff');
  const groups = GROUPS.filter((g) => isAdmin || g.audience === 'staff');
  const q = (sp.q ?? '').trim();
  const art: Article | undefined = !q && sp.a ? articles.find((a) => a.id === sp.a) : undefined;
  const view: 'search' | 'article' | 'faq' | 'home' = q ? 'search' : art ? 'article' : sp.v === 'faq' ? 'faq' : 'home';
  const found = view === 'search' ? searchHelp(q, articles, faqs) : null;
  const groupOf = (id: string) => groups.find((g) => g.id === id);

  return (
    <PageShell wide>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted">{t('intro')}</p>
        </div>
        <div className="w-full max-w-md">
          <LiveSearchInput initial={q} placeholder={t('search')} />
        </div>
      </div>
      {locale !== 'ko' && <p className="rounded-button border border-border bg-surface px-3 py-2 text-xs text-muted">{t('langNote')}</p>}

      <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)] xl:grid-cols-[14rem_minmax(0,1fr)_12rem]">
        {/* 왼쪽 차례 */}
        <nav aria-label={t('navLabel')} className="flex flex-col gap-4 text-sm lg:sticky lg:top-20 lg:self-start">
          <Link href={link(base)} aria-current={view === 'home' ? 'page' : undefined} className={`rounded-button px-3 py-1.5 font-semibold ${view === 'home' ? 'bg-primary-tint text-primary' : 'text-text hover:bg-surface'}`}>{t('home')}</Link>
          {groups.map((g) => (
            <div key={g.id} className="flex flex-col gap-0.5">
              <p className="px-3 pb-1 text-xs font-bold tracking-wide text-faint">{g.title}</p>
              {articles.filter((a) => a.group === g.id).map((a) => (
                <Link key={a.id} href={link(base, { a: a.id })} aria-current={art?.id === a.id ? 'page' : undefined} className={`rounded-button px-3 py-1.5 ${art?.id === a.id ? 'bg-primary-tint font-semibold text-primary' : 'text-muted hover:bg-surface hover:text-text'}`}>{a.title}</Link>
              ))}
            </div>
          ))}
          <Link href={link(base, { v: 'faq' })} aria-current={view === 'faq' ? 'page' : undefined} className={`rounded-button px-3 py-1.5 font-semibold ${view === 'faq' ? 'bg-primary-tint text-primary' : 'text-text hover:bg-surface'}`}>{t('faq')}</Link>
        </nav>

        {/* 가운데 */}
        <div className="flex min-w-0 flex-col gap-4">
          {view === 'home' && (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                {groups.map((g) => (
                  <Card key={g.id} className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-base font-bold">{g.title}</h2>
                      <Chip tone={g.audience === 'admin' ? 'info' : 'neutral'}>{t(g.audience === 'admin' ? 'audAdmin' : 'audStaff')}</Chip>
                    </div>
                    <ul className="flex flex-col gap-1 text-sm">
                      {articles.filter((a) => a.group === g.id).map((a) => (
                        <li key={a.id}><Link href={link(base, { a: a.id })} className="text-text hover:text-primary hover:underline">{a.title}</Link></li>
                      ))}
                    </ul>
                  </Card>
                ))}
              </div>
              <section className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-base font-bold">{t('faq')}</h2>
                  <Link href={link(base, { v: 'faq' })} className="text-sm font-medium text-primary hover:underline">{t('seeAll')}</Link>
                </div>
                {faqs.slice(0, 5).map((f) => <FaqItem key={f.id} f={f} base={base} t={t} showWho={isAdmin} />)}
              </section>
            </>
          )}

          {view === 'faq' && (
            <section className="flex flex-col gap-2">
              <h2 className="text-xl font-bold">{t('faq')}</h2>
              {faqs.map((f) => <FaqItem key={f.id} f={f} base={base} t={t} showWho={isAdmin} />)}
            </section>
          )}

          {view === 'search' && found && (
            <section className="flex flex-col gap-4">
              <h2 className="text-xl font-bold">{t('results', { q })}</h2>
              {found.articles.length === 0 && found.faqs.length === 0 && <p className="rounded-card border border-border bg-bg p-6 text-sm text-muted">{t('noResult', { q })}</p>}
              {found.articles.length > 0 && (
                <div className="flex flex-col gap-2">
                  <h3 className="text-sm font-bold text-muted">{t('articles')} <span className="num">{found.articles.length}</span></h3>
                  {found.articles.map((h) => (
                    <Link key={h.article.id} href={link(base, { a: h.article.id })} className="rounded-button border border-border bg-bg px-4 py-3 hover:bg-surface">
                      <span className="block text-sm font-semibold text-text">{h.article.title}</span>
                      <span className="mt-0.5 block text-xs text-faint">{groupOf(h.article.group)?.title}</span>
                      <span className="mt-1 block text-sm leading-6 text-muted">{h.excerpt}</span>
                    </Link>
                  ))}
                </div>
              )}
              {found.faqs.length > 0 && (
                <div className="flex flex-col gap-2">
                  <h3 className="text-sm font-bold text-muted">{t('questions')} <span className="num">{found.faqs.length}</span></h3>
                  {found.faqs.map((h) => <FaqItem key={h.faq.id} f={h.faq} base={base} t={t} showWho={isAdmin} />)}
                </div>
              )}
            </section>
          )}

          {view === 'article' && art && (
            <article className="flex flex-col gap-6">
              <header className="flex flex-col gap-2 border-b border-border pb-4">
                <p className="flex flex-wrap items-center gap-1 text-xs text-faint">
                  <Link href={link(base)} className="hover:text-primary hover:underline">{t('title')}</Link>
                  <ChevronRight aria-hidden size={12} />
                  <span>{groupOf(art.group)?.title}</span>
                </p>
                <h2 className="text-2xl font-bold">{art.title}</h2>
                <p className="text-sm leading-6 text-muted">{art.summary}</p>
                <p className="text-xs text-faint">{t('updated', { date: art.updated })}</p>
              </header>
              {art.sections.map((s) => (
                <section key={s.id} id={`s-${s.id}`} className="flex scroll-mt-20 flex-col gap-3">
                  <h3 className="text-lg font-bold">{s.title}</h3>
                  <Blocks blocks={s.blocks} />
                </section>
              ))}
              {art.related && art.related.length > 0 && (
                <section className="flex flex-col gap-2 border-t border-border pt-4">
                  <h3 className="text-sm font-bold text-muted">{t('related')}</h3>
                  <ul className="flex flex-col gap-1 text-sm">
                    {art.related.map((id) => articleById(id)).filter((x): x is Article => !!x && articles.some((a) => a.id === x.id)).map((r) => (
                      <li key={r.id}><Link href={link(base, { a: r.id })} className="text-primary hover:underline">{r.title}</Link></li>
                    ))}
                  </ul>
                </section>
              )}
            </article>
          )}

          <Card className="flex flex-col gap-1">
            <h2 className="text-sm font-bold">{t('moreHelp')}</h2>
            <p className="text-sm text-muted">{t('moreHelpBody')}</p>
            <Link href={`${base}/messages`} className="mt-1 w-fit rounded-button border border-border bg-bg px-3 py-1.5 text-sm font-medium text-text hover:bg-surface">{t('moreHelpLink')}</Link>
          </Card>
        </div>

        {/* 오른쪽 이 글의 차례 (넓은 화면, 글 보기에서만) */}
        {view === 'article' && art ? (
          <aside aria-label={t('toc')} className="hidden xl:sticky xl:top-20 xl:block xl:self-start">
            <p className="mb-2 text-xs font-bold tracking-wide text-faint">{t('toc')}</p>
            <ul className="flex flex-col gap-1.5 border-l border-border pl-3 text-sm">
              {art.sections.map((s) => <li key={s.id}><a href={`#s-${s.id}`} className="text-muted hover:text-primary">{s.title}</a></li>)}
            </ul>
          </aside>
        ) : (
          <span className="hidden xl:block" />
        )}
      </div>
    </PageShell>
  );
}
