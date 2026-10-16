// 예전 글자 본문 → 편집기에 넣을 HTML (문단 · 줄바꿈만). 화면 쪽에서도 쓰므로 거르는 라이브러리를 부르지 않는다
export function textToHtml(text: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return text.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
}
