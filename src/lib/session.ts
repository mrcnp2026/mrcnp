// 로그인 세션 발급 — 폰 확인(패스키)을 통과한 직원에게만. 서버 전용.
//
// 방식 (7-12 요점 6의 ②, 마스터 8-3에 기록): 서버가 패스키를 검증한 뒤 관리자 API로 1회용 로그인 링크를 만들고,
// 그 자리에서 바로 세션으로 교환한다. 링크는 메일로 나가지 않고, 한 번 쓰면 다시 못 쓴다 (2026-10-02 실측).
// 이렇게 하면 Supabase의 auth.uid()가 그대로 살아 있어 권한 잠금(RLS)을 다시 짤 필요가 없다.
import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

/** 직원 계정의 로그인 주소. 받는 사람이 없는 예약된 가짜 도메인(.invalid)이다 — 이메일을 요구하지 않는다 (요점 5) */
export function staffEmail(employeeNo: string): string {
  return `${employeeNo.toLowerCase()}@staff.invalid`;
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
