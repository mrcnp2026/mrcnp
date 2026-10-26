// 조직도 (직원용) — 부서 › 팀 › 사람, 오늘 자리에 없는 사람 표시 (PRD v1.3 37.4, L18 · L20).
// ★ 보이는 것: 이름 · 직책 · 소속, 그리고 「오늘 휴가」 / 「오늘 외근 · 출장 · 재택」뿐이다(승인된 것만).
// ★ 보이지 않는 것: 휴가 종류 · 사유 · 잔여 · 증빙 · 전화번호 · 급여. 하루보다 짧은 휴가는 「부분 휴가」로만 보인다.
// 폰에서 가로로 넘치지 않게 한 줄씩 쌓는다.
import { getTranslations } from 'next-intl/server';
import { HelpTip } from '@/components/Help';
import { redirect } from 'next/navigation';
import { Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { getMe } from '@/lib/auth';
import { groupPeople } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';

export default async function OrgPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const me = await getMe();
  if (!me) redirect('/login');
  const [t, sp] = await Promise.all([getTranslations('org'), searchParams]);
  const today = toKstDate(new Date());
  const db = createAdminClient();
  // 조직도는 전 직원이 본다(지점관리자의 열람 범위와 무관한 공개 정보) — 그래서 범위를 거는 읽기 함수를 쓰지 않고, 필요한 칸만 직접 읽는다
  const [groups, { data: people }, { data: leaves }, { data: works }] = await Promise.all([
    loadOrgGroups(),
    db.from('profiles').select('id, name, employee_no, job_title, group_id').eq('active', true).order('name'),
    db.from('leave_requests').select('employee_id, days').eq('status', 'approved').eq('is_test', OFFICE.practiceMode).lte('start_date', today).gte('end_date', today),
    db.from('work_requests').select('employee_id').eq('status', 'approved').eq('is_test', OFFICE.practiceMode).lte('start_date', today).gte('end_date', today),
  ]);
  const q = (sp.q ?? '').trim().slice(0, 40).toLowerCase();
  const list = (people ?? [])
    .filter((p) => !(p.employee_no as string | null)?.startsWith('e2e-') && p.employee_no !== OFFICE.ownerEmployeeNo) // 시스템관리자는 직원이 아니다 (2026-10-17)
    .filter((p) => !q || (p.name as string).toLowerCase().includes(q) || ((p.job_title as string | null) ?? '').toLowerCase().includes(q))
    .map((p) => ({ id: p.id as string, name: p.name as string, title: (p.job_title as string | null) ?? '', groupId: p.group_id as string | null }));
  const away = new Map<string, 'leave' | 'partLeave' | 'out'>();
  for (const w of works ?? []) away.set(w.employee_id as string, 'out');
  for (const l of leaves ?? []) away.set(l.employee_id as string, Number(l.days) >= 1 ? 'leave' : 'partLeave');
  const sections = groupPeople(groups, list).filter((s) => s.count > 0);
  const person = (p: (typeof list)[number]) => (
    <li key={p.id} className="flex min-h-11 min-w-0 items-center justify-between gap-2 border-b border-border py-1.5">
      <span className="min-w-0">
        <span className="block truncate font-bold">{p.name}</span>
        {p.title && <span className="block truncate text-xs text-muted">{p.title}</span>}
      </span>
      {away.has(p.id) && <Chip tone={away.get(p.id) === 'out' ? 'info' : 'warn'}>{t(`away.${away.get(p.id)}`)}</Chip>}
    </li>
  );

  return (
    <PageShell>
      <div>
        <h1 className="flex flex-wrap items-center gap-x-1 text-2xl font-bold">{t('title')}<HelpTip>{t('intro')}</HelpTip></h1>
      </div>
      <form action="/punch/org" className="flex gap-2">
        <input name="q" defaultValue={sp.q ?? ''} placeholder={t('search')} aria-label={t('search')} className="min-h-11 min-w-0 flex-1 rounded-button border border-border bg-bg px-3" autoComplete="off" />
        <button type="submit" className="inline-flex min-h-11 items-center rounded-button bg-primary px-4 font-bold text-on-primary">
          {t('find')}
        </button>
      </form>
      {sections.length === 0 && <p className="rounded-card bg-bg p-5 text-sm text-faint">{t('empty')}</p>}
      {sections.map((s) => (
        <section key={s.dept?.id ?? 'none'} className="rounded-card border border-border bg-bg p-4">
          <h2 className="flex items-center justify-between gap-2 text-lg font-bold">
            <span className="truncate">{s.dept?.name ?? t('unassigned')}</span>
            <span className="num text-sm font-normal text-muted">{t('count', { n: s.count })}</span>
          </h2>
          {/* 두 줄로 나란히 — 한 사람 한 줄이면 1공장(12명)만으로 화면이 다 찼다 (2026-10-17 디자인) */}
          {s.direct.length > 0 && <ul className="grid grid-cols-2 gap-x-4 pt-1 lg:grid-cols-3">{s.direct.map(person)}</ul>}
          {s.teams.filter((x) => x.people.length > 0).map((x) => (
            <div key={x.team.id} className="pt-3">
              <h3 className="truncate text-sm font-bold text-muted">{x.team.label}</h3>
              <ul className="grid grid-cols-2 gap-x-4 lg:grid-cols-3">{x.people.map(person)}</ul>
            </div>
          ))}
        </section>
      ))}
      <p className="text-xs text-faint">{t('note')}</p>
    </PageShell>
  );
}
