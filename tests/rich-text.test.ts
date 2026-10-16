// 서식 있는 본문 거르기 (게시판 · 공지 · 업무 메시지, 2026-10-16)
import { describe, expect, it } from 'vitest';
import { cleanRichHtml, htmlToText, safeRichHtml } from '@/lib/rich-text';
import { textToHtml } from '@/lib/rich-text-plain';

const IMG = '/api/images/0f8fad5b-d9cb-469f-a165-70867728950e';

describe('본문 거르기', () => {
  it('스크립트 · 이벤트 · style · iframe은 버린다', () => {
    const r = cleanRichHtml('<p onclick="alert(1)" style="color:red">안녕<script>alert(1)</script></p><iframe src="https://x"></iframe><img src="x" onerror="alert(1)">');
    expect(r.html).toBe('<p>안녕</p>');
    expect(r.html).not.toMatch(/script|onclick|style|iframe|onerror/);
  });
  it('javascript: 링크는 버리고, 링크는 새 창 · noopener로', () => {
    expect(cleanRichHtml('<p><a href="javascript:alert(1)">x</a></p>').html).toBe('<p><a target="_blank" rel="noopener noreferrer">x</a></p>');
    expect(cleanRichHtml('<p><a href="https://example.com">x</a></p>').html).toBe('<p><a href="https://example.com" target="_blank" rel="noopener noreferrer">x</a></p>');
  });
  it('앱이 올린 사진만 남긴다 — 바깥 주소 · data: 사진은 버린다', () => {
    const r = cleanRichHtml(`<p>a</p><img src="${IMG}" alt="x"><img src="https://evil.example/a.png"><img src="data:image/png;base64,AAAA">`);
    expect(r.images).toEqual(['0f8fad5b-d9cb-469f-a165-70867728950e']);
    expect(r.html).toBe(`<p>a</p><img src="${IMG}" alt="x" />`);
  });
  it('사진만 있어도 빈 글이 아니다, 아무것도 없으면 빈 글', () => {
    expect(cleanRichHtml(`<img src="${IMG}">`).empty).toBe(false);
    expect(cleanRichHtml('<p></p><p> </p>').empty).toBe(true);
  });
  it('허용한 서식(굵게 · 제목 · 목록 · 인용 · 구분선)은 남는다, b · i는 strong · em으로', () => {
    expect(cleanRichHtml('<h2>제목</h2><p><b>굵게</b> <i>기울임</i> <u>밑줄</u> <s>취소</s></p><ul><li><p>하나</p></li></ul><blockquote><p>인용</p></blockquote><hr>').html).toBe('<h2>제목</h2><p><strong>굵게</strong> <em>기울임</em> <u>밑줄</u> <s>취소</s></p><ul><li><p>하나</p></li></ul><blockquote><p>인용</p></blockquote><hr />');
  });
  it('글자만 뽑기 — 문단 · 목록은 줄로', () => {
    expect(htmlToText('<h2>회식 안내</h2><p>금요일 &amp; 토요일</p><ul><li><p>1공장</p></li><li><p>2공장</p></li></ul>')).toBe('회식 안내\n금요일 & 토요일\n· 1공장\n· 2공장');
  });
  it('보일 때 한 번 더 거른다', () => {
    expect(safeRichHtml('<p>a<script>x</script></p>')).toBe('<p>a</p>');
    expect(safeRichHtml(null)).toBe('');
  });
  it('예전 글자 본문 → 편집기 HTML (꺾쇠는 글자로)', () => {
    expect(textToHtml('첫 줄\n둘째 줄\n\n<b>새 문단</b>')).toBe('<p>첫 줄<br>둘째 줄</p><p>&lt;b&gt;새 문단&lt;/b&gt;</p>');
  });
});
