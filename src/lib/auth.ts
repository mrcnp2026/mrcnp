// 지금 요청한 사람이 누구인가. 서버 전용.
import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export type Me = {
  id: string;
  name: string;
  employeeNo: string | null;
  role: 'admin' | 'employee';
  locale: 'ko' | 'en' | 'vi' | 'th';
  active: boolean;
};

/** 로그인 세션 → 직원 정보. 세션이 없거나 퇴사 처리된 직원이면 null */
export async function getMe(): Promise<Me | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser(); // 서버에서 토큰을 다시 확인한다 (쿠키만 믿지 않는다)
  if (!data.user) return null;
  const { data: p } = await createAdminClient()
    .from('profiles')
    .select('id, name, employee_no, role, locale, active')
    .eq('id', data.user.id)
    .maybeSingle();
  if (!p || !p.active) return null;
  return { id: p.id, name: p.name, employeeNo: p.employee_no, role: p.role, locale: p.locale, active: p.active };
}

export async function requireAdmin(): Promise<Me | null> {
  const me = await getMe();
  return me?.role === 'admin' ? me : null;
}
