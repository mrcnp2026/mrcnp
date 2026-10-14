// 통합설정 첫 화면 — 전체 메뉴 한 장 (2026-10-14 결정 사항 개발-20, 문서 07 6장).
// 통합설정 = 회사설정 + App 관리. 여기 있는 것은 전부 「기준」이고, 날마다 하는 일(직원 · 근태 · 급여 처리)은 관리자 화면에 있다.
// 관리자만 들어온다 — 지점관리자는 admin/layout이 돌려보낸다(manager-rules.ts에 없는 주소).
import { ChevronRight } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { PageShell } from '@/components/ui';
import { appLeaves, CONSOLE_APPS } from '@/config/nav';

export default async function ConsolePage() {
  const t = await getTranslations('frame');
  return (
    <PageShell wide>
      <div>
        <h1 className="text-2xl font-bold">{t('space.console')}</h1>
        <p className="pt-1 text-sm text-muted">{t('console.lead')}</p>
      </div>
      {(['company', 'apps'] as const).map((s) => (
        <section key={s} className="flex flex-col gap-3 pt-2">
          <div>
            <h2 className="text-lg font-bold">{t(`console.${s}`)}</h2>
            <p className="text-sm text-faint">{t(`console.${s}Lead`)}</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {CONSOLE_APPS.filter((a) => a.section === s).map((a) => {
              const Icon = a.icon;
              return (
                <div key={a.key} className="rounded-card border border-border bg-bg p-4">
                  <p className="flex items-center gap-2 pb-2 font-bold">
                    <span className="flex size-8 items-center justify-center rounded-button bg-primary-tint text-primary">
                      <Icon aria-hidden size={18} strokeWidth={1.75} />
                    </span>
                    {t(`app.${a.key}`)}
                  </p>
                  <ul>
                    {appLeaves(a).map((l) => (
                      <li key={l.href}>
                        <Link href={l.href} className="flex min-h-9 items-center justify-between gap-2 rounded-button px-2 text-sm text-text hover:bg-surface hover:text-primary">
                          {t(`item.${l.key}`)}
                          <ChevronRight aria-hidden size={14} strokeWidth={1.75} className="text-faint" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </PageShell>
  );
}
