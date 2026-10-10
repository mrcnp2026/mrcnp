// 휴가 종류 한 건 — 내용 고치기 · 끄기/켜기. 기본 종류는 이름·시간이 잠겨 있다.
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { DetailBar } from '@/components/detail';
import { Card, Chip, PageShell } from '@/components/ui';
import { leaveTypeName } from '@/lib/leave';
import { loadAllLeaveTypes } from '@/lib/leave-data';
import { LeaveTypeForm, LeaveTypeToggle } from '../TypeForms';

export default async function LeaveTypePage({ params }: { params: Promise<{ code: string }> }) {
  const [t, tl, { code }] = await Promise.all([getTranslations('admin.leaveTypes'), getTranslations('leave'), params]);
  const all = await loadAllLeaveTypes();
  const x = all.find((v) => v.code === code);
  if (!x) notFound();
  const name = leaveTypeName(all, x.code, tl);
  const groups = [...new Set(all.map((v) => v.groupName).filter((g): g is string => !!g))].sort((a, b) => a.localeCompare(b));
  const tc = await getTranslations('common');

  return (
    <PageShell>
      <DetailBar plain back={x.active ? '/admin/leave/types' : '/admin/leave/types?tab=off'} backLabel={tc('back')} title={t('title')} />
      <div className="flex flex-wrap items-center gap-2 px-1">
        <h1 className="text-2xl font-extrabold tracking-tight">{name}</h1>
        {x.builtin && <Chip>{t('builtinChip')}</Chip>}
        {!x.active && <Chip>{t('offChip')}</Chip>}
      </div>
      <Card className="flex flex-col gap-3">
        <LeaveTypeForm
          key={`${x.name}|${x.hours}|${x.startTime}|${x.endTime}|${x.groupName}|${x.isPaid}|${x.deductsBalance}`}
          groups={groups}
          initial={{ code: x.code, name, hours: x.hours ?? 8, startTime: x.startTime ?? null, endTime: x.endTime ?? null, groupName: x.groupName ?? null, isPaid: x.isPaid, deductsBalance: x.deductsBalance, builtin: !!x.builtin }}
        />
      </Card>
      <LeaveTypeToggle code={x.code} active={!!x.active} />
    </PageShell>
  );
}
