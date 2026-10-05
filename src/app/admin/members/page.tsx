// ④ 직원 탭 — 조직도(부서 › 팀)로 묶어 본다 (2026-10-05 의뢰인: 샤플 대조). 누가 가입(비밀번호를 만듦)했고 누가 아직인지도 한눈에.
// 위: 전체·가입·미가입 걸러보기 / 가운데: 부서별 묶음 → 팀 → 직원 한 줄 (이름·직급·사번·가입 상태·초대 링크).
// 이름을 누르면 직원 상세(정보 수정·로그인·기록). 직원 추가와 조직도 관리는 각각 따로 화면이 있다.
import { Check, ChevronRight, Network, UserPlus } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Card, Chip, PageShell } from '@/components/ui';
import { groupPeople } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { NewInviteButton } from './NewInviteButton';

type Filter = 'all' | 'joined' | 'pending';
type Row = { id: string; name: string; employeeNo: string | null; role: string; active: boolean; groupId: string | null; jobTitle: string | null };

export default async function MembersPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const t = await getTranslations('admin.members');
  const sp = await searchParams;
  const filter: Filter = sp.f === 'joined' || sp.f === 'pending' ? sp.f : 'all';
  const db = createAdminClient();
  const [{ data: people }, { data: keys }, groups, { data: roleReqs }] = await Promise.all([
    db.from('profiles').select('id, name, employee_no, role, active, group_id, job_title, password_set_at').order('name'),
    db.from('user_passkeys').select('employee_id').is('revoked_at', null),
    loadOrgGroups(),
    db.from('role_change_requests').select('target_id').eq('status', 'pending'),
  ]);
  const roleWaiting = new Set((roleReqs ?? []).map((x) => x.target_id)); // 권한 변경 확인 대기 (R-2의 8)
  // 가입 = 비밀번호를 만들었거나, 예전 방식으로 폰(지문 로그인)을 등록해 둔 사람
  const withPhone = new Set([...(keys ?? []).map((k) => k.employee_id), ...(people ?? []).filter((p) => p.password_set_at).map((p) => p.id)]);
  // 검사 전용 계정(e2e-audit, e2e-audit2)은 검사 중에만 켜진다 — 꺼져 있으면 목록에 안 보이게
  const all: Row[] = (people ?? [])
    .filter((p) => p.active || !p.employee_no?.startsWith('e2e-audit'))
    .map((p) => ({ id: p.id, name: p.name, employeeNo: p.employee_no, role: p.role, active: p.active, groupId: p.group_id, jobTitle: p.job_title }));
  const active = all.filter((p) => p.active);
  const inactive = all.filter((p) => !p.active);
  const joined = active.filter((p) => withPhone.has(p.id));
  const pending = active.filter((p) => !withPhone.has(p.id));
  const list = filter === 'joined' ? joined : filter === 'pending' ? pending : active;
  const sections = groupPeople(groups, list).filter((s) => s.count > 0 || (filter === 'all' && s.dept));
  const tabs: { key: Filter; n: number }[] = [
    { key: 'all', n: active.length },
    { key: 'joined', n: joined.length },
    { key: 'pending', n: pending.length },
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
              {p.role === 'admin' && <Chip tone="info">{t('adminChip')}</Chip>}
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
        </Link>
        {p.active && !ok ? (
          <span className="shrink-0">
            <NewInviteButton employeeId={p.id} name={p.name} compact />
          </span>
        ) : (
          <ChevronRight aria-hidden size={18} strokeWidth={2} className="mr-2 shrink-0 text-faint" />
        )}
      </li>
    );
  };

  return (
    <PageShell>
      <header className="flex items-center justify-between gap-2 px-1 pt-2">
        <h1 className="text-2xl font-extrabold tracking-tight">{t('title')}</h1>
        <div className="flex shrink-0 items-center gap-2">
          <Link href="/admin/members/groups" className="inline-flex min-h-11 items-center gap-1 rounded-button bg-primary-tint px-3 text-sm font-bold text-primary">
            <Network aria-hidden size={18} strokeWidth={2} />
            {t('orgShort')}
          </Link>
          <Link href="/admin/members/new" className="inline-flex min-h-11 items-center gap-1 rounded-button bg-primary px-4 text-sm font-bold text-on-primary">
            <UserPlus aria-hidden size={18} strokeWidth={2} />
            {t('addShort')}
          </Link>
        </div>
      </header>

      {/* 걸러보기 — 숫자가 곧 현황 (가입 9 · 미가입 2) */}
      <nav className="grid grid-cols-3 rounded-card bg-bg p-1" aria-label={t('filter')}>
        {tabs.map((x) => (
          <Link
            key={x.key}
            href={x.key === 'all' ? '/admin/members' : `/admin/members?f=${x.key}`}
            scroll={false}
            aria-current={filter === x.key ? 'page' : undefined}
            className={`flex min-h-12 flex-col items-center justify-center rounded-button ${filter === x.key ? 'bg-primary-tint text-primary' : 'text-muted'}`}
          >
            <span className={`num text-xl leading-none font-extrabold ${x.key === 'pending' && x.n > 0 && filter !== x.key ? 'text-warn' : ''}`}>{x.n}</span>
            <span className="text-xs font-medium">{t(`f_${x.key}`)}</span>
          </Link>
        ))}
      </nav>

      {all.length === 0 && <p className="px-1 text-muted">{t('empty')}</p>}
      {all.length > 0 && list.length === 0 && <p className="px-1 text-muted">{t('emptyFilter')}</p>}
      {groups.filter((g) => g.active).length === 0 && active.length > 0 && (
        <p className="rounded-card bg-primary-tint p-3 text-sm text-primary">{t('orgEmptyHint')}</p>
      )}

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

      {filter === 'all' && inactive.length > 0 && (
        <details className="rounded-card bg-bg">
          <summary className="flex min-h-12 cursor-pointer items-center justify-between px-5 text-sm text-muted">
            <span>{t('inactiveTitle')}</span>
            <span className="num text-faint">{t('count', { n: inactive.length })}</span>
          </summary>
          <ul className="pb-1">{inactive.map(row)}</ul>
        </details>
      )}
    </PageShell>
  );
}
