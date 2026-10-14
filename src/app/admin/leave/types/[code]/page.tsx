// 휴가 종류 한 건 — 내용 고치기 · 끄기/켜기. 기본 종류는 이름·시간이 잠겨 있다.
import { getTranslations } from 'next-intl/server';
import { groupPath } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { hiddenTestIds } from '@/lib/period-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { notFound } from 'next/navigation';
import { DetailBar } from '@/components/detail';
import { TwoPane } from '@/components/settings';
import { Card, Chip, PageShell } from '@/components/ui';
import { leaveTypeName } from '@/lib/leave';
import { loadAllLeaveTypes } from '@/lib/leave-data';
import { NO_TYPE_RULE } from '@/lib/leave-ledger';
import { loadTypeRules } from '@/lib/leave-ledger-data';
import { LeaveTypeForm, LeaveTypeToggle } from '../TypeForms';
import { TypeRuleForm } from '../TypeRuleForm';

export default async function LeaveTypePage({ params }: { params: Promise<{ code: string }> }) {
  const [t, tl, { code }] = await Promise.all([getTranslations('admin.leaveTypes'), getTranslations('leave'), params]);
  const all = await loadAllLeaveTypes();
  const x = all.find((v) => v.code === code);
  if (!x) notFound();
  const name = leaveTypeName(all, x.code, tl);
  const groups = [...new Set(all.map((v) => v.groupName).filter((g): g is string => !!g))].sort((a, b) => a.localeCompare(b));
  const tc = await getTranslations('common');
  const rule = (await loadTypeRules()).get(x.code); // 종류별 신청 규칙 (없으면 제한 없음)
  // 적용 대상 고르기: 부서 › 팀 · 켜진 직원(검사 계정은 보는 사람에 따라 숨김)
  const [orgGroups, hidden, { data: staff }] = await Promise.all([loadOrgGroups(), hiddenTestIds(), createAdminClient().from('profiles').select('id, name').eq('active', true).order('name')]);
  const hide = new Set(hidden);

  const tf = await getTranslations('frame');
  return (
    <PageShell wide>
      <TwoPane title={tf('item.leaveTypes')} current={`/admin/leave/types/${code}`} items={all.map((v) => ({ href: `/admin/leave/types/${v.code}`, label: leaveTypeName(all, v.code, tl), off: !v.active }))}>
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
      <Card className="flex flex-col gap-3">
        <TypeRuleForm key={rule?.version ?? 0} code={x.code} version={rule?.version ?? 0} rule={rule?.rule ?? NO_TYPE_RULE} groups={orgGroups.map((g) => ({ id: g.id, name: groupPath(orgGroups, g.id) ?? g.name }))} people={(staff ?? []).filter((p) => !hide.has(p.id as string)).map((p) => ({ id: p.id as string, name: p.name as string }))} />
      </Card>
      <LeaveTypeToggle code={x.code} active={!!x.active} />
      </TwoPane>
    </PageShell>
  );
}
