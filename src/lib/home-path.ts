// 로그인 뒤 첫 화면. 관리자는 관리자 화면, 직원은 출퇴근 화면 (PWA 진입점, 6장 파일 트리)
import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

export function homePathForRole(role: 'admin' | 'employee'): string {
  return role === 'admin' ? '/admin' : '/punch';
}

export async function homePathFor(employeeId: string): Promise<string> {
  const { data } = await createAdminClient().from('profiles').select('role').eq('id', employeeId).maybeSingle();
  return homePathForRole(data?.role === 'admin' ? 'admin' : 'employee');
}
