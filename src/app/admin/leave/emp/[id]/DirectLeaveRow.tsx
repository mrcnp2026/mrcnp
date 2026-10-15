'use client';
// 최고관리자 직권 — 휴가 한 건의 「고치기」(양식이 펼쳐진다) · 「삭제」(관리자 휴가 취소). 2026-10-15 의뢰인.
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { LeaveCancel } from '@/app/admin/inbox/Decisions';
import { LeaveForm, type DirectLeave } from '@/app/punch/leave/LeaveForm';

type LeaveTypeOption = Parameters<typeof LeaveForm>[0]['types'][number];

export function DirectLeaveRow({ today, types, direct, name, approved }: { today: string; types: LeaveTypeOption[]; direct: Required<Pick<DirectLeave, 'employeeId' | 'replaceId' | 'initial'>>; name: string; approved: boolean }) {
  const t = useTranslations('leave');
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="min-h-11 rounded-button border border-border bg-bg px-3 text-sm font-bold text-primary" data-direct-leave-edit>
          {t(open ? 'directClose' : 'directEditOpen')}
        </button>
        {/* 대기 중인 휴가는 요청함에서 승인 · 거절한다 — 삭제(취소)는 승인된 것만 */}
        {approved && <LeaveCancel id={direct.replaceId} name={name} />}
      </div>
      {open && <LeaveForm today={today} types={types} direct={direct} />}
    </div>
  );
}
