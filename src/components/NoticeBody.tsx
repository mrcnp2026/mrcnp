// 공지 본문 — 일반 텍스트. 줄바꿈만 살리고 https 주소만 링크로 (②-5 7-15 요점 8). HTML로 해석하지 않는다.
import { splitLinks } from '@/lib/notice-logic';

export function NoticeBody({ text, lang }: { text: string; lang?: string }) {
  return (
    <p lang={lang} className="text-base break-words whitespace-pre-line">
      {splitLinks(text).map((p, i) =>
        p.kind === 'link' ? (
          <a key={i} href={p.value} target="_blank" rel="noopener noreferrer" className="text-primary underline">
            {p.value}
          </a>
        ) : (
          <span key={i}>{p.value}</span>
        ),
      )}
    </p>
  );
}
