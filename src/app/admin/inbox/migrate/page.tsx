// 지난 요청 정리 · 이관 정리 (개발-63, 2026-11-01 의뢰인) — 최고관리자만.
// 기준일(OFFICE.migrationCutoff) 이전의 연장 요청 중 아직 안 끝난 것(대기 · 재확인)을 한 화면에 모아 한 번에 닫는다.
// 고객사 이관 때도 같은 화면을 쓴다 — 예전 프로그램에서 처리된 기간의 요청이 요청함에 남지 않게.
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { getMe } from '@/lib/auth';
import { loadMigrate } from '@/lib/migrate-close';
import { MigrateBoard, type BoardRow } from './MigrateBoard';

export const dynamic = 'force-dynamic';

export default async function MigratePage({ searchParams }: { searchParams: Promise<{ live?: string }> }) {
  const me = await getMe();
  if (!me || me.role !== 'admin') notFound();
  // 요청함과 같이 연습 모드에서는 연습 기록을, ?live=1이면 실제 기록을
  const live = (await searchParams).live === '1';
  const [t, { cutoff, rows }] = await Promise.all([getTranslations('migrate'), loadMigrate(OFFICE.practiceMode && !live)]);
  const board: BoardRow[] = rows.map((r) => ({
    id: r.id, name: r.name, employeeNo: r.employeeNo, workDate: r.workDate, closed: r.closed,
    review: r.status !== 'pending',
    // 재확인: 결정했던 인정분(비어 있으면 계산된 시간 전부 인정이었다) · 대기: 계산된 연장 + 휴일
    minutes: r.status !== 'pending' ? (r.approvedMinutes ?? r.overtimeMinutes) + (r.approvedHolidayMinutes ?? r.holidayMinutes) : r.overtimeMinutes + r.holidayMinutes,
    recomputed: r.recomputedMinutes, decided: r.status,
  }));
  return (
    <PageShell>
      <div>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted">{t('intro', { date: cutoff.replace(/-/g, '. ') })}</p>
      </div>
      <MigrateBoard rows={board} live={live} />
    </PageShell>
  );
}
