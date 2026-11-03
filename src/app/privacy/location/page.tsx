// 위치기반서비스 이용약관 (2026-11-04 의뢰인: 폴더의 「위치기반서비스 이용약관 (온디랩스)」를 개인정보 처리방침 쪽에 넣어 달라).
// 로그인 없이도 열린다(처리방침 · 동의 창에서 보러 온다). 앱이 실제로 하는 일에 맞춰 문구를 고쳤다 — 요청 쓸 때 위치(DB 0055) · 브라우저 위치 기능 · 보관 1년(처리방침과 같게).
// 아직 검토 전 초안 — 시행일 · 제공 사실 알림 · 1년 뒤 파기 · 위치기반서비스사업 신고를 마치면 「초안」 표시를 지운다.
import { ArrowLeft, MapPin } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Logo } from '@/components/Logo';
import { Card, PageShell } from '@/components/ui';
import { languageOptions } from '@/i18n/locales';

type Article = { title: string; p?: string; li?: string[]; bullets?: boolean }; // bullets = 번호 없는 안내(책임자 · 사업자 정보)
type Chapter = { title: string; articles: Article[] };

export default async function LocationTermsPage() {
  const t = await getTranslations('locationTerms');
  // 번역 파일을 영어로 채우는 과정(i18n/messages.ts)에서 배열이 번호 붙은 객체가 된다 — 다시 배열로
  const list = <T,>(x: unknown): T[] => (Array.isArray(x) ? x : Object.values((x as Record<string, T>) ?? {}));
  const chapters = list<Chapter>(t.raw('chapters')).map((c) => ({ ...c, articles: list<Article>(c.articles).map((a) => ({ ...a, li: a.li ? list<string>(a.li) : undefined })) }));
  return (
    <PageShell>
      <div className="flex items-center justify-between gap-2">
        <Logo height={32} priority />
        <LanguageSwitcher options={languageOptions()} />
      </div>
      <Card className="flex flex-col gap-6 text-sm">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-primary-deep">
          <MapPin aria-hidden size={26} strokeWidth={1.75} />
          {t('title')}
        </h1>
        <p className="rounded-button bg-warn-tint p-3 font-semibold text-warn">{t('draft')}</p>
        {chapters.map((c) => (
          <section key={c.title} className="flex flex-col gap-4">
            <h2 className="border-b border-border pb-1 text-base font-bold">{c.title}</h2>
            {c.articles.map((a) => (
              <div key={a.title} className="flex flex-col gap-1.5">
                <h3 className="font-semibold">{a.title}</h3>
                {a.p && <p className="text-muted">{a.p}</p>}
                {a.li && (a.bullets ? (
                  <ul className="flex list-disc flex-col gap-1 pl-5 text-muted">
                    {a.li.map((x) => <li key={x}>{x}</li>)}
                  </ul>
                ) : (
                  <ol className="flex list-decimal flex-col gap-1 pl-5 text-muted">
                    {a.li.map((x) => <li key={x}>{x}</li>)}
                  </ol>
                ))}
              </div>
            ))}
          </section>
        ))}
        <p className="text-xs text-faint">{t('effective')}</p>
      </Card>
      <Link href="/privacy" className="flex min-h-11 items-center justify-center gap-1 text-sm text-primary">
        <ArrowLeft aria-hidden size={16} />
        {t('back')}
      </Link>
    </PageShell>
  );
}
