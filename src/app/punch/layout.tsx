// 직원 화면 틀 — 상단 바·하단 탭·왼쪽 메뉴는 관리 화면과 같은 틀(components/AppFrame)을 쓴다 (2026-10-10 의뢰인).
// 미기록 알림은 홈의 배너가 맡는다.
import { getLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { AppFrame } from '@/components/AppFrame';
import { NoticeSheet } from '@/components/NoticeSheet';
import { getMe } from '@/lib/auth';
import { pendingNoticesFor } from '@/lib/notices';

export default async function PunchLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!me) redirect('/login');
  // 공지 팝업: 대상 · 게시 중 · 현재 판 미확인 · 최대 3개 (②-5 7-15 요점 19). 언어는 지금 고른 언어
  const pending = (await pendingNoticesFor(me.id, await getLocale())).map(({ id, version, important, display, original }) => ({ id, version, important, display, original }));
  return (
    <AppFrame me={me} overlay={<NoticeSheet items={pending} />}>
      {children}
    </AppFrame>
  );
}
