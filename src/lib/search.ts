// 통합 검색의 맞추기 규칙 (2026-10-14 의뢰인: 다우오피스 위쪽 검색 — `스샷/스샷2/검색.png`). 순수함수.
// 「정확히 일치」 = 찾는 말이 통째로 들어 있다(대소문자 · 띄어쓰기 무시).
// 「관련결과」 = 통째로는 없지만 ① 띄어 쓴 낱말 가운데 하나가 들어 있거나 ② 한글 초성으로 맞는다(ㅎㄱㄷ → 홍길동).
export const SEARCH_KINDS = ['menu', 'people', 'requests', 'leave', 'notices', 'messages', 'pay'] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];
export type MatchLevel = 'exact' | 'related' | null;

const norm = (s: string) => s.normalize('NFC').toLowerCase().replace(/\s+/g, '');
const CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
/** 한글 글자를 초성으로 바꾼다(한글이 아닌 글자는 그대로) */
export function initials(s: string): string {
  let out = '';
  for (const ch of s.normalize('NFC')) {
    const c = ch.charCodeAt(0) - 0xac00;
    out += c >= 0 && c < 11172 ? CHO[Math.floor(c / 588)] : ch;
  }
  return out;
}
const onlyInitials = (s: string) => /^[ㄱ-ㅎ]+$/.test(s);

/** 한 글(여러 칸)이 찾는 말과 얼마나 맞는가 */
export function matchLevel(q: string, fields: readonly (string | null | undefined)[]): MatchLevel {
  const nq = norm(q);
  if (!nq) return null;
  const hay = fields.filter((x): x is string => !!x).map(norm);
  if (hay.some((h) => h.includes(nq))) return 'exact';
  const words = q.trim().split(/\s+/).map(norm).filter((w) => w.length >= 1);
  if (words.length > 1 && words.some((w) => hay.some((h) => h.includes(w)))) return 'related';
  if (onlyInitials(nq) && hay.some((h) => initials(h).includes(nq))) return 'related';
  return null;
}

/** 찾는 말이 들어 있는 부분 앞뒤를 잘라 보여 줄 한 줄(본문 미리 보기) */
export function snippet(text: string, q: string, width = 60): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const i = flat.toLowerCase().indexOf(q.trim().toLowerCase());
  if (i < 0 || flat.length <= width) return flat.length > width ? `${flat.slice(0, width)}…` : flat;
  const start = Math.max(0, i - Math.floor(width / 3));
  return `${start > 0 ? '…' : ''}${flat.slice(start, start + width)}${start + width < flat.length ? '…' : ''}`;
}

export type SearchHit = { kind: SearchKind; level: 'exact' | 'related'; title: string; where: string; body?: string; date?: string | null; href: string };
/** 정확히 일치한 것 먼저, 그 안에서는 날짜가 새것부터 */
export const sortHits = (a: SearchHit, b: SearchHit) => (a.level === b.level ? (b.date ?? '').localeCompare(a.date ?? '') : a.level === 'exact' ? -1 : 1);
