// 첫 화면: 로그인 상태에 따라 보낸다. 화면 문구가 없다.
import { redirect } from 'next/navigation';
import { getMe } from '@/lib/auth';
import { homePathForRole } from '@/lib/home-path';

export default async function Home() {
  const me = await getMe();
  redirect(me ? homePathForRole(me.role) : '/login');
}
