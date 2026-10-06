// 직원 상세 (2026-10-05 의뢰인: 샤플 대조) — 한 사람에 관한 일을 한 화면에서: 소속·연락처, 로그인(가입 여부), 기록 바로가기, 정보 수정.
// 지우는 버튼은 없다 (4-6). 퇴사·권한·로그인 초기화는 아래 「관리」 묶음에서 사유와 함께 한다.
import { CalendarDays, ChevronRight, KeyRound, Smartphone } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, CardTitle, Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { LOCALE_NAMES, LOCALES } from '@/i18n/locales';
import { getMe } from '@/lib/auth';
import { consentAt } from '@/lib/consent';
import { buildOrgTree, groupPath } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { resignChecklist } from '@/lib/staff-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';
import { NewInviteButton } from '../NewInviteButton';
import { ManageAction } from './ManageAction';
import { RoleRequestCard } from './RoleRequestCard';
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
    db.from('profiles').select('id, name, employee_no, role, active, joined_on, locale, can_view_payroll, group_id, phone, job_title, password_set_at').eq('id', id).maybeSingle(),
    db.from('user_passkeys').select('id, device_label, created_at, last_used_at').eq('employee_id', id).is('revoked_at', null),
    loadOrgGroups(),
  ]);
  if (!p) notFound();
  // 가입 = 비밀번호를 만들었거나, 출퇴근 기기를 등록해 둔 사람. 출퇴근 기기(key)는 직원당 1대
  const key = keys?.[0] ?? null;
  const hasPasskey = !!key;
  const joined = !!p.password_set_at || hasPasskey;
  const tree = buildOrgTree(groups);
  const options = tree.flatMap((d) => [{ id: d.id, label: d.name }, ...d.teams.map((x) => ({ id: x.id, label: `${d.name} › ${x.name}` }))]);
  const path = groupPath(groups, p.group_id);
  const day = (s: string) => f.dateTime(new Date(s), { dateStyle: 'medium' });
  const agreedAt = await consentAt(p.id);
  // 관리 동작: 본인 것은 스스로 못 바꾼다 (R-2). 퇴사 처리 전에 남은 일을 보여 준다 (②-2 7-2 요점 3)
  const self = me.id === p.id;
  const todo = p.active && !self ? await resignChecklist(p.id) : null;
  const todoNotes = todo
    ? ([['overtime', todo.overtime], ['corrections', todo.corrections], ['leave', todo.leave], ['work', todo.work]] as const).filter(([, n]) => n > 0).map(([k, n]) => tm(`todo.${k}`, { n }))
    : [];
  const api = `/api/admin/employees/${p.id}`;
  // 오너는 다른 관리자가 있어도 자기 출퇴근 기기를 직접 해제한다 (staff-rules.checkDeviceRevoke)
  const soleAdmin = self && (me.employeeNo === OFFICE.ownerEmployeeNo || ((await db.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin').eq('active', true).neq('id', me.id)).count ?? 0) === 0);
  // 대기 중인 권한 변경 (두 번째 관리자 확인, R-2의 8)
  const { data: pendingRole } = await db.from('role_change_requests').select('id, new_role, new_can_view_payroll, reason, requested_by').eq('target_id', p.id).eq('status', 'pending').maybeSingle();
  const requesterName = pendingRole ? ((await db.from('profiles').select('name').eq('id', pendingRole.requested_by).maybeSingle()).data?.name ?? '') : '';
  const changeLabel = pendingRole
    ? [
        pendingRole.new_role !== p.role ? tm(pendingRole.new_role === 'admin' ? 'makeAdmin' : 'removeAdmin') : null,
        pendingRole.new_role === 'admin' && pendingRole.new_can_view_payroll !== p.can_view_payroll ? tm(pendingRole.new_can_view_payroll ? 'grantPayroll' : 'revokePayroll') : null,
      ].filter(Boolean).join(' · ')
    : '';

  return (
    <PageShell wide>
      <Link href="/admin/members" className="-mb-2 inline-flex min-h-11 min-w-11 items-center self-start text-sm font-medium text-muted">
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
            {p.active && (agreedAt ? <Chip tone="ok">{t('consentYes', { date: day(agreedAt) })}</Chip> : <Chip tone="warn">{t('consentNo')}</Chip>)}
          </p>
        </div>
      </header>

      {pendingRole && <RoleRequestCard id={pendingRole.id} change={changeLabel} requester={requesterName} reason={pendingRole.reason} mine={pendingRole.requested_by === me.id} />}

      {/* PC: 윗줄 = 로그인 | 기록 바로가기·관리, 아랫줄 = 정보 수정 (2026-10-06 의뢰인) · 폰: 한 칸 */}
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:gap-4">
      <Card className="flex flex-col gap-3 lg:row-span-2">
        <CardTitle>{t('loginCard')}</CardTitle>
        <div className="flex items-center gap-3">
          <KeyRound aria-hidden size={22} strokeWidth={1.75} className={`shrink-0 ${joined ? 'text-ok' : 'text-warn'}`} />
          <div className="min-w-0 flex-1">
            <p className={`font-bold ${joined ? '' : 'text-warn'}`}>{t(joined ? 'loginReady' : 'loginNone')}</p>
            <p className="num text-xs text-muted">
              {t('loginId', { no: p.employee_no ?? '' })}
              {p.password_set_at ? ` · ${t('loginSince', { date: day(p.password_set_at) })}` : hasPasskey ? ` · ${t('loginPasskeyOnly')}` : ''}
            </p>
          </div>
          {p.active && <NewInviteButton employeeId={p.id} name={p.name} compact again={joined} />}
        </div>
        {p.active && <p className="text-xs text-faint">{t(joined ? 'loginResetHint' : 'loginInviteHint')}</p>}
        {/* 출퇴근 기기: 직원이 자기 폰에서 직접 등록한다. 바꾸려면 아래 「관리 › 출퇴근 기기 해제」 */}
        <div className="flex items-center gap-3 border-t border-border pt-3">
          <Smartphone aria-hidden size={22} strokeWidth={1.75} className={`shrink-0 ${key ? 'text-ok' : 'text-warn'}`} />
          <div className="min-w-0 flex-1">
            <p className={`font-bold ${key ? '' : 'text-warn'}`}>{key ? t('deviceOk', { label: key.device_label || t('deviceUnknown') }) : t('deviceNone')}</p>
            <p className="num text-xs text-muted">
              {key ? `${t('deviceSince', { date: day(key.created_at) })}${key.last_used_at ? ` · ${t('deviceLast', { date: day(key.last_used_at) })}` : ''}` : t('deviceNoneHint')}
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-0 py-1">
        <Link href={`/admin/records/${p.id}`} className="flex min-h-14 items-center gap-3 px-5">
          <CalendarDays aria-hidden size={20} strokeWidth={1.75} className="shrink-0 text-muted" />
          <span className="flex-1">{t('toRecords')}</span>
          <ChevronRight aria-hidden size={18} strokeWidth={2} className="text-faint" />
        </Link>
      </Card>

      <Card className="flex flex-col gap-4 lg:col-span-2 lg:row-start-3">
        <CardTitle>{t('profileTitle')}</CardTitle>
        <ProfileForm
          employeeId={p.id}
          initial={{ name: p.name, employeeNo: p.employee_no ?? '', phone: p.phone ?? '', groupId: p.group_id ?? '', jobTitle: p.job_title ?? '', joinedOn: p.joined_on ?? '', locale: p.locale }}
          groups={options}
          locales={LOCALES.map((code) => ({ code, name: LOCALE_NAMES[code] }))}
          today={toKstDate(new Date())}
        />
      </Card>

      <Card className="p-0 py-1 lg:col-start-2 lg:row-start-2">
        <div className="px-5 pt-3 pb-1">
          <CardTitle>{tm('title')}</CardTitle>
        </div>
        {self ? (
          <>
            <p className="px-5 py-3 text-sm text-muted">{tm('selfNote')}</p>
            {/* 관리자가 혼자면 자기 출퇴근 기기는 스스로 해제할 수 있다 — 아니면 폰을 바꿀 길이 없다 */}
            {key && soleAdmin && (
              <ManageAction title={tm('revokeDevice')} hint={tm('revokeDeviceHint')} confirmLabel={tm('revokeDevice')} endpoint={`${api}/device`} body={{}} presets={[tm('preset.lost'), tm('preset.newPhone')]} notes={[tm('revokeDeviceNote')]} danger />
            )}
          </>
        ) : (
          <>
            {pendingRole && <p className="px-5 py-3 text-sm text-muted">{tm('pendingHide')}</p>}
            {!pendingRole && p.active && p.role !== 'admin' && (
              <ManageAction title={tm('makeAdmin')} hint={tm('makeAdminHint')} confirmLabel={tm('makeAdmin')} endpoint={`${api}/role`} body={{ role: 'admin' }} presets={[tm('preset.newAdmin'), tm('preset.handover')]} />
            )}
            {!pendingRole && p.active && p.role === 'admin' && (
              <ManageAction title={tm('removeAdmin')} hint={tm('removeAdminHint')} confirmLabel={tm('removeAdmin')} endpoint={`${api}/role`} body={{ role: 'employee' }} presets={[tm('preset.handover'), tm('preset.mistake')]} />
            )}
            {!pendingRole && p.active && p.role === 'admin' && me.canViewPayroll && !p.can_view_payroll && (
              <ManageAction title={tm('grantPayroll')} hint={tm('grantPayrollHint')} confirmLabel={tm('grantPayroll')} endpoint={`${api}/role`} body={{ canViewPayroll: true }} presets={[tm('preset.payrollOwner')]} />
            )}
            {!pendingRole && p.active && p.role === 'admin' && me.canViewPayroll && p.can_view_payroll && (
              <ManageAction title={tm('revokePayroll')} hint={tm('revokePayrollHint')} confirmLabel={tm('revokePayroll')} endpoint={`${api}/role`} body={{ canViewPayroll: false }} presets={[tm('preset.handover'), tm('preset.mistake')]} />
            )}
            {key && (
              <ManageAction title={tm('revokeDevice')} hint={tm('revokeDeviceHint')} confirmLabel={tm('revokeDevice')} endpoint={`${api}/device`} body={{}} presets={[tm('preset.lost'), tm('preset.newPhone')]} notes={[tm('revokeDeviceNote')]} danger />
            )}
            {joined && (
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
      </div>
    </PageShell>
  );
}
