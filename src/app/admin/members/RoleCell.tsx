'use client';
// 직원 목록(PC 표)의 「권한」 칸 — 지금 권한을 보여 주고, 그 자리에서 관리자·급여 담당을 지정·해제한다
// (2026-10-06 의뢰인: 직원 상세까지 들어가지 않고 목록에서 권한을 주고 싶다).
// 규칙은 상세 화면과 같다 (staff-rules.ts — 서버가 다시 검사한다):
//  · 본인 권한은 스스로 못 바꾼다 · 확인 대기 중인 변경이 있으면 끝날 때까지 못 바꾼다
//  · 급여 담당은 급여 담당자만 지정·해제한다 · 다른 관리자가 있으면 그 관리자가 확인해야 반영된다
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button, Chip } from '@/components/ui';
import { ManageAction } from './[id]/ManageAction';

export function RoleCell({
  employeeId,
  role,
  canViewPayroll,
  self,
  waiting,
  actorCanPayroll,
}: {
  employeeId: string;
  role: string;
  canViewPayroll: boolean;
  self: boolean;
  waiting: boolean; // 권한 변경이 다른 관리자의 확인을 기다리는 중
  actorCanPayroll: boolean; // 지금 보는 관리자가 급여 담당자인가
}) {
  const t = useTranslations('admin.members');
  const tm = useTranslations('admin.manage');
  const [open, setOpen] = useState(false);
  const api = `/api/admin/employees/${employeeId}/role`;
  const admin = role === 'admin';

  return (
    <span className="flex flex-col gap-2">
      <span className="flex flex-wrap items-center gap-1">
        {admin ? <Chip tone="info">{t('adminChip')}</Chip> : <span className="text-muted">{t('roleEmployee')}</span>}
        {canViewPayroll && <Chip tone="info">{t('payrollChip')}</Chip>}
        {waiting && <Chip tone="warn">{t('roleWaiting')}</Chip>}
        {!self && !waiting && (
          <Button size="sm" variant="outline" aria-expanded={open} onClick={() => setOpen(!open)}>
            {t(open ? 'roleClose' : 'roleChange')}
          </Button>
        )}
      </span>
      {open && (
        <span className="block w-80 rounded-button border border-border bg-bg">
          {admin ? (
            <ManageAction title={tm('removeAdmin')} hint={tm('removeAdminHint')} confirmLabel={tm('removeAdmin')} endpoint={api} body={{ role: 'employee' }} presets={[tm('preset.handover'), tm('preset.mistake')]} />
          ) : (
            <ManageAction title={tm('makeAdmin')} hint={tm('makeAdminHint')} confirmLabel={tm('makeAdmin')} endpoint={api} body={{ role: 'admin' }} presets={[tm('preset.newAdmin'), tm('preset.handover')]} />
          )}
          {admin && actorCanPayroll && !canViewPayroll && (
            <ManageAction title={tm('grantPayroll')} hint={tm('grantPayrollHint')} confirmLabel={tm('grantPayroll')} endpoint={api} body={{ canViewPayroll: true }} presets={[tm('preset.payrollOwner')]} />
          )}
          {admin && actorCanPayroll && canViewPayroll && (
            <ManageAction title={tm('revokePayroll')} hint={tm('revokePayrollHint')} confirmLabel={tm('revokePayroll')} endpoint={api} body={{ canViewPayroll: false }} presets={[tm('preset.handover'), tm('preset.mistake')]} />
          )}
          {/* 급여 담당이 아닌 관리자에게는 왜 급여 담당 메뉴가 없는지 알려 준다 */}
          {!actorCanPayroll && <span className="block border-t border-border px-5 py-3 text-xs text-muted">{tm('payroll_only_grant')}</span>}
        </span>
      )}
    </span>
  );
}
