// 관리 화면(page) 맨 위의 확인 — middleware와 같은 기준을 화면에서 한 번 더 (2026-11-01 보안 점검 2번, 이중 장치).
// 화면 틀(admin/layout)은 화면을 옮길 때 다시 실행되지 않아 틀의 확인만으로는 부족했다. middleware 설정이 바뀌거나 빠져도
// 관리 화면 자료가 나가지 않게, 자료를 읽기 전에 여기서 막는다. getMe는 한 요청 안에서 한 번만 DB를 읽는다(cache).
//   로그인 없음 · 퇴사 · 초기화 전 세션 → /login, 직원 → /punch, 지점관리자 → 허용 화면만(manager-rules), 최고관리자 · 시스템관리자 → 통과
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getMe, type Me } from '@/lib/auth';
import { MANAGER_HOME, managerCanOpen } from '@/lib/manager-rules';

export async function adminPage(): Promise<Me> {
  const me = await getMe();
  if (!me) redirect('/login');
  if (me.role !== 'admin' && me.role !== 'manager') redirect('/punch');
  if (me.role === 'manager' && !managerCanOpen((await headers()).get('x-pathname') ?? '')) redirect(MANAGER_HOME);
  return me;
}
