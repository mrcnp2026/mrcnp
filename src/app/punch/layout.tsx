// 직원 화면 틀 — 하단 탭 3개: 홈 · 내 기록 · 정정 요청 (부록 R-10-4). ②에서 연차 탭이 4번째로 붙는다.
// 직원 탭에는 배지를 쓰지 않는다 — 미기록 알림은 홈의 배너가 맡는다.
import { getLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { NoticeSheet } from '@/components/NoticeSheet';
import { getMe } from '@/lib/auth';
import { pendingNoticesFor } from '@/lib/notices';
import { EmployeeNav } from './EmployeeNav';

export default async function PunchLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!me) redirect('/login');
  // 공지 팝업: 대상 · 게시 중 · 현재 판 미확인 · 최대 3개 (②-5 7-15 요점 19). 언어는 지금 고른 언어
  const pending = (await pendingNoticesFor(me.id, await getLocale())).map(({ id, version, important, display, original }) => ({ id, version, important, display, original }));
  return (
    <>
      <div className="pb-[calc(4rem+env(safe-area-inset-bottom))]">{children}</div>
      <EmployeeNav />
      <NoticeSheet items={pending} />
    </>
  );
}
