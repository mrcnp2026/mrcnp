// 도움말 검색 — 통합 검색과 같은 규칙(부분 일치 · 낱말 일부 · 초성, lib/search)을 쓴다. 서버에서 한 번에 거른다.
import { matchLevel, snippet } from '@/lib/search';
import type { Article, Block, Faq } from './content';

export type ArticleHit = { kind: 'article'; level: 'exact' | 'related'; article: Article; excerpt: string };
export type FaqHit = { kind: 'faq'; level: 'exact' | 'related'; faq: Faq; excerpt: string };

const blockText = (b: Block): string => (b.t === 'steps' || b.t === 'list' ? b.items.join(' ') : b.text);
/** 글 한 편의 본문 전체(제목 · 요약 · 소제목 · 내용) — 검색과 발췌에 쓴다 */
export const articleText = (a: Article): string => [a.title, a.summary, ...a.sections.flatMap((s) => [s.title, ...s.blocks.map(blockText)])].join(' ');

export function searchHelp(q: string, articles: readonly Article[], faqs: readonly Faq[]): { articles: ArticleHit[]; faqs: FaqHit[] } {
  const text = q.trim();
  if (!text) return { articles: [], faqs: [] };
  const rank = (a: { level: 'exact' | 'related' }, b: { level: 'exact' | 'related' }) => (a.level === b.level ? 0 : a.level === 'exact' ? -1 : 1);
  const aHits: ArticleHit[] = [];
  for (const a of articles) {
    const level = matchLevel(text, [a.title, a.summary, articleText(a)]);
    if (level) aHits.push({ kind: 'article', level, article: a, excerpt: snippet(articleText(a), text) });
  }
  const fHits: FaqHit[] = [];
  for (const f of faqs) {
    const level = matchLevel(text, [f.q, f.a]);
    if (level) fHits.push({ kind: 'faq', level, faq: f, excerpt: snippet(f.a, text) });
  }
  return { articles: aHits.sort(rank), faqs: fHits.sort(rank) };
}

/** 글 안의 [대괄호] 단추 · 메뉴 이름을 굵게 보이려고 조각으로 나눈다 */
export function pieces(text: string): { text: string; bold: boolean }[] {
  return text.split(/(\[[^\]]+\])/g).filter((x) => x !== '').map((x) => ({ text: x, bold: /^\[[^\]]+\]$/.test(x) }));
}
