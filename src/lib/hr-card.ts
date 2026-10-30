// 인사기록카드 (2026-10-29 남은 일 9-4) — 흩어져 있던 직원 정보를 한 장에. 새 표 없이 있는 표만 읽는다. 서버 전용.
// 화면(/admin/members/[id]/card)과 PDF가 같은 묶음(sections)을 쓴다 — 칸 이름까지 여기서 글자로 만들어 넘긴다.
// 급여 계약 칸은 급여를 볼 수 있는 관리자에게만. ★ 주민번호 · 계좌는 없다(모으지 않는다).
import 'server-only';
import { getTranslations } from 'next-intl/server';
import type { Me } from '@/lib/auth';
import { consentAt } from '@/lib/consent';
import { companyName } from '@/lib/company';
import { groupPath } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { loadStaffDetails } from '@/lib/staff-details';
import { loadStaffNotes } from '@/lib/staff-notes';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';

export type HrCardSection = { key: string; title: string; rows: [string, string][]; empty?: string; side: 'left' | 'right' }; // side: 화면 두 칸 중 어디(2026-10-30 의뢰인: 인사 기록은 위로, 재직 기간 · 급여 계약은 오른쪽)
export type HrCard = { name: string; employeeNo: string | null; company: string; printedOn: string; sections: HrCardSection[] };

export async function buildHrCard(employeeId: string, viewer: Me, locale = 'ko'): Promise<HrCard | null> {
  const db = createAdminClient();
  const [t, { data: p }, details, groups, notes, agreed, company, { data: periods }, { data: history }, { data: contracts }, { data: att }] = await Promise.all([
    getTranslations({ locale, namespace: 'hrCard' }),
    db.from('profiles').select('name, employee_no, phone, email, joined_on, job_title, group_id, role, active').eq('id', employeeId).maybeSingle(),
    loadStaffDetails(employeeId),
    loadOrgGroups(),
    loadStaffNotes(employeeId),
    consentAt(employeeId),
    companyName(),
    db.from('staff_employment_periods').select('starts_on, ends_on, end_reason').eq('employee_id', employeeId).eq('active', true).order('starts_on'),
    db.from('staff_assignment_history').select('group_id, job_title, valid_from, valid_to').eq('employee_id', employeeId).eq('active', true).order('valid_from'),
    viewer.canViewPayroll ? db.from('payroll_contract_versions').select('pay_type, amount, valid_from, valid_to').eq('employee_id', employeeId).eq('status', 'active').order('valid_from') : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    db.from('training_attendees').select('signed_at, training_sessions(held_on, training_courses(name))').eq('employee_id', employeeId).is('removed_at', null).not('signed_at', 'is', null).limit(200),
  ]);
  if (!p) return null;
  const nf = new Intl.NumberFormat(locale);
  const dash = (v: string | null | undefined) => (v && v.trim() ? v : '—');
  const range = (a: string | null, b: string | null) => `${a ?? '—'} ~ ${b ?? t('now')}`;
  const sections: HrCardSection[] = [
    {
      key: 'basic', side: 'left', title: t('s.basic'),
      rows: [
        [t('name'), p.name as string], [t('employeeNo'), dash(p.employee_no as string | null)], [t('group'), dash(groupPath(groups, p.group_id as string | null))],
        [t('job'), dash(p.job_title as string | null)], [t('joinedOn'), dash(p.joined_on as string | null)], [t('status'), t(p.active ? 'active' : 'left')],
        [t('role'), t(`roleOf.${p.role as string}`)], [t('phone'), dash(p.phone as string | null)], [t('email'), dash(p.email as string | null)],
      ],
    },
    {
      key: 'details', side: 'left', title: t('s.details'),
      rows: [
        [t('birth'), dash(details.birthDate)],
        ...details.emergencyContacts.map((c, i) => [t('emergency', { n: i + 1 }), [c.name, c.relation, c.phone].filter(Boolean).join(' · ')] as [string, string]),
        ...details.certificates.map((c) => [t('cert'), [c.name, c.acquiredOn, c.number].filter(Boolean).join(' · ')] as [string, string]),
        ...(details.carModel || details.carNumber ? [[t('car'), [details.carModel, details.carNumber].filter(Boolean).join(' · ')] as [string, string]] : []),
      ],
    },
    { key: 'employment', side: 'right', title: t('s.employment'), rows: (periods ?? []).map((x) => [range(x.starts_on as string, x.ends_on as string | null), dash(x.end_reason as string | null)] as [string, string]), empty: t('none') },
    { key: 'history', side: 'right', title: t('s.history'), rows: (history ?? []).map((x) => [range(x.valid_from as string, x.valid_to as string | null), [groupPath(groups, x.group_id as string | null), x.job_title].filter(Boolean).join(' · ') || '—'] as [string, string]), empty: t('none') },
    ...(viewer.canViewPayroll
      ? [{ key: 'contract', side: 'right' as const, title: t('s.contract'), rows: (contracts ?? []).map((x) => [range(x.valid_from as string, x.valid_to as string | null), `${t(`pay.${x.pay_type as string}`)} ${nf.format(Number(x.amount))}${t('won')}`] as [string, string]), empty: t('none') }]
      : []),
    {
      key: 'training', side: 'right', title: t('s.training'),
      rows: ((att ?? []) as unknown as { signed_at: string; training_sessions: { held_on: string; training_courses: { name: string } | null } | null }[])
        .filter((a) => a.training_sessions)
        .sort((a, b) => (a.training_sessions!.held_on < b.training_sessions!.held_on ? 1 : -1))
        .map((a) => [a.training_sessions!.held_on, a.training_sessions!.training_courses?.name ?? '—'] as [string, string]),
      empty: t('none'),
    },
    { key: 'notes', side: 'left', title: t('s.notes'), rows: (notes ?? []).slice(0, 15).map((n) => [n.createdAt.slice(0, 10), n.body] as [string, string]), empty: t('none') },
    { key: 'consent', side: 'right', title: t('s.consent'), rows: [[t('consentAt'), agreed ? agreed.slice(0, 10) : t('notAgreed')]] },
  ];
  // 순서: 왼쪽 기본 → 인사 기록 → 선택 정보, 오른쪽 재직 기간 → 급여 계약 → 소속 이력 → 교육 → 동의 (PDF는 왼쪽 다음 오른쪽)
  const ORDER = ['basic', 'notes', 'details', 'employment', 'contract', 'history', 'training', 'consent'];
  sections.sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));
  return { name: p.name as string, employeeNo: (p.employee_no as string | null) ?? null, company, printedOn: toKstDate(new Date()), sections };
}
