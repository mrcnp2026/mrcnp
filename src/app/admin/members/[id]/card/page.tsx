// 인사기록카드 화면 (2026-10-29 남은 일 9-4) — 직원 상세에서 연다. 한 장에 기본 · 선택 정보 · 재직 기간 · 소속 이력 · 계약 · 교육 · 인사 기록 · 동의.
// 고치는 곳은 그대로 직원 상세(여기는 보기 · PDF 받기만). 최고관리자만.
import { ChevronLeft, Download } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageShell } from '@/components/ui';
import { getMe } from '@/lib/auth';
import { buildHrCard } from '@/lib/hr-card';

export default async function HrCardPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getMe();
  if (!me || me.role !== 'admin') notFound();
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  const [t, card] = await Promise.all([getTranslations('hrCard'), buildHrCard(id, me, await getLocale())]);
  if (!card) notFound();
  return (
    <PageShell>
      <Link href={`/admin/members/${id}`} className="inline-flex min-h-9 items-center gap-1 self-start text-sm font-medium text-muted">
        <ChevronLeft aria-hidden size={16} />
        {t('back')}
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="num mt-1 text-sm text-muted">{[card.name, card.employeeNo].filter(Boolean).join(' · ')}</p>
        </div>
        <a href={`/api/admin/members/${id}/card`} className="inline-flex h-10 items-center gap-1.5 rounded-button bg-primary px-4 text-sm font-bold text-on-primary">
          <Download aria-hidden size={16} />
          {t('pdf')}
        </a>
      </div>
      {/* 두 칸 — 왼쪽: 기본 · 인사 기록 · 선택 정보, 오른쪽: 재직 기간 · 급여 계약 · 소속 이력 · 교육 · 동의 (폰은 위에서 아래로) */}
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4">
        {(['left', 'right'] as const).map((side) => (
        <div key={side} className="flex flex-col gap-3 lg:gap-4">
        {card.sections.filter((s) => s.side === side).map((s) => (
          <section key={s.key} className="flex flex-col rounded-card border border-border bg-bg">
            <h2 className="border-b border-border px-4 py-3 font-bold">{s.title}</h2>
            {s.rows.length === 0 ? (
              <p className="px-4 py-3 text-sm text-faint">{s.empty}</p>
            ) : (
              <dl className="flex flex-col divide-y divide-border text-sm">
                {s.rows.map(([k, v], i) => (
                  <div key={i} className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 px-4 py-2.5">
                    <dt className="num text-muted">{k}</dt>
                    <dd className="num min-w-0 break-words whitespace-pre-line">{v}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        ))}
        </div>
        ))}
      </div>
      <p className="text-xs text-faint">{t('note')}</p>
    </PageShell>
  );
}
