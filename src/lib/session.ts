// 로그인 세션 발급. 서버 전용.
//
// 두 길이 있다 (2026-10-05 의뢰인: 폰 1대 고정 대신 아이디 + 비밀번호로 PC·폰 어디서나):
//  ① 비밀번호 — Supabase Auth가 비밀번호를 확인하고 세션을 준다 (signInWithPassword). 기본 로그인.
//  ② 패스키 — 이미 등록해 둔 기기에서 지문·얼굴로. 서버가 패스키를 검증한 뒤 관리자 API로 1회용 로그인 링크를 만들고
//     그 자리에서 바로 세션으로 교환한다 (7-12 요점 6의 ②, 마스터 8-3). 링크는 메일로 나가지 않고, 한 번 쓰면 다시 못 쓴다.
// 어느 쪽이든 Supabase의 auth.uid()가 그대로 살아 있어 권한 잠금(RLS)을 다시 짤 필요가 없다.
import 'server-only';
import { authTimeOf } from '@/lib/login-rules';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

/** 직원 계정의 로그인 주소. 받는 사람이 없는 예약된 가짜 도메인(.invalid)이다 — 이메일을 요구하지 않는다 (요점 5) */
export function staffEmail(employeeNo: string): string {
  return `${employeeNo.toLowerCase()}@staff.invalid`;
}

/** 방금 받은 세션이 로그인한 시각(초) — 인증 서버 시계 기준이라 세션 무효화 시각과 어긋나지 않는다 */
function authTimeOfToken(accessToken: string | undefined): number {
  try {
    const t = authTimeOf(JSON.parse(Buffer.from(accessToken!.split('.')[1], 'base64url').toString('utf8')));
    if (t !== null) return t;
  } catch {}
  return Math.floor(Date.now() / 1000);
}

export async function issueSession(employeeId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: u, error: e1 } = await admin.auth.admin.getUserById(employeeId);
  if (e1 || !u.user?.email) throw new Error(`issueSession.getUser: ${e1?.message ?? 'no email'}`);
  const { data: link, error: e2 } = await admin.auth.admin.generateLink({ type: 'magiclink', email: u.user.email });
  if (e2) throw new Error(`issueSession.generateLink: ${e2.message}`);
  const supabase = await createClient(); // 요청 쿠키에 세션을 쓴다
  const { error: e3 } = await supabase.auth.verifyOtp({ type: 'email', token_hash: link.properties.hashed_token });
  if (e3) throw new Error(`issueSession.verifyOtp: ${e3.message}`);
}

/**
 * 비밀번호로 로그인해 요청 쿠키에 세션을 쓴다. 비밀번호가 틀렸으면(또는 아직 없으면) null, 맞으면 로그인 시각(초).
 * 틀린 것과 계정이 없는 것을 구분하지 않는다 — 화면에도 같은 문구가 나간다.
 */
export async function signInWithPassword(employeeNo: string, password: string): Promise<number | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: staffEmail(employeeNo), password });
  if (error) {
    if (error.status === 400 || error.status === 422) return null; // invalid_credentials · user_banned
    throw new Error(`signInWithPassword: ${error.status} ${error.code}`);
  }
  return authTimeOfToken(data.session?.access_token);
}
