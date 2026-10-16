// 직무 관리 (의뢰인 2026-10-10: 시프티의 「직무 관리」처럼) — 색 · 이름 · 인원. 활성/비활성 탭.
import { ChevronRight } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { AddSheet } from '@/components/AddSheet';
import { OffToggle } from '@/components/OffToggle';
import { PcTable } from '@/components/PcTable';
import { DetailBar } from '@/components/detail';
import { Help } from '@/components/Help';
import { RowList } from '@/components/list';
import { Card, PageShell } from '@/components/ui';
import { loadJobs } from '@/lib/job-data';
import { SHIFT_COLOR_CLASS } from '@/lib/shifts';
import { createAdminClient } from '@/lib/supabase/admin';
import { JobForm } from './JobForms';

export default async function JobsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const t = await getTranslations('admin.jobs');
  const tc = await getTranslations('common');
  const sp = await searchParams;
  const off = sp.tab === 'off';
  const [all, { data: people }] = await Promise.all([loadJobs(), createAdminClient().from('profiles').select('job_id, employee_no').eq('active', true)]);
  const countOf = new Map<string, number>();
  let none = 0;
  for (const p of people ?? []) {
    if (p.job_id) countOf.set(p.job_id, (countOf.get(p.job_id) ?? 0) + 1);
    else if (!p.employee_no?.startsWith('e2e-')) none++;
  }
  const shown = all.filter((x) => x.active !== off && (x.active || !x.name.startsWith('e2e-')));

  return (
    <PageShell wide>
      <DetailBar sheet={{ id: 'job', label: t('add'), mobile: tc('addShort') }} back="/punch" backLabel={tc('back')} title={t('title')} extra={<Help>{t('intro')}</Help>} desc={t('intro')} />
      <div className="grid grid-cols-1 items-start gap-3">
        {/* PC: 시프티의 목록 — 「비활성화된 … 보기」 토글 + 열마다 검색 · 정렬이 되는 표 (2026-10-11 의뢰인 스샷). 폰은 아래의 탭 + 줄 목록 */}
        <div className="hidden flex-col gap-3 lg:flex">
          <OffToggle href={off ? '/admin/jobs' : '/admin/jobs?tab=off'} on={off} label={t('showOff')} />
          <PcTable
            labels={{ search: tc('colSearch'), empty: t(off ? 'emptyOff' : 'empty') }}
            cols={[{ key: 'name', label: t('colName') }, { key: 'color', label: t('colColor'), search: false, sort: false }, { key: 'people', label: t('colPeople'), align: 'right' }]}
            rows={shown.map((x) => ({
              id: x.id,
              cells: {
                name: { text: x.name, node: <Link href={`/admin/jobs/${x.id}`} className="font-bold hover:text-primary">{x.name}</Link> },
                color: { text: x.color, node: <span aria-hidden className={`inline-block size-5 rounded-sm align-middle ${SHIFT_COLOR_CLASS[x.color]}`} /> },
                people: { text: String(countOf.get(x.id) ?? 0) },
              },
            }))}
          />
        </div>
        <div className="flex flex-col gap-3 lg:hidden">
          {/* 폰도 PC와 같은 「꺼 둔 것 보기」 토글 (2026-10-17 의뢰인: PC · 폰 작동 방식을 같게) */}
          <OffToggle href={off ? '/admin/jobs' : '/admin/jobs?tab=off'} on={off} label={t('showOff')} />
          {!off && none > 0 && <p className="num rounded-card bg-bg p-5 text-sm text-muted">{t('noneCount', { n: none })}</p>}
          {shown.length === 0 && <p className="rounded-card bg-bg p-5 text-sm text-faint">{t(off ? 'emptyOff' : 'empty')}</p>}
          <RowList>
            {shown.map((x) => (
              <li key={x.id}>
                <Link href={`/admin/jobs/${x.id}`} className="flex min-h-16 items-center gap-3 px-5 py-3">
                  <span aria-hidden className={`w-1 shrink-0 self-stretch rounded-chip ${SHIFT_COLOR_CLASS[x.color]}`} />
                  <span className="min-w-0 flex-1 font-bold">{x.name}</span>
                  <span className="num shrink-0 text-sm text-muted">{t('people', { n: countOf.get(x.id) ?? 0 })}</span>
                  <ChevronRight aria-hidden size={20} className="shrink-0 text-faint" />
                </Link>
              </li>
            ))}
          </RowList>
        </div>
        <AddSheet id="job" title={t('add')} modal>
          <Card className="flex flex-col gap-3">
            <JobForm sheet="job" />
          </Card>
        </AddSheet>
      </div>
    </PageShell>
  );
}
