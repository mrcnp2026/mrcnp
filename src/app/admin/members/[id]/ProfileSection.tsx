'use client';
// 기본 정보 — 평소에는 읽기 화면(두 칸씩), [고치기]를 누르면 입력 칸 (2026-10-16 의뢰인 디자인: 위의 칸 상자와 입력 칸이 같은 값을 두 번 보여 줬다).
import { Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { EmployeeValues, OrgOption } from '../EmployeeFields';
import { ProfileForm } from './ProfileForm';

export function ProfileSection({ employeeId, rows, initial, groups, today }: { employeeId: string; rows: { k: string; v: string }[]; initial: EmployeeValues; groups: OrgOption[]; today: string }) {
  const t = useTranslations('admin.members');
  const [editing, setEditing] = useState(false);
  if (editing) return <ProfileForm employeeId={employeeId} initial={initial} groups={groups} today={today} onDone={() => setEditing(false)} />;
  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.k} className="flex min-w-0 gap-3 border-b border-border py-2.5 text-sm">
            <dt className="w-24 shrink-0 text-muted">{r.k}</dt>
            <dd className="num min-w-0 flex-1 font-semibold break-words">{r.v}</dd>
          </div>
        ))}
      </dl>
      <button type="button" onClick={() => setEditing(true)} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-button border border-border bg-bg px-4 text-sm font-semibold hover:bg-surface lg:min-h-9 lg:self-start">
        <Pencil aria-hidden size={16} />
        {t('profileEdit')}
      </button>
    </div>
  );
}
