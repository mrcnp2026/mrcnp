// 관리 화면 틀 — 직원 화면과 같은 틀(components/AppFrame). 관리자 · 지점관리자만 들어온다.
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AppFrame } from '@/components/AppFrame';
import { getMe } from '@/lib/auth';
import { MANAGER_HOME, managerCanOpen } from '@/lib/manager-rules';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!me) redirect('/login');
  if (me.role !== 'admin' && me.role !== 'manager') redirect('/punch');
  // 지점관리자: 허용한 화면만 (화면 사이를 옮길 때는 middleware가 막는다 — 여기는 처음 들어올 때)
  const path = (await headers()).get('x-pathname') ?? '';
  if (me.role === 'manager' && !managerCanOpen(path)) redirect(MANAGER_HOME);
  return <AppFrame me={me}>{children}</AppFrame>;
}
