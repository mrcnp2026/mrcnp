// 통합설정 첫 화면 — 전체 메뉴 한 장 (2026-10-14 결정 사항 개발-20, 문서 07 6장).
// 통합설정 = 회사설정 + App 관리. 여기 있는 것은 전부 「기준」이고, 날마다 하는 일(직원 · 근태 · 급여 처리)은 관리자 화면에 있다.
// 관리자만 들어온다 — 지점관리자는 admin/layout이 돌려보낸다(manager-rules.ts에 없는 주소).
import { getTranslations } from 'next-intl/server';
import { PageShell } from '@/components/ui';
import { ConsoleBoard } from './ConsoleBoard';

export default async function ConsolePage() {
  const t = await getTranslations('frame');
  return (
    <PageShell wide>
      <div data-dup-title>
        <h1 className="text-2xl font-bold">{t('space.console')}</h1>
        <p className="pt-1 text-sm text-muted">{t('console.lead')}</p>
      </div>
      <ConsoleBoard />
    </PageShell>
  );
}
