'use client';
// 최고관리자 직권 — 휴가 한 건의 「고치기」(양식이 펼쳐진다) · 「삭제」(관리자 휴가 취소). 2026-10-15 의뢰인.
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { LeaveCancel } from '@/app/admin/inbox/Decisions';
import { LeaveForm, type DirectLeave } from '@/app/punch/leave/LeaveForm';

type LeaveTypeOption = Parameters<typeof LeaveForm>[0]['types'][number];

export function DirectLeaveRow({ today, types, direct, name, approved, defaultOpen = false }: { today: string; types: LeaveTypeOption[]; direct: Required<Pick<DirectLeave, 'employeeId' | 'replaceId' | 'initial'>>; name: string; approved: boolean; defaultOpen?: boolean }) {
  const t = useTranslations('leave');
  const [open, setOpen] = useState(defaultOpen);
  return (
    // 버튼은 날짜 줄 오른쪽에 작게, 펼친 양식은 그 아래 한 줄 전체 (2026-10-17 디자인: 건마다 큰 버튼 줄이 따로 있어 30건이 길었다)
    <div className="contents">
      <div className="ml-auto flex items-center gap-2">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="min-h-9 rounded-button border border-border bg-bg px-3 text-sm font-bold text-primary" data-direct-leave-edit>
          {t(open ? 'directClose' : 'directEditOpen')}
        </button>
        {/* 대기 중인 휴가는 요청함에서 승인 · 거절한다 — 삭제(취소)는 승인된 것만 */}
        {approved && <LeaveCancel id={direct.replaceId} name={name} compact />}
      </div>
      {open && <div className="basis-full"><LeaveForm today={today} types={types} direct={direct} /></div>}
    </div>
  );
}
