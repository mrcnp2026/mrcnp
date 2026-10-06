// 직원 화면 틀 — 하단 탭 3개: 홈 · 내 기록 · 정정 요청 (부록 R-10-4). ②에서 연차 탭이 4번째로 붙는다.
// 직원 탭에는 배지를 쓰지 않는다 — 미기록 알림은 홈의 배너가 맡는다.
import { getLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { ConsentGate } from '@/components/ConsentGate';
import { NoticeSheet } from '@/components/NoticeSheet';
import { SideNav } from '@/components/SideNav';
import { CONSENT } from '@/config/consent';
import { languageOptions } from '@/i18n/locales';
import { hasConsent } from '@/lib/consent';
import { getMe } from '@/lib/auth';
import { pendingNoticesFor } from '@/lib/notices';
import { pendingCounts } from '@/lib/period-data';
import { EmployeeNav } from './EmployeeNav';

export default async function PunchLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!me) redirect('/login');
  // 공지 팝업: 대상 · 게시 중 · 현재 판 미확인 · 최대 3개 (②-5 7-15 요점 19). 언어는 지금 고른 언어
  const pending = (await pendingNoticesFor(me.id, await getLocale())).map(({ id, version, important, display, original }) => ({ id, version, important, display, original }));
  const consented = await hasConsent(me.id);
  const inboxCount = me.role === 'admin' ? (await pendingCounts()).total : 0;
  return (
    <>
      {/* PC: 왼쪽 메뉴 + 넓은 본문 · 폰: 본문 + 하단 탭 (2026-10-06 의뢰인) */}
      <div className="lg:flex">
        <SideNav isAdmin={me.role === 'admin'} inboxCount={inboxCount} languages={languageOptions()} />
        <div className="min-w-0 flex-1 pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0">{children}</div>
      </div>
      <EmployeeNav isAdmin={me.role === 'admin'} />
      {/* 동의 창이 먼저다 — 동의하기 전에는 공지 팝업을 겹쳐 띄우지 않는다 (2026-10-05) */}
      {consented ? <NoticeSheet items={pending} /> : <ConsentGate version={CONSENT.version} languages={languageOptions()} />}
    </>
  );
}
