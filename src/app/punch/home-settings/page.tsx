// 홈 설정 (의뢰인 2026-10-11: 시프티의 홈 설정처럼) — 홈의 카드를 사람마다 켜고 끈다. 「오늘 근무」(출퇴근 버튼)는 끌 수 없다.
// 이 기기에만 저장된다(쿠키). 관리자 전용 카드(리포트 · 누락 기록 · 현재 근무 상황)는 관리자에게만 보인다.
import { getTranslations } from 'next-intl/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { DetailBar } from '@/components/detail';
import { PageShell } from '@/components/ui';
import { getMe } from '@/lib/auth';
import { HOME_CARDS, HOME_COOKIE, homeCardsOn, type HomeCard } from '@/lib/home';
import { HomeToggles } from './HomeToggles';

const ADMIN_ONLY: HomeCard[] = ['report', 'missing', 'situation'];

export default async function HomeSettingsPage() {
  const me = await getMe();
  if (!me) redirect('/login');
  const t = await getTranslations('home.settings');
  const on = homeCardsOn((await cookies()).get(HOME_COOKIE)?.value);
  const cards = HOME_CARDS.filter((k) => me.role === 'admin' || !ADMIN_ONLY.includes(k));
  return (
    <PageShell>
      <DetailBar back="/punch" backLabel={t('back')} title={t('title')} />
      <HomeToggles cards={[...cards]} initial={cards.filter((k) => on.has(k))} />
      <p className="px-1 text-sm text-faint">{t('hint')}</p>
    </PageShell>
  );
}
