// 관리자 화면 틀 — 탭 5개 구조 (마스터 5장). ★ 규칙 3: 아직 만들지 않은 기능의 탭은 보이지 않는다.
import { redirect } from 'next/navigation';
import { getMe } from '@/lib/auth';
import { pendingCounts } from '@/lib/period-data';
import { ConsentGate } from '@/components/ConsentGate';
import { TopBar } from '@/components/TopBar';
import { CONSENT } from '@/config/consent';
import { languageOptions } from '@/i18n/locales';
import { hasConsent } from '@/lib/consent';
import { AdminNav } from './AdminNav';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!me) redirect('/login');
  if (me.role !== 'admin') redirect('/punch');
  const c = await pendingCounts();
  const consented = await hasConsent(me.id); // 관리자도 직원이다 — 같은 동의 창 (2026-10-05)
  return (
    <div className="lg:flex">
      <AdminNav inboxCount={c.total} />
      {/* 폰에서는 하단 탭 바 높이 + 아이폰 하단 여백만큼 비운다 */}
      <div className="flex-1 pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0">
        <div className="lg:hidden">
          <TopBar />
        </div>
        {children}
      </div>
      {!consented && <ConsentGate version={CONSENT.version} languages={languageOptions()} />}
    </div>
  );
}
