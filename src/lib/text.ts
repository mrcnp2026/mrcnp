// 직원이 쓰는 짧은 글(근무노트·사유) 정리: 줄바꿈은 두고 제어 문자는 뺀다. 화면은 텍스트로만 그린다 (HTML·링크 없음).
export function cleanText(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '').trim();
}
