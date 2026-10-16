// 서버에서 이미 거른 HTML을 보여 준다 — 화면 쪽(클라이언트) 구성 요소용. ★ html은 반드시 서버의 safeRichHtml을 거친 값이어야 한다.
// html이 비어 있으면(예전 글 · 번역본) 글자 본문을 줄바꿈 · 링크만 살려 보인다.
import { NoticeBody } from '@/components/NoticeBody';

export function RichHtml({ html, text, lang }: { html?: string | null; text: string; lang?: string }) {
  if (!html) return <NoticeBody text={text} lang={lang} />;
  return <div lang={lang} className="rich-body break-words" dangerouslySetInnerHTML={{ __html: html }} />;
}
