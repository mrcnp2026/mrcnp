// 증명서 발급 (2026-10-29 남은 일 9-3 · 2026-10-30 다시 짬) — 최고관리자.
// 왼쪽: 바로 발급(퇴사자 포함) — 직원 · 종류 · 용도를 고르면 미리보기 창이 열린다 (2026-10-30 의뢰인: 좌우를 바꿈).
// 오른쪽: 처리할 신청 → 「미리보기 · 고치기」로 내용을 확인 · 고친 뒤 발급 / 반려. 아래: 발급 대장(보기 · 받기).
// 두 칸은 제목 줄을 맞춘다(2026-10-30 의뢰인: 그리드 정렬 위치가 안 맞는다). 발급한 내용은 고치지 못하고, 내려받으면 기록이 남는다.
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { CertDraft } from '@/components/CertEditor';
import { CertDecide, CertRequestForm } from '@/components/CertForms';
import { CertList } from '@/components/CertList';
import { PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { getMe } from '@/lib/auth';
import { CERT_KINDS, certAllowed, loadCerts, snapshotOf } from '@/lib/certificates';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export default async function AdminCertificatesPage() {
  const me = await getMe();
  if (!me || me.role !== 'admin') notFound();
  const [t, { rows, missing }, { data: people }] = await Promise.all([
    getTranslations('certificates'),
    loadCerts({ practice: OFFICE.practiceMode }),
    createAdminClient().from('profiles').select('id, name, active, employee_no').order('name'),
  ]);
  const staff = (people ?? []).filter((p) => !(p.employee_no as string | null)?.startsWith('e2e-') || me.employeeNo?.startsWith('e2e-'));
  const name = new Map(staff.map((p) => [p.id as string, p.name as string]));
  const nameOf = (id: string) => name.get(id) ?? t('unknown');
  const open = rows.filter((r) => r.state === 'REQUESTED');
  const done = rows.filter((r) => r.state !== 'REQUESTED');
  // 신청마다 미리보기에 띄울 내용 — 지금의 직원 정보로 만든다(발급 때 다시 만들고, 고친 칸만 덮어쓴다). 낼 수 없는 신청은 null
  const drafts = new Map<string, CertDraft | null>(
    await Promise.all(open.map(async (r) => [r.id, (await certAllowed(r.employeeId, r.kind)).ok ? ((await snapshotOf(r.employeeId, r.kind, r.purpose)) as CertDraft) : null] as const)),
  );
  return (
    <PageShell wide>
      <div>
        <h1 className="text-2xl font-bold">{t('adminTitle')}</h1>
        <p className="mt-1 text-sm text-muted">{t('adminIntro')}</p>
      </div>
      {missing ? (
        <p className="rounded-card bg-warn-tint p-4 text-sm text-warn">{t('missing')}</p>
      ) : (
        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[24rem_minmax(0,1fr)] lg:items-start lg:gap-6">
          {/* 왼쪽: 바로 발급 · 오른쪽: 처리할 신청 · 발급 대장 (2026-10-30 의뢰인: 좌우를 바꾼다) */}
          <section className="flex flex-col gap-2 lg:sticky lg:top-4">
            <h2 className="flex min-h-8 items-center font-bold">{t('directTitle')}</h2>
            <div className="flex flex-col gap-3 rounded-card border border-border bg-bg p-4">
              <p className="text-xs text-muted">{t('directHint')}</p>
              <CertRequestForm kinds={CERT_KINDS} people={staff.map((p) => ({ id: p.id as string, name: p.name as string, off: !p.active }))} />
            </div>
          </section>
          <div className="flex flex-col gap-6">
            <section className="flex flex-col gap-2">
              <h2 className="flex min-h-8 items-center font-bold">{t('openTitle', { n: open.length })}</h2>
              <CertList rows={open} nameOf={nameOf} action={(r) => <CertDecide id={r.id} name={nameOf(r.employeeId)} draft={drafts.get(r.id) ?? null} copies={r.copies} />} />
            </section>
            <section className="flex flex-col gap-2">
              <h2 className="flex min-h-8 items-center font-bold">{t('ledgerTitle')}</h2>
              <CertList rows={done} nameOf={nameOf} />
            </section>
          </div>
        </div>
      )}
    </PageShell>
  );
}
