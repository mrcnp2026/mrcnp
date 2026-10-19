// 연장근로 → 보상휴가 (2026-10-19 의뢰인, 「아직 안 만든 기능」 #33 · 묶음 29). 최고관리자만.
// 위: 직원 · 달 · 시간 · 배율로 돌리기 / 아래: 돌린 기록(취소 포함). 돌린 시간은 그 달 급여에서 연장수당으로 주지 않는다.
import { getFormatter, getTranslations } from 'next-intl/server';
import { ListHead } from '@/components/listframe';
import { Card, CardTitle, Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { getMe } from '@/lib/auth';
import { loadComps } from '@/lib/payroll/overtime-comp';
import { loadCalcBasis } from '@/lib/payroll/run-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';
import { CompCancel, CompCreate } from './CompForms';

export default async function OvertimeCompPage() {
  const [t, f, me] = await Promise.all([getTranslations('admin.overtimeComp'), getFormatter(), getMe()]);
  if (!me || me.role !== 'admin' || !me.canViewPayroll) return <PageShell><p className="rounded-card bg-warn-tint p-4 text-sm text-warn">{t('forbidden')}</p></PageShell>;
  const today = toKstDate(new Date());
  const [rows, { data: staff }, basis] = await Promise.all([
    loadComps({ practice: OFFICE.practiceMode, limit: 200 }),
    createAdminClient().from('profiles').select('id, name, employee_no, active, role').order('name'),
    loadCalcBasis(today).catch(() => null),
  ]);
  const people = (staff ?? []).filter((p) => p.active && p.employee_no !== OFFICE.ownerEmployeeNo && !String(p.employee_no ?? '').startsWith('e2e-')).map((p) => ({ id: p.id as string, name: p.name as string }));
  const nameOf = new Map((staff ?? []).map((p) => [p.id as string, p.name as string]));
  const premium = Number(basis?.policy.overtimePremium ?? '0.5');
  const defaultRate = Number.isFinite(premium) ? Math.round((1 + premium) * 100) / 100 : 1.5; // 연장 가산(통합설정 › 급여 법정수당)과 같은 배율
  const h = (m: number) => Math.round((m / 60) * 100) / 100;
  const lastMonth = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);

  return (
    <PageShell wide>
      <ListHead title={t('title')} desc={t('intro')} />
      <Card>
        <CardTitle>{t('createTitle')}</CardTitle>
        <div className="pt-3">
          <CompCreate people={people} month={lastMonth} defaultRate={defaultRate} ready={rows !== null} />
        </div>
      </Card>
      <Card>
        <CardTitle>{t('listTitle', { n: (rows ?? []).length })}</CardTitle>
        {(rows ?? []).length === 0 ? (
          <p className="pt-2 text-sm text-faint">{t('listEmpty')}</p>
        ) : (
          <ul className="mt-2 flex flex-col divide-y divide-border" data-overtime-comp>
            {(rows ?? []).map((r) => (
              <li key={r.id} className="flex flex-col gap-1 py-2.5 text-sm">
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="num font-bold">{r.month}</span>
                  <span className="font-semibold">{nameOf.get(r.employeeId)}</span>
                  <span className="num">{t('line', { h: h(r.minutes), leave: h(r.leaveMinutes), rate: r.rate })}</span>
                  {r.cancelledAt ? <Chip>{t('cancelled')}</Chip> : <Chip tone="ok">{t('granted')}</Chip>}
                </span>
                <span className="flex flex-wrap items-center gap-x-3 text-xs text-muted">
                  <span>{t('by', { name: nameOf.get(r.createdBy) ?? '', at: f.dateTime(new Date(r.createdAt), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Seoul' }) })}</span>
                  {r.note && <span>{r.note}</span>}
                  {r.cancelReason && <span className="text-warn">{t('cancelledWhy', { reason: r.cancelReason })}</span>}
                </span>
                {!r.cancelledAt && <CompCancel id={r.id} />}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="text-xs text-faint">{t('legal')}</p>
    </PageShell>
  );
}
