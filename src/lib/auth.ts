// 지금 요청한 사람이 누구인가. 서버 전용.
import 'server-only';
import { cache } from 'react';
import { authTimeOf, sessionRevoked } from '@/lib/login-rules';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export type Me = {
  id: string;
  name: string;
  employeeNo: string | null;
  role: 'admin' | 'manager' | 'employee'; // manager = 지점관리자 (맡은 지점만 보고 요청을 승인한다 — scope.ts)
  locale: 'ko' | 'en' | 'vi' | 'th';
  active: boolean;
  // 권한 (2026-10-16 의뢰인 권한-10): 관리자 = 최고관리자(대표자 포함 최대 3명) — 전부 보고 · 고치고 · 모든 요청을 받는다(급여 포함).
  //   급여 담당 · 총괄관리자 구분은 없앴다. 그 밖은 지점관리자(만들어만 둠) · 일반직원
  canViewPayroll: boolean; // = 관리자
  adminLevel: 'super' | 'ceo' | null; // 대표자인지 표시만 — 권한은 같다. 관리자가 아니면 null
  top: boolean; // = 관리자
};

/**
 * 로그인 세션 → 직원 정보. 세션이 없거나, 퇴사 처리됐거나, 로그인이 초기화되기 전에 받은 세션이면 null.
 * 한 요청 안에서는 한 번만 확인한다 (cache) — 틀·언어·본문이 각각 부르면 화면마다 3~4번 DB를 왕복해 느려진다 (2026-10-02)
 */
export const getMe = cache(async (): Promise<Me | null> => {
  const supabase = await createClient();
  // 토큰 서명을 서버에서 검사한다 (쿠키 내용만 믿지 않는다). 서명 키가 ES256이라 인증 서버에 묻지 않고 여기서 확인 →
  // 화면마다 인증 서버 왕복이 없어진다 (2026-10-02 속도). 퇴사·비활성은 아래 profiles.active로 매번 다시 본다.
  const { data } = await supabase.auth.getClaims();
  const uid = data?.claims?.sub;
  if (!uid) return null;
  const db = createAdminClient();
  const { data: p } = await db
    .from('profiles')
    .select('id, name, employee_no, role, locale, active, can_view_payroll, sessions_revoked_at, admin_level')
    .eq('id', uid)
    .maybeSingle();
  if (!p || !p.active) return null;
  // 비밀번호를 바꾸거나 관리자가 로그인을 초기화하면, 그 전에 로그인해 둔 기기는 바로 끊는다
  // (2026-10-05: 분실 폰을 막아도 열려 있던 화면이 계속 쓰이던 문제 — 로그인이 폰 등록에 묶이지 않게 된 뒤에도 같은 보장을 유지)
  if (sessionRevoked(authTimeOf(data.claims), p.sessions_revoked_at)) return null;
  return {
    id: p.id, name: p.name, employeeNo: p.employee_no, role: p.role, locale: p.locale, active: p.active,
    canViewPayroll: p.role === 'admin',
    adminLevel: p.role === 'admin' ? (p.admin_level === 'ceo' ? 'ceo' : 'super') : null,
    top: p.role === 'admin',
  };
});

export async function requireAdmin(): Promise<Me | null> {
  const me = await getMe();
  return me?.role === 'admin' ? me : null;
}
