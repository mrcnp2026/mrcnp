// 직원 화면 틀 — 하단 탭 3개: 홈 · 내 기록 · 정정 요청 (부록 R-10-4). ②에서 연차 탭이 4번째로 붙는다.
// 직원 탭에는 배지를 쓰지 않는다 — 미기록 알림은 홈의 배너가 맡는다.
import { redirect } from 'next/navigation';
import { getMe } from '@/lib/auth';
import { EmployeeNav } from './EmployeeNav';

export default async function PunchLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!me) redirect('/login');
  return (
    <>
      <div className="pb-[calc(4rem+env(safe-area-inset-bottom))]">{children}</div>
      <EmployeeNav />
    </>
  );
}
