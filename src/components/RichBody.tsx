// 서식 있는 본문 보이기 (게시판 · 공지 · 업무 메시지). 저장할 때 거른 HTML을 보일 때 한 번 더 거른다(lib/rich-text).
// html이 없으면(예전 글) 글자 본문을 줄바꿈 · 링크만 살려 보인다(NoticeBody).
import { NoticeBody } from '@/components/NoticeBody';
import { safeRichHtml } from '@/lib/rich-text';

export function RichBody({ html, text, lang }: { html: string | null | undefined; text: string; lang?: string }) {
  const safe = safeRichHtml(html);
  if (!safe) return <NoticeBody text={text} lang={lang} />;
  return <div lang={lang} className="rich-body break-words" dangerouslySetInnerHTML={{ __html: safe }} />;
}
