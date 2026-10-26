'use client';
// 조직도 출력 (2026-10-25 의뢰인) — 브라우저 인쇄 창을 연다. 메뉴 · 단추는 인쇄에서 빠지고(globals.css의 print 규칙) 조직도 도형과 제목만 나온다. PDF로 저장도 된다.
import { Printer } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function PrintButton() {
  const t = useTranslations('admin.org');
  return (
    <button type="button" data-noprint onClick={() => window.print()} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-button border border-border bg-bg px-3.5 text-sm font-semibold text-text hover:bg-surface lg:min-h-9">
      <Printer aria-hidden size={16} />
      {t('print')}
    </button>
  );
}
