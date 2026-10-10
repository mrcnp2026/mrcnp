// 관리 화면 틀 — 직원 화면과 같은 틀(components/AppFrame). 관리자가 아니면 들어올 수 없다.
import { redirect } from 'next/navigation';
import { AppFrame } from '@/components/AppFrame';
import { getMe } from '@/lib/auth';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!me) redirect('/login');
  if (me.role !== 'admin') redirect('/punch');
  return <AppFrame me={me}>{children}</AppFrame>;
}
