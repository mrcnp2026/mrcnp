// 이메일 아이디 규칙 (2026-10-16 의뢰인 권한-6: 이메일로 가입 · 로그인). 순수함수.
// 가입 화면의 도메인 고르기: 직접 입력이 기본, 네이버 · 지메일 등 자주 쓰는 곳을 고르면 채워진다.
export const EMAIL_DOMAINS = ['naver.com', 'gmail.com', 'daum.net', 'hanmail.net', 'kakao.com', 'nate.com', 'outlook.com'] as const;

const RE = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;

/** 정리한 이메일(소문자) — 틀리면 null */
export function cleanEmail(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  if (s.length > 254 || !RE.test(s) || s.includes('..')) return null;
  if (s.endsWith('.invalid')) return null; // 앱 안쪽 로그인 주소와 겹치지 않게
  return s;
}

/** 다음 사번 제안 — 숫자 사번 가운데 가장 큰 것 + 1(자릿수 유지). 숫자 사번이 없으면 null */
export function suggestEmployeeNo(existing: (string | null)[]): string | null {
  const nums = existing.filter((x): x is string => !!x && /^\d+$/.test(x));
  if (nums.length === 0) return null;
  const max = nums.reduce((a, b) => (BigInt(b) > BigInt(a) ? b : a));
  const next = String(BigInt(max) + BigInt(1));
  return next.padStart(max.length, '0');
}
