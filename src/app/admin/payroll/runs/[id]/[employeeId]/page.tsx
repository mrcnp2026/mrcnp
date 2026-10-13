// 급여대장의 직원 한 명 — 지급 · 공제 항목과 계산 근거, 근태 근거, 금액 조정 (PRD v1.3 18.3: 지급·공제 / 근태근거 / 계산검산). 급여 담당 관리자만.
// 자동으로 계산한 금액은 여기서 직접 고치지 않는다 — 조정을 따로 남기고 다시 계산한다.
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, CardTitle, Chip, PageShell } from '@/components/ui';
import { getMe } from '@/lib/auth';
import { loadItems } from '@/lib/payroll/data';
import { loadRun, loadStatement } from '@/lib/payroll/run-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { OverrideForm } from '../../RunForms';

const AUTO_CODES: { code: string; kind: 'PAYMENT' | 'DEDUCTION' }[] = [
  { code: 'BASE', kind: 'PAYMENT' }, { code: 'OVERTIME', kind: 'PAYMENT' }, { code: 'NIGHT', kind: 'PAYMENT' }, { code: 'HOLIDAY', kind: 'PAYMENT' }, { code: 'HOLIDAY_OVER8', kind: 'PAYMENT' }, { code: 'PAID_LEAVE', kind: 'PAYMENT' },
  { code: 'PENSION', kind: 'DEDUCTION' }, { code: 'HEALTH', kind: 'DEDUCTION' }, { code: 'LTC', kind: 'DEDUCTION' }, { code: 'EMPLOYMENT', kind: 'DEDUCTION' }, { code: 'INCOME_TAX', kind: 'DEDUCTION' }, { code: 'LOCAL_TAX', kind: 'DEDUCTION' },
];

export default async function PayStatementPage({ params }: { params: Promise<{ id: string; employeeId: string }> }) {
  const [t, f, me, { id, employeeId }] = await Promise.all([getTranslations('admin.payRuns'), getFormatter(), getMe(), params]);
  if (!me || me.role !== 'admin' || !me.canViewPayroll) return <PageShell><p className="rounded-card bg-warn-tint p-4 text-sm text-warn">{t('forbidden')}</p></PageShell>;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f-]{36}$/i.test(employeeId)) notFound();
  const run = await loadRun(id);
  if (!run) notFound();
  const db = createAdminClient();
  const [{ data: p }, { data: mem }, { statement: s, overrides }, items] = await Promise.all([
    db.from('profiles').select('id, name, employee_no').eq('id', employeeId).maybeSingle(),
    db.from('payroll_run_members').select('inclusion_state, exclusion_reason').eq('run_id', id).eq('employee_id', employeeId).maybeSingle(),
    loadStatement(run, employeeId),
    loadItems(),
  ]);
  if (!p || !mem) notFound();
  const won = (v: number) => t('won', { n: f.number(v) });
  const label = (code: string, fallback: string) => (t.has(`line.${code}`) ? t(`line.${code}`) : (items.find((x) => x.code === code)?.koName ?? fallback));
  const dk = (d: string) => d.replace(/[.-]/g, '_'); // 번역 열쇠에는 점 · 줄표를 쓸 수 없다
  const why = (b: { code: string; detail?: string }) => (t.has(`blocker.${b.code}`) ? t(`blocker.${b.code}`, { detail: b.detail ? (t.has(`detail.${dk(b.detail)}`) ? t(`detail.${dk(b.detail)}`) : b.detail) : '' }) : `${b.code}${b.detail ? ` (${b.detail})` : ''}`);
  const num = (v: string | null) => (v === null ? '' : f.number(Number(v), { maximumFractionDigits: 4 }));
  const att = (s?.snapshot.attendance ?? null) as { regularMinutes: number; netMinutes: number; payableMinutes: number; approved: { overtime: number; night: number; holidayWithin8: number; holidayOver8: number }; paidLeaveDays: number } | null;
  const hm = (min: number) => t('hm', { h: Math.floor(min / 60), m: min % 60 });
  const final = run.status === 'FINALIZED';
  const codes = [...AUTO_CODES.map((c) => ({ ...c, label: `${label(c.code, c.code)} (${t(c.kind === 'PAYMENT' ? 'kindPay' : 'kindDeduct')})` })), ...items.filter((x) => x.inUse && !AUTO_CODES.some((c) => c.code === x.code)).map((x) => ({ code: x.code, kind: x.kind, label: `${x.koName} (${t(x.kind === 'PAYMENT' ? 'kindPay' : 'kindDeduct')})` }))];
  const section = (kind: 'PAYMENT' | 'DEDUCTION' | 'EMPLOYER') => (s?.lines ?? []).filter((l) => l.kind === kind);

  return (
    <PageShell wide>
      <Link href={`/admin/payroll/runs/${id}`} className="inline-flex min-h-9 items-center self-start text-sm font-medium text-muted">
        ‹ {t('runTitle', { month: run.periodFrom.slice(0, 7) })}
      </Link>
      <div>
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold">
          {p.name}
          {mem.inclusion_state === 'EXCLUDED' ? <Chip>{t('excluded')}</Chip> : !s ? <Chip>{t('notCalculated')}</Chip> : s.state === 'OK' ? <Chip tone="ok">{t('resultOk')}</Chip> : <Chip tone="warn">{t('resultBlocked', { n: s.blockers.filter((b) => !b.warning).length })}</Chip>}
        </h1>
        <p className="num pt-1 text-sm text-faint">{p.employee_no}</p>
      </div>
      {s?.state === 'OK' && (
        <a href={`/api/admin/payroll/runs/${id}/pdf?emp=${employeeId}`} className="inline-flex h-8 items-center self-start rounded-button border border-border bg-bg px-3 text-sm font-bold text-muted">
          {t(final ? 'pdfOne' : 'pdfOneDraft')}
        </a>
      )}
      {s && s.blockers.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-card border border-warn bg-warn-tint p-3 text-sm text-warn">
          {s.blockers.map((b, i) => (
            <li key={i}>{why(b)}</li>
          ))}
          {s.state === 'BLOCKED' && (
            <li className="pt-1 text-muted">
              <Link href={`/admin/payroll/staff/${employeeId}`} className="font-bold text-primary underline">
                {t('toStaffPay')}
              </Link>
              {' · '}
              <Link href={`/admin/closing?m=${run.periodFrom.slice(0, 7)}${run.isTest ? '' : '&live=1'}`} className="font-bold text-primary underline">
                {t('toClosing')}
              </Link>
            </li>
          )}
        </ul>
      )}

      {s?.state === 'OK' && (
        <>
          <dl className="grid gap-3 text-sm md:grid-cols-4">
            {([['colPay', s.pay], ['colDeduction', s.deduction], ['colNet', s.net], ['colEmployer', s.employer]] as const).map(([k, v]) => (
              <div key={k} className="rounded-card border border-border bg-bg p-3">
                <dt className="text-xs text-muted">{t(k)}</dt>
                <dd className="num pt-1 text-lg font-bold">{won(v ?? 0)}</dd>
              </div>
            ))}
          </dl>
          {(['PAYMENT', 'DEDUCTION', 'EMPLOYER'] as const).map((kind) => (
            <Card key={kind}>
              <CardTitle>{t(`section.${kind}`)}</CardTitle>
              <div className="mt-3 overflow-x-auto border border-border bg-bg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      {['colItem', 'colQty', 'colUnit', 'colFactor', 'colRaw', 'colAmount', 'colSource'].map((k) => (
                        <th key={k} scope="col" className="px-3 py-2 whitespace-nowrap">
                          {t(k)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {section(kind).map((l, i) => (
                      <tr key={`${l.code}${i}`} className="border-b border-border">
                        <td className="px-3 py-2 font-bold">{label(l.code.replace(/_EMPLOYER$/, ''), l.label)}</td>
                        <td className="num px-3 py-2">{num(l.quantity)}</td>
                        <td className="num px-3 py-2">{num(l.unitPrice)}</td>
                        <td className="num px-3 py-2">{l.factor ?? ''}</td>
                        <td className="num px-3 py-2 text-muted">{num(l.rawValue)}</td>
                        <td className="num px-3 py-2 font-bold whitespace-nowrap">{won(l.amount)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {l.source === 'AUTO' ? <span className="text-muted">{t('source.AUTO')}</span> : <Chip tone="warn">{t(`source.${l.source}`)}</Chip>}
                          {l.source === 'OVERRIDE' && typeof l.trace.autoAmount === 'number' && <span className="num block text-xs text-muted">{t('autoWas', { amount: won(l.trace.autoAmount) })}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {section(kind).length === 0 && <p className="p-3 text-sm text-faint">{t('noLines')}</p>}
              </div>
            </Card>
          ))}
        </>
      )}

      {att && (
        <Card>
          <CardTitle>{t('attTitle')}</CardTitle>
          <dl className="num grid gap-x-6 gap-y-1 pt-3 text-sm md:grid-cols-3">
            {([['attRegular', hm(att.regularMinutes)], ['attNet', hm(att.netMinutes)], ['attPayable', hm(att.payableMinutes)], ['attOvertime', hm(att.approved.overtime)], ['attNight', hm(att.approved.night)], ['attHoliday', hm(att.approved.holidayWithin8 + att.approved.holidayOver8)], ['attLeave', t('daysValue', { n: att.paidLeaveDays })]] as const).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-muted">{t(k)}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <p className="pt-2 text-xs text-faint">{t('attNote')}</p>
        </Card>
      )}

      {!final && mem.inclusion_state === 'INCLUDED' && (
        <Card>
          <CardTitle>{t('ovTitle')}</CardTitle>
          <div className="pt-3">
            <OverrideForm id={id} employeeId={employeeId} codes={codes} active={overrides.map((o) => ({ id: o.id, label: label(o.itemCode, o.itemCode), amount: won(o.proposed), original: o.original === null ? null : won(o.original), reason: o.reason }))} />
          </div>
        </Card>
      )}
    </PageShell>
  );
}
