// ⑤ 더보기 — 매일 쓰지 않는 것. 전체 폭 목록 + 구분선, 행 높이 44px 이상 (마스터 5장, R-10-7).
// ①단계에서는 진단 하나뿐이다 (5장 규칙 3). 공지·설정·서비스 상태·변경 기록은 ②에서 이 목록에 붙인다.
import { ChevronRight, Stethoscope } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { PageShell } from '@/components/ui';

export default async function MorePage() {
  const t = await getTranslations('admin.more');
  return (
    <PageShell>
      <h1 className="text-2xl font-semibold text-primary-deep">{t('title')}</h1>
      <ul className="divide-y divide-border rounded-card border border-border">
        <li>
          <Link href="/admin/diag" className="flex min-h-14 items-center gap-3 px-4 py-3">
            <Stethoscope aria-hidden size={22} strokeWidth={1.75} className="text-muted" />
            <span className="flex-1">
              <span className="block font-semibold">{t('diag')}</span>
              <span className="block text-sm text-muted">{t('diagHint')}</span>
            </span>
            <ChevronRight aria-hidden size={20} strokeWidth={1.75} className="text-faint" />
          </Link>
        </li>
      </ul>
    </PageShell>
  );
}
