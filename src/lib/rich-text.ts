// 서식 있는 본문(게시판 · 공지 · 업무 메시지, 2026-10-16 의뢰인) — 저장 전에 거른다. 순수함수.
// ★ 화면에서 보낸 HTML을 믿지 않는다. 허용한 태그 · 속성만 남기고 나머지(스크립트 · 이벤트 · style 등)는 버린다.
// ★ 사진은 앱이 올린 것(/api/images/<id>)만 남긴다 — 바깥 주소 사진은 버린다(추적 · 깨진 사진 방지).
// 글자만 뽑은 본문(body)도 함께 만든다 — 검색 · 알림 · 번역 · 예전 화면은 이 글자를 쓴다.
import sanitizeHtml from 'sanitize-html';

export const IMAGE_SRC = /^\/api\/images\/[0-9a-f-]{36}$/i;
export const RICH_HTML_MAX = 200_000;
export const RICH_TEXT_MAX = 20_000;

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'hr', 'a', 'img'],
  allowedAttributes: { a: ['href', 'target', 'rel'], img: ['src', 'alt'] },
  allowedSchemes: ['https', 'http', 'mailto', 'tel'],
  allowedSchemesAppliedToAttributes: ['href'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  exclusiveFilter: (frame) => frame.tag === 'img' && !IMAGE_SRC.test(frame.attribs.src ?? ''),
  transformTags: {
    b: 'strong',
    i: 'em',
    a: (tagName, attribs) => ({ tagName, attribs: { href: attribs.href ?? '', target: '_blank', rel: 'noopener noreferrer' } }),
  },
};

/** 화면에서 받은 HTML → 저장할 HTML과 글자만 뽑은 본문. 사진만 있어도 비어 있지 않다 */
export function cleanRichHtml(input: unknown): { html: string; text: string; images: string[]; empty: boolean } {
  const raw = typeof input === 'string' ? input.slice(0, RICH_HTML_MAX * 2) : '';
  const html = sanitizeHtml(raw, OPTIONS).trim();
  const images = [...html.matchAll(/<img[^>]*src="\/api\/images\/([0-9a-f-]{36})"/gi)].map((m) => m[1].toLowerCase());
  const text = htmlToText(html);
  return { html, text, images, empty: text.length === 0 && images.length === 0 };
}

/** 글자만 — 문단 · 줄바꿈 · 목록은 줄로 남긴다 */
export function htmlToText(html: string): string {
  const withBreaks = html.replace(/<\/p>\s*<\/li>/gi, '</li>').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|h2|h3|li|blockquote)>/gi, '\n').replace(/<li>/gi, '· ').replace(/<img[^>]*>/gi, ' ');
  const plain = sanitizeHtml(withBreaks, { allowedTags: [], allowedAttributes: {} });
  return plain.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, RICH_TEXT_MAX);
}

/** 보여 줄 때 한 번 더 거른다(저장된 값도 믿지 않는다) */
export function safeRichHtml(html: string | null | undefined): string {
  return html ? sanitizeHtml(html, OPTIONS) : '';
}
