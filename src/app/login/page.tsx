import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { OpenExternal } from '@/components/OpenExternal';
import { Logo } from '@/components/Logo';
import { CalendarCheck, ChartColumn, Clock4, Wallet } from 'lucide-react';
import { Card, IconTile } from '@/components/ui';
import { companyName } from '@/lib/company'; // 통합설정 › 회사 기본설정의 회사명 (2026-10-18)
import { languageOptions } from '@/i18n/locales';
import { getMe } from '@/lib/auth';
import { homePathForRole } from '@/lib/home-path';
import { LoginButton } from './LoginButton';
import { LoginForm } from './LoginForm';

export default async function LoginPage() {
  const me = await getMe();
  if (me) redirect(homePathForRole());
  const [t, tp, tb] = await Promise.all([getTranslations('login'), getTranslations('privacy'), getTranslations('brand')]);
  // 넓은 화면(PC·태블릿 가로, 1024px~)은 두 칸: 왼쪽 소개 면 + 오른쪽 로그인. 폰은 그대로 한 칸 (2026-10-05 의뢰인: PC 로그인이 폰 화면 그대로였다)
  return (
    <div className="lg:grid lg:min-h-dvh lg:grid-cols-2">
      {/* 2026-10-27 의뢰인: 「로그인은 너무 파란 계통이라 로그인 후의 따뜻한 색과 안 어울린다」 → 온디랩스 키트처럼
          따뜻한 바탕 + 파스텔 타일 네 장(출퇴근 · 휴가 · 급여 · 리포트). 그림은 장식이라 숫자가 없다 */}
      {/* 2026-10-28 의뢰인: 「소개는 너무 왼쪽, 로그인은 너무 오른쪽이라 멀다」 → 소개는 가운데 선 쪽으로 붙이고(오른쪽 정렬),
          로그인 칸도 가운데 선 바로 옆에 둔다. 넓은 화면에서도 둘이 가운데를 두고 마주 보게 */}
      <aside className="hidden overflow-hidden bg-rail text-text lg:flex lg:flex-col lg:items-end lg:justify-between lg:p-12 xl:pr-24">
        <span aria-hidden />
        <div className="flex w-full max-w-lg flex-col gap-10">
          <div className="flex flex-col gap-4">
            <p className="text-4xl leading-tight font-extrabold tracking-tight whitespace-pre-line">{t('heroTitle')}</p>
            <p className="text-lg text-muted">{t('heroSub')}</p>
          </div>
          <div aria-hidden className="grid grid-cols-2 gap-4">
            <div className="flex h-36 flex-col justify-between rounded-card bg-tile-2 p-5 shadow-card">
              <IconTile icon={Clock4} tone={2} />
              <span className="flex h-12 items-end gap-1.5">
                {[40, 65, 55, 80, 70, 95, 60].map((h, i) => (
                  <span key={i} className="fx-grow flex-1 rounded-full" style={{ height: `${h}%`, background: i === 5 ? 'var(--t-color-primary)' : 'var(--t-color-bg)', animationDelay: `${300 + i * 70}ms` }} />
                ))}
              </span>
            </div>
            <div className="flex h-36 flex-col justify-between rounded-card bg-tile-1 p-5 shadow-card">
              <IconTile icon={CalendarCheck} tone={1} />
              <span className="h-2.5 overflow-hidden rounded-full bg-bg">
                <span className="fx-grow-x block h-full w-3/5 rounded-full" style={{ background: 'linear-gradient(to right, var(--t-color-accent-2), var(--t-color-primary))', animationDelay: '500ms' }} />
              </span>
            </div>
            <div className="flex h-36 flex-col justify-between rounded-card bg-tile-3 p-5 shadow-card">
              <IconTile icon={Wallet} tone={3} />
              <svg viewBox="0 0 120 36" className="h-10 w-full overflow-visible">
                <path className="fx-draw" pathLength={1} d="M2,30 C20,26 30,12 48,16 C66,20 74,6 92,8 C104,9 110,4 118,3" fill="none" stroke="var(--t-color-text)" strokeWidth={2} strokeLinecap="round" />
              </svg>
            </div>
            <div className="flex h-36 flex-col justify-between rounded-card bg-tile-4 p-5 shadow-card">
              <IconTile icon={ChartColumn} tone={4} />
              <svg viewBox="0 0 36 36" className="fx-sweep size-12 -rotate-90">
                <circle cx="18" cy="18" r="14" fill="none" strokeWidth="5" stroke="var(--t-color-bg)" />
                <circle cx="18" cy="18" r="14" fill="none" strokeWidth="5" stroke="var(--t-color-primary)" strokeDasharray="60 88" strokeLinecap="round" />
              </svg>
            </div>
          </div>
        </div>
        <p className="w-full max-w-lg text-sm text-muted">© {await companyName()}</p>
      </aside>
      <main className="mx-auto flex w-full max-w-md flex-col gap-3 px-4 py-4 lg:mr-auto lg:ml-12 lg:justify-center lg:py-12 xl:ml-24">
        <OpenExternal />
        <div className="flex justify-end">
          <LanguageSwitcher options={languageOptions()} />
        </div>
        <section className="flex justify-center py-6">
          <Logo height={56} priority />
        </section>
        <Card className="flex flex-col gap-4 p-6">
          <h1 className="text-2xl font-semibold text-primary-deep">{t('title')}</h1>
          <LoginForm />
        </Card>
        {/* 설명 문구는 두지 않는다 — 입력 칸·버튼·링크만 (2026-10-06 의뢰인: 로그인 화면에 설명이 너무 많다) */}
        <p className="flex flex-wrap items-center justify-center gap-x-1 text-sm text-muted">
          {t('firstTime')}
          <Link href="/register" className="inline-flex min-h-11 items-center px-2 font-semibold text-primary">
            {t('setupLink')}
          </Link>
          <span aria-hidden className="text-faint">·</span>
          {/* 2026-10-16 의뢰인 권한-6: 초대 없이 이메일로 가입 신청 → 관리자 승인 */}
          <Link href="/signup" className="inline-flex min-h-11 items-center px-2 font-semibold text-primary">
            {t('emailSignup')}
          </Link>
        </p>
        {/* 예전에 폰을 등록해 둔 기기에서만 되는 보조 로그인 — 맨 아래 작게 */}
        <LoginButton />
        {/* 개발사 표시 (2026-11-02 의뢰인) — 처리방침 링크 옆에 작게 */}
        <p className="flex items-center justify-center gap-2 text-xs text-muted">
          <Link href="/privacy" className="min-h-11 content-center">
            {tp('link')}
          </Link>
          <span aria-hidden className="text-faint">·</span>
          <span className="text-faint">{tb('credit')}</span>
        </p>
      </main>
    </div>
  );
}
