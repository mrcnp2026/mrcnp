// 로그인 규칙 (2026-10-05 의뢰인: 폰 1대 고정 대신 아이디 + 비밀번호로 PC·폰 어디서나) — 판단만 하는 순수함수.
// ★ 아이디는 사번이다. 휴대폰 번호를 넣어도 되지만, 그 번호를 가진 재직자가 정확히 한 명일 때만 통한다.
// ★ 비밀번호 규칙은 길이만 본다 (8자 이상). 특수문자 강제는 외국인 직원에게 문턱만 높이고 "Abc12345!" 같은 것을 만든다.
// ★ 세션 무효화: 비밀번호를 바꾸거나 관리자가 로그인을 초기화하면, 그보다 먼저 로그인한 기기는 모두 끊긴다.

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72; // 인증 서버(bcrypt)가 72바이트까지만 본다
export const LOGIN_MAX_FAILS = 10; // 이 횟수만큼 틀리면
export const LOGIN_WINDOW_MIN = 15; // 이 시간 동안 그 아이디의 로그인을 막는다

export type PasswordRuleCode = 'password_short' | 'password_long' | 'password_same_as_id';

export function checkPassword(password: unknown, employeeNo: string): PasswordRuleCode | null {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN) return 'password_short';
  if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX) return 'password_long';
  if (password.toLowerCase() === employeeNo.toLowerCase()) return 'password_same_as_id';
  return null;
}

/** 아이디 입력값 정리: 앞뒤 공백을 떼고 소문자로 (사번은 대소문자를 가리지 않는다) */
export function normalizeLoginId(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

const digits = (s: string) => s.replace(/\D/g, '');

export type LoginCandidate = { id: string; employeeNo: string | null; phone: string | null; active: boolean };

/**
 * 입력한 아이디 → 직원. 사번이 먼저다. 사번에 없으면 휴대폰 번호(숫자만 비교)로 찾되,
 * 같은 번호의 재직자가 둘 이상이면 누구인지 알 수 없으므로 찾지 못한 것으로 한다.
 */
export function resolveLoginId(raw: unknown, people: LoginCandidate[]): LoginCandidate | null {
  const id = normalizeLoginId(raw);
  if (!id) return null;
  const active = people.filter((p) => p.active);
  const byNo = active.find((p) => p.employeeNo?.toLowerCase() === id);
  if (byNo) return byNo;
  const d = digits(id);
  if (d.length < 9 || /[a-z]/.test(id)) return null;
  const byPhone = active.filter((p) => p.phone && digits(p.phone) === d);
  return byPhone.length === 1 ? byPhone[0] : null;
}

type Amr = { method?: string; timestamp?: number } | string;

/**
 * 이 세션이 처음 로그인한 시각(초). 토큰을 갱신해도 바뀌지 않는 값이어야 하므로 amr에서 갱신 표시를 뺀 가장 이른 시각을 쓴다.
 * amr가 없으면(옛 토큰) 발급 시각(iat)으로 대신한다.
 */
export function authTimeOf(claims: { amr?: Amr[]; iat?: number } | null | undefined): number | null {
  const stamps = (claims?.amr ?? [])
    .filter((a): a is { method?: string; timestamp: number } => typeof a === 'object' && typeof a.timestamp === 'number' && a.method !== 'token_refresh')
    .map((a) => a.timestamp);
  if (stamps.length > 0) return Math.min(...stamps);
  return typeof claims?.iat === 'number' ? claims.iat : null;
}

/** 무효화 시각보다 먼저 로그인한 세션인가. 같은 초에 로그인한 세션은 살린다 (무효화 직후 새로 받은 세션) */
export function sessionRevoked(authTime: number | null, revokedAt: string | null): boolean {
  if (!revokedAt) return false;
  if (authTime === null) return true;
  return authTime < Math.floor(new Date(revokedAt).getTime() / 1000);
}
