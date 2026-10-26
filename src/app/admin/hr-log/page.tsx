// 관리자 › 이력 · 내역 › 인사 변동 (2026-10-25 의뢰인: 직원 상세의 인사 기록 글과 퇴사 · 복직 · 권한 · 입사일 · 엑셀 내려받기를 한 목록으로 / 한 쪽 15줄 · 기록 글 선택 삭제).
// 줄 = 직원 상세 「인사 기록」에 남긴 글 + 퇴사 · 복직 · 권한 변경 · 입사일 수정 · 엑셀 내려받기. 관리자만 본다.
import { Download } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Pager, pageOf } from '@/components/Pager';
import { PageShell } from '@/components/ui';
import { getMe } from '@/lib/auth';
import { groupPath } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { loadHrLog } from '@/lib/hr-log';
import { HrLogTable } from './HrLogTable';

const PAGE_SIZE = 15;
const GROUPS = ['all', 'hr', 'role', 'joined', 'note', 'download'] as const;
type Group = (typeof GROUPS)[number];
const KIND_OF: Record<Group, readonly string[]> = { all: [], hr: ['resign', 'reinstate'], role: ['role'], joined: ['joined'], note: ['note'], download: ['download'] };

export default async function HrLogPage({ searchParams }: { searchParams: Promise<{ k?: string; p?: string }> }) {
  const me = await getMe();
  if (!me || me.role !== 'admin') notFound();
  const [t, tc, groups, all, sp] = await Promise.all([getTranslations('admin.resignLog'), getTranslations('common'), loadOrgGroups(), loadHrLog(), searchParams]);
  const k: Group = (GROUPS as readonly string[]).includes(sp.k ?? '') ? (sp.k as Group) : 'all';
  const count = (g: Group) => (g === 'all' ? all.length : all.filter((r) => KIND_OF[g].includes(r.kind)).length);
  const picked = k === 'all' ? all : all.filter((r) => KIND_OF[k].includes(r.kind));
  const { items, page, pages } = pageOf(picked, sp.p, PAGE_SIZE);
  const rows = items.map((r) => ({ key: r.key, noteId: r.noteId, employeeId: r.employeeId, name: r.name, employeeNo: r.employeeNo, group: groupPath(groups, r.groupId) ?? '', joinedOn: r.joinedOn, kind: r.kind, on: r.on, reason: r.reason, actor: r.actor }));
  return (
    <PageShell wide>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted">{t('intro')}</p>
        </div>
        <a href="/api/admin/export/list?kind=hrlog" className="inline-flex h-9 items-center gap-1 rounded-button border border-border bg-bg px-3.5 text-sm font-semibold whitespace-nowrap text-text hover:bg-surface">
          <Download aria-hidden size={16} />
          {tc('download')}
        </a>
      </div>
      <nav className="mt-4 flex flex-wrap gap-2" aria-label={t('filterLabel')}>
        {GROUPS.map((g) => (
          <Link key={g} href={g === 'all' ? '/admin/hr-log' : `/admin/hr-log?k=${g}`} aria-current={k === g ? 'true' : undefined} className={`inline-flex min-h-9 items-center gap-1.5 rounded-chip border px-3 text-sm ${k === g ? 'border-primary bg-primary-tint font-bold text-primary' : 'border-border bg-bg text-muted'}`}>
            {t(`filter.${g}`)} <b className="num">{count(g)}</b>
          </Link>
        ))}
      </nav>
      <div className="mt-3">
        <HrLogTable key={`${k}-${page}`} rows={rows} />
      </div>
      <Pager page={page} pages={pages} param="p" params={{ k: k === 'all' ? undefined : k }} label={t('pager')} />
      <p className="text-xs text-faint">{t('deleteNote')}</p>
    </PageShell>
  );
}
