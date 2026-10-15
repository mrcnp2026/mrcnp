// ④ 직원 탭 — 조직도(부서 › 팀)로 묶어 본다 (2026-10-05 의뢰인: 샤플 대조). 누가 가입(비밀번호를 만듦)했고 누가 아직인지도 한눈에.
// 위: 전체·가입·미가입 걸러보기 / 가운데: 부서별 묶음 → 팀 → 직원 한 줄 (이름·직급·사번·가입 상태·초대 링크).
// 이름을 누르면 직원 상세(정보 수정·로그인·기록). 직원 추가와 조직도 관리는 각각 따로 화면이 있다.
import { CalendarCheck, Check, ChevronRight, Download, Network } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { AddSheet } from '@/components/AddSheet';
import { DetailBar } from '@/components/detail';
import { PcTable } from '@/components/PcTable';
import { Card, Chip, PageShell } from '@/components/ui';
import { LOCALE_NAMES, LOCALES } from '@/i18n/locales';
import { loadJobs } from '@/lib/job-data';
import { buildOrgTree, groupPath, groupPeople } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { getMe } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';
import { RegisterWizard } from './new/RegisterWizard';
import { NewInviteButton } from './NewInviteButton';
import { RoleCell } from './RoleCell';

// 탭 (2026-10-11 의뢰인: 시프티의 직원 관리처럼) — 현재직원(가입을 마친 사람) · 미합류(초대했지만 아직 가입 전) · 비활성(퇴사 등으로 꺼 둔 사람)
type Filter = 'current' | 'pending' | 'inactive';
type Row = { id: string; name: string; employeeNo: string | null; role: string; active: boolean; groupId: string | null; jobTitle: string | null; canViewPayroll: boolean; joinedOn: string | null; jobId: string | null; level: 'super' | 'ceo' | 'general' | null };

export default async function MembersPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const t = await getTranslations('admin.members');
  const tc = await getTranslations('common');
  const sp = await searchParams;
  const filter: Filter = sp.f === 'pending' || sp.f === 'inactive' ? sp.f : 'current';
  const db = createAdminClient();
  const me = (await getMe())!;
  const [{ data: people }, { data: keys }, groups, { data: roleReqs }, jobs] = await Promise.all([
    // (맨 끝) 직무: 표의 직무 열과 추가 팝업의 고르기 칸
    db.from('profiles').select('id, name, employee_no, role, active, group_id, job_title, password_set_at, can_view_payroll, joined_on, job_id, admin_level').order('name'),
    db.from('user_passkeys').select('employee_id').is('revoked_at', null),
    loadOrgGroups(),
    db.from('role_change_requests').select('target_id').eq('status', 'pending'),
    loadJobs(),
  ]);
  const jobName = new Map(jobs.map((j) => [j.id, j.name]));
  const roleWaiting = new Set((roleReqs ?? []).map((x) => x.target_id)); // 권한 변경 확인 대기 (R-2의 8)
  // 가입 = 비밀번호를 만들었거나, 예전 방식으로 폰(지문 로그인)을 등록해 둔 사람
  const withPhone = new Set([...(keys ?? []).map((k) => k.employee_id), ...(people ?? []).filter((p) => p.password_set_at).map((p) => p.id)]);
  // 검사 전용 계정(e2e-audit, e2e-audit2)은 검사 중에만 켜진다 — 꺼져 있으면 목록에 안 보이게
  const all: Row[] = (people ?? [])
    .filter((p) => p.active || !p.employee_no?.startsWith('e2e-audit'))
    .map((p) => ({ id: p.id, name: p.name, employeeNo: p.employee_no, role: p.role, active: p.active, groupId: p.group_id, jobTitle: p.job_title, canViewPayroll: p.can_view_payroll, joinedOn: p.joined_on, jobId: p.job_id, level: (p.role === 'admin' ? (p.admin_level ?? 'general') : null) as 'super' | 'ceo' | 'general' | null }));
  const active = all.filter((p) => p.active);
  const inactive = all.filter((p) => !p.active);
  const joined = active.filter((p) => withPhone.has(p.id));
  const pending = active.filter((p) => !withPhone.has(p.id));
  const list = filter === 'pending' ? pending : filter === 'inactive' ? inactive : joined;
  const sections = groupPeople(groups, list).filter((s) => s.count > 0 || (filter === 'current' && s.dept));
  const tabs: { key: Filter; n: number }[] = [
    { key: 'current', n: joined.length },
    { key: 'pending', n: pending.length },
    { key: 'inactive', n: inactive.length },
  ];

  const row = (p: Row) => {
    const ok = withPhone.has(p.id);
    return (
      <li key={p.id} className={`flex min-h-16 items-center gap-2 py-2 pr-3 pl-5 ${p.active ? '' : 'opacity-60'}`}>
        <Link href={`/admin/members/${p.id}`} className="flex min-h-12 min-w-0 flex-1 items-center gap-3">
          <span aria-hidden className={`flex size-10 shrink-0 items-center justify-center rounded-chip font-bold ${ok ? 'bg-primary-tint text-primary' : 'bg-warn-tint text-warn'}`}>
            {p.name.slice(0, 1)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="truncate font-medium">{p.name}</span>
              {p.jobTitle && <span className="shrink-0 text-xs text-muted">{p.jobTitle}</span>}
              {p.role === 'admin' && <Chip tone="info">{t(p.level === 'super' ? 'levelSuper' : p.level === 'ceo' ? 'levelCeo' : 'levelGeneral')}</Chip>}
              {p.role === 'manager' && <Chip tone="info">{t('managerChip')}</Chip>}
              {p.canViewPayroll && <Chip tone="info">{t('payrollChip')}</Chip>}
              {roleWaiting.has(p.id) && <Chip tone="warn">{t('roleWaiting')}</Chip>}
            </span>
            <span className="num flex items-center gap-1 truncate text-xs">
              <span className="text-faint">{p.employeeNo}</span>
              <span className="text-faint">·</span>
              {!p.active ? (
                <span className="text-faint">{t('inactive')}</span>
              ) : ok ? (
                <span className="inline-flex items-center gap-0.5 font-bold text-ok">
                  <Check aria-hidden size={12} strokeWidth={3} />
                  {t('joined')}
                </span>
              ) : (
                <span className="font-bold text-warn">{t('notJoined')}</span>
              )}
            </span>
          </span>
          {/* > 까지 링크 안에 둔다 — 화살표를 눌러도 상세로 간다 (2026-10-06 의뢰인) */}
          {!(p.active && !ok) && <ChevronRight aria-hidden size={18} strokeWidth={2} className="mr-2 shrink-0 text-faint" />}
        </Link>
        {p.active && !ok && (
          <span className="shrink-0">
            <NewInviteButton employeeId={p.id} name={p.name} compact />
          </span>
        )}
      </li>
    );
  };

  return (
    <PageShell wide>
      <DetailBar back="/punch" backLabel={tc('back')} title={t('title')} desc={t('pcIntro')}
        extra={
          <>
          <a href="/api/admin/export/list?kind=members" className="hidden h-8 items-center gap-1 rounded-button border border-border bg-bg px-3.5 text-sm font-semibold whitespace-nowrap text-text hover:bg-surface lg:inline-flex">
            <Download aria-hidden size={16} />
            {tc('download')}
          </a>
            <Link href="/admin/members/new" className="inline-flex min-h-11 shrink-0 items-center px-2 text-base font-bold text-primary lg:hidden">
              + {t('addShort')}
            </Link>
            </>
        }
        sheet={{ id: 'member', label: t('addTitle') }}
      />
      {/* PC: 가운데 팝업(두 칸) · 폰: 따로 화면(/admin/members/new) */}
      <AddSheet id="member" title={t('addTitle')} modal wide className="hidden">
        <div className="flex flex-col gap-4">
          <RegisterWizard popup groups={buildOrgTree(groups).flatMap((d) => [{ id: d.id, label: d.name }, ...d.teams.map((x) => ({ id: x.id, label: `${d.name} › ${x.name}` }))])} jobs={jobs.filter((j) => j.active).map((j) => ({ id: j.id, label: j.name }))} locales={LOCALES.map((code) => ({ code, name: LOCALE_NAMES[code] }))} today={toKstDate(new Date())} />
        </div>
      </AddSheet>
      {/* 걸러보기 — 숫자가 곧 현황 (가입 9 · 미가입 2). 시프티의 「현재직원 / 미합류 / 비활성」 탭 줄 모양 */}
      <nav className="-mx-4 -mt-3 flex border-b border-border bg-bg px-2 lg:mx-0 lg:mt-0 lg:rounded-card lg:border-0" aria-label={t('filter')}>
        {tabs.map((x) => (
          <Link
            key={x.key}
            href={x.key === 'current' ? '/admin/members' : `/admin/members?f=${x.key}`}
            scroll={false}
            aria-current={filter === x.key ? 'page' : undefined}
            className={`flex min-h-12 flex-1 items-center justify-center gap-2 border-b-2 text-base font-bold whitespace-nowrap ${filter === x.key ? 'border-text text-text' : 'border-transparent text-muted'}`}
          >
            {t(`f_${x.key}`)}
            <span className={`num min-w-6 rounded-button px-1.5 text-center text-xs leading-5 font-bold ${x.key === 'pending' && x.n > 0 ? 'bg-warn text-on-primary' : 'bg-surface text-muted'}`}>{x.n}</span>
          </Link>
        ))}
      </nav>
      <div className="flex gap-2 lg:hidden">
        <Link href="/admin/leave" className="inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-button border border-border bg-bg px-3 text-sm font-bold text-primary">
          <CalendarCheck aria-hidden size={18} strokeWidth={2} />
          {t('leaveShort')}
        </Link>
        <Link href="/admin/members/groups" className="inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-button border border-border bg-bg px-3 text-sm font-bold text-primary">
          <Network aria-hidden size={18} strokeWidth={2} />
          {t('orgShort')}
        </Link>
      </div>

      {all.length === 0 && <p className="px-1 text-muted">{t('empty')}</p>}
      {all.length > 0 && list.length === 0 && <p className="px-1 text-muted">{t('emptyFilter')}</p>}
      {groups.filter((g) => g.active).length === 0 && active.length > 0 && (
        <p className="rounded-card bg-primary-tint p-3 text-sm text-primary">{t('orgEmptyHint')}</p>
      )}

      {/* PC: 시프티의 「직원 관리」 표 — 열마다 검색 · 정렬 (2026-10-11) · 폰: 부서별 카드 */}
      <div className="hidden lg:block">
        <PcTable
          total
          labels={{ search: t('colSearch'), empty: t('emptyFilter'), total: t('totalCount') }}
          cols={[
            { key: 'name', label: t('colName') },
            { key: 'role', label: t('colRole') },
            { key: 'no', label: t('colNo') },
            { key: 'group', label: t('colGroup') },
            { key: 'title', label: t('colTitle') },
            { key: 'job', label: t('colJob') },
            { key: 'joined', label: t('infoJoined') },
            { key: 'status', label: t('colStatus') },
            { key: 'act', label: '', search: false, sort: false, align: 'right' },
          ]}
          rows={list.map((p) => {
            const ok = withPhone.has(p.id);
            const roleText = [p.role === 'admin' ? t(p.level === 'super' ? 'levelSuper' : p.level === 'ceo' ? 'levelCeo' : 'levelGeneral') : p.role === 'manager' ? t('managerChip') : t('employeeRole'), p.canViewPayroll ? t('payrollChip') : ''].filter(Boolean).join(' ');
            return {
              id: p.id,
              dim: !p.active,
              cells: {
                name: { text: p.name, node: <Link href={`/admin/members/${p.id}`} className="font-bold hover:text-primary">{p.name}</Link> },
                role: { text: roleText, node: <RoleCell employeeId={p.id} role={p.role} canViewPayroll={p.canViewPayroll} self={p.id === me.id} waiting={roleWaiting.has(p.id)} actorCanPayroll={me.canViewPayroll} level={p.level} actorTop={me.top} /> },
                no: { text: p.employeeNo ?? '' },
                group: { text: groupPath(groups, p.groupId) ?? t('unassigned') },
                title: { text: p.jobTitle ?? '' },
                job: { text: (p.jobId && jobName.get(p.jobId)) || '' },
                joined: { text: p.joinedOn ?? '', node: <span className="num whitespace-nowrap">{p.joinedOn ?? ''}</span> },
                status: { text: !p.active ? t('inactive') : ok ? t('joined') : t('notJoined'), node: !p.active ? <Chip>{t('inactive')}</Chip> : ok ? <Chip tone="ok">{t('joined')}</Chip> : <Chip tone="warn">{t('notJoined')}</Chip> },
                act: { text: '', node: p.active && !ok ? <NewInviteButton employeeId={p.id} name={p.name} compact /> : null },
              },
            };
          })}
        />
      </div>

      <div className="flex flex-col gap-3 lg:hidden">
      {sections.map((s) => (
        <Card key={s.dept?.id ?? 'none'} className="p-0 py-1">
          <h2 className="flex min-h-11 items-center justify-between px-5 pt-1">
            <span className="font-bold">{s.dept ? s.dept.name : t('unassigned')}</span>
            <span className="num text-sm text-faint">{t('count', { n: s.count })}</span>
          </h2>
          {s.count === 0 && <p className="px-5 pb-3 text-sm text-faint">{t('groupEmpty')}</p>}
          {s.direct.length > 0 && <ul>{s.direct.map(row)}</ul>}
          {s.teams
            .filter((x) => x.people.length > 0)
            .map((x) => (
              <section key={x.team.id}>
                <h3 className="flex min-h-9 items-center gap-2 bg-surface px-5 text-xs font-bold text-muted">
                  {x.team.name}
                  <span className="num font-medium text-faint">{x.people.length}</span>
                </h3>
                <ul>{x.people.map(row)}</ul>
              </section>
            ))}
        </Card>
      ))}
      </div>

    </PageShell>
  );
}
