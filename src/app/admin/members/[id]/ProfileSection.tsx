'use client';
// 기본 정보 — 평소에는 읽기 화면(두 칸씩), [고치기]를 누르면 입력 칸 (2026-10-16 의뢰인 디자인: 위의 칸 상자와 입력 칸이 같은 값을 두 번 보여 줬다).
// 2026-10-23 의뢰인: 근무일정 줄 · 「국적 · 체류 상세」 단추는 뺀다 — 직무 · 내국인/외국인 · 체류는 [고치기] 안에서.
import { Pencil } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { suggestForeign, type ForeignInfo, type Suggest } from '@/lib/foreign-rules';
import type { EmployeeValues, OrgOption } from '../EmployeeFields';
import { ProfileForm } from './ProfileForm';

const TONE: Record<Suggest, string> = { YES: 'text-ok', NO: 'text-muted', CHECK: 'text-warn', ON_REQUEST: 'text-info' };

export function ProfileSection({ employeeId, rows, initial, groups, jobs, foreign, today, cell, payHref }: { employeeId: string; rows: { k: string; v: string }[]; initial: EmployeeValues; groups: OrgOption[]; jobs: OrgOption[]; foreign: ForeignInfo; today: string; cell?: ReactNode; payHref: string }) {
  const t = useTranslations('admin.members');
  const tf = useTranslations('details.foreign');
  const [editing, setEditing] = useState(false);
  const s = suggestForeign(foreign, today); // 외국인이 아니면 null
  if (editing) return <ProfileForm employeeId={employeeId} initial={initial} groups={groups} jobs={jobs} foreign={foreign} today={today} onDone={() => setEditing(false)} />;
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.k} className="flex min-w-0 gap-3 border-b border-border py-2.5 text-sm">
            <dt className="w-24 shrink-0 text-muted">{r.k}</dt>
            <dd className="num min-w-0 flex-1 font-semibold break-words">{r.v}</dd>
          </div>
        ))}
        {cell}
      </dl>
      {s && (
        <div className="rounded-button border border-border p-3 text-sm">
          <p className="pb-2 font-bold">{tf('suggestTitle')}</p>
          <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {(['pension', 'health', 'employment', 'accident'] as const).map((k) => (
              <li key={k} className="flex flex-wrap gap-x-2">
                <span className="w-20 shrink-0 text-muted">{tf(`ins.${k}`)}</span>
                <span className={`min-w-0 flex-1 font-semibold ${TONE[s[k]]}`}>{tf(`sug.${s[k]}`)}</span>
              </li>
            ))}
          </ul>
          <p className="pt-2 text-muted">{tf(`flat.${s.flatTax}`)}</p>
          {s.departureInsurance && <p className="pt-1 text-muted">{tf('departure')}</p>}
          <p className="pt-2 text-xs text-faint">{tf('suggestNote')}</p>
          <Link href={payHref} className="inline-flex min-h-11 items-center text-sm font-semibold text-primary lg:min-h-9">
            {tf('goPay')} ›
          </Link>
        </div>
      )}
      <div>
        <button type="button" onClick={() => setEditing(true)} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-button border border-border bg-bg px-4 text-sm font-semibold hover:bg-surface lg:min-h-9">
          <Pencil aria-hidden size={16} />
          {t('profileEdit')}
        </button>
      </div>
    </div>
  );
}
