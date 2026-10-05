// 직원 상세 (2026-10-05 의뢰인: 샤플 대조) — 한 사람에 관한 일을 한 화면에서: 소속·연락처, 폰 등록, 기록 바로가기, 정보 수정.
// 지우는 버튼은 없다 (4-6). 퇴사·권한·폰 해제는 아래 「관리」 묶음에서 사유와 함께 한다.
import { CalendarDays, ChevronRight, Smartphone } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, CardTitle, Chip, PageShell } from '@/components/ui';
import { LOCALE_NAMES, LOCALES } from '@/i18n/locales';
import { getMe } from '@/lib/auth';
import { buildOrgTree, groupPath } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { resignChecklist } from '@/lib/staff-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';
import { NewInviteButton } from '../NewInviteButton';
import { ManageAction } from './ManageAction';
import { ProfileForm } from './ProfileForm';

export default async function MemberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations('admin.members');
  const tm = await getTranslations('admin.manage');
  const f = await getFormatter();
  const me = (await getMe())!;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = createAdminClient();
  const [{ data: p }, { data: keys }, groups] = await Promise.all([
    db.from('profiles').select('id, name, employee_no, role, active, joined_on, locale, can_view_payroll, group_id, phone, job_title').eq('id', id).maybeSingle(),
    db.from('user_passkeys').select('id, device_label, created_at, last_used_at').eq('employee_id', id).is('revoked_at', null),
    loadOrgGroups(),
  ]);
  if (!p) notFound();
  const key = keys?.[0] ?? null;
  const tree = buildOrgTree(groups);
  const options = tree.flatMap((d) => [{ id: d.id, label: d.name }, ...d.teams.map((x) => ({ id: x.id, label: `${d.name} › ${x.name}` }))]);
  const path = groupPath(groups, p.group_id);
  const day = (s: string) => f.dateTime(new Date(s), { dateStyle: 'medium' });
  // 관리 동작: 본인 것은 스스로 못 바꾼다 (R-2). 퇴사 처리 전에 남은 일을 보여 준다 (②-2 7-2 요점 3)
  const self = me.id === p.id;
  const todo = p.active && !self ? await resignChecklist(p.id) : null;
  const todoNotes = todo
    ? ([['overtime', todo.overtime], ['corrections', todo.corrections], ['leave', todo.leave], ['work', todo.work]] as const).filter(([, n]) => n > 0).map(([k, n]) => tm(`todo.${k}`, { n }))
    : [];
  const api = `/api/admin/employees/${p.id}`;

  return (
    <PageShell>
      <Link href="/admin/members" className="-mb-2 inline-flex min-h-11 items-center self-start text-sm font-medium text-muted">
        ‹ {t('title')}
      </Link>
      <header className="flex items-center gap-3 px-1">
        <span aria-hidden className="flex size-14 shrink-0 items-center justify-center rounded-chip bg-primary-tint text-xl font-extrabold text-primary">
          {p.name.slice(0, 1)}
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-extrabold tracking-tight">{p.name}</h1>
          <p className="truncate text-sm text-muted">{[p.job_title, path ?? t('unassigned')].filter(Boolean).join(' · ')}</p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="num text-xs text-faint">{p.employee_no}</span>
            {p.role === 'admin' && <Chip tone="info">{t('adminChip')}</Chip>}
            {p.can_view_payroll && <Chip tone="info">{t('payrollChip')}</Chip>}
            {!p.active && <Chip>{t('inactive')}</Chip>}
          </p>
        </div>
      </header>

      <Card className="flex flex-col gap-3">
        <CardTitle>{t('phoneCard')}</CardTitle>
        <div className="flex items-center gap-3">
          <Smartphone aria-hidden size={22} strokeWidth={1.75} className={`shrink-0 ${key ? 'text-ok' : 'text-warn'}`} />
          <div className="min-w-0 flex-1">
            <p className={`font-bold ${key ? '' : 'text-warn'}`}>{key ? (key.device_label || t('phoneOk')) : t('phoneNone')}</p>
            {key && (
              <p className="num text-xs text-muted">
                {t('phoneSince', { date: day(key.created_at) })}
                {key.last_used_at ? ` · ${t('phoneLast', { date: day(key.last_used_at) })}` : ''}
              </p>
            )}
          </div>
          {p.active && <NewInviteButton employeeId={p.id} name={p.name} compact again={!!key} />}
        </div>
        {p.active && <p className="text-xs text-faint">{t(key ? 'phoneChangeHint' : 'phoneInviteHint')}</p>}
      </Card>

      <Card className="p-0 py-1">
        <Link href={`/admin/records/${p.id}`} className="flex min-h-14 items-center gap-3 px-5">
          <CalendarDays aria-hidden size={20} strokeWidth={1.75} className="shrink-0 text-muted" />
          <span className="flex-1">{t('toRecords')}</span>
          <ChevronRight aria-hidden size={18} strokeWidth={2} className="text-faint" />
        </Link>
      </Card>

      <Card className="flex flex-col gap-4">
        <CardTitle>{t('profileTitle')}</CardTitle>
        <ProfileForm
          employeeId={p.id}
          initial={{ name: p.name, employeeNo: p.employee_no ?? '', phone: p.phone ?? '', groupId: p.group_id ?? '', jobTitle: p.job_title ?? '', joinedOn: p.joined_on ?? '', locale: p.locale }}
          groups={options}
          locales={LOCALES.map((code) => ({ code, name: LOCALE_NAMES[code] }))}
          today={toKstDate(new Date())}
        />
      </Card>

      <Card className="p-0 py-1">
        <div className="px-5 pt-3 pb-1">
          <CardTitle>{tm('title')}</CardTitle>
        </div>
        {self ? (
          <p className="px-5 py-3 text-sm text-muted">{tm('selfNote')}</p>
        ) : (
          <>
            {p.active && p.role !== 'admin' && (
              <ManageAction title={tm('makeAdmin')} hint={tm('makeAdminHint')} confirmLabel={tm('makeAdmin')} endpoint={`${api}/role`} body={{ role: 'admin' }} presets={[tm('preset.newAdmin'), tm('preset.handover')]} />
            )}
            {p.active && p.role === 'admin' && (
              <ManageAction title={tm('removeAdmin')} hint={tm('removeAdminHint')} confirmLabel={tm('removeAdmin')} endpoint={`${api}/role`} body={{ role: 'employee' }} presets={[tm('preset.handover'), tm('preset.mistake')]} />
            )}
            {p.active && p.role === 'admin' && me.canViewPayroll && !p.can_view_payroll && (
              <ManageAction title={tm('grantPayroll')} hint={tm('grantPayrollHint')} confirmLabel={tm('grantPayroll')} endpoint={`${api}/role`} body={{ canViewPayroll: true }} presets={[tm('preset.payrollOwner')]} />
            )}
            {p.active && p.role === 'admin' && me.canViewPayroll && p.can_view_payroll && (
              <ManageAction title={tm('revokePayroll')} hint={tm('revokePayrollHint')} confirmLabel={tm('revokePayroll')} endpoint={`${api}/role`} body={{ canViewPayroll: false }} presets={[tm('preset.handover'), tm('preset.mistake')]} />
            )}
            {key && (
              <ManageAction title={tm('revokePhone')} hint={tm('revokePhoneHint')} confirmLabel={tm('revokePhone')} endpoint={`${api}/phone`} body={{}} presets={[tm('preset.lost'), tm('preset.changed')]} notes={[tm('revokePhoneNote')]} danger />
            )}
            {p.active ? (
              <ManageAction title={tm('resign')} hint={tm('resignHint')} confirmLabel={tm('resign')} endpoint={`${api}/status`} body={{ action: 'resign' }} presets={[tm('preset.resigned'), tm('preset.contractEnd')]} notes={[tm('resignNote'), ...todoNotes]} danger />
            ) : (
              <ManageAction title={tm('reinstate')} hint={tm('reinstateHint')} confirmLabel={tm('reinstate')} endpoint={`${api}/status`} body={{ action: 'reinstate' }} presets={[tm('preset.rejoin'), tm('preset.mistake')]} />
            )}
          </>
        )}
      </Card>
    </PageShell>
  );
}
