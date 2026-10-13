// 명세서 공개와 직원의 「내 명세서」 (PRD v1.3 8 · 19장, E01). 서버 전용.
// 공개는 확정과 별개다: 확정한 대장의 명세서만 공개할 수 있고(0037의 DB 검사), 공개 · 회수는 기록으로만 쌓인다(지우거나 고치지 않는다).
// ★ 공개가 은행 지급을 뜻하지 않는다. 공개했다고 문자 · 메일을 자동으로 보내지 않는다.
// ★ 직원은 자기 것 가운데 「지금 공개 중」인 명세서만 본다 — 서버가 매번 본인인지, 확정된 대장인지, 마지막 기록이 공개인지 확인한다.
// ★ 사업주 부담 항목은 직원에게 보이지 않는다.
import 'server-only';
import { ApiError } from '@/lib/api';
import type { Me } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadRun } from './run-data';
import { payrollAudit } from './staff-data';

const db = () => createAdminClient();
type Row = Record<string, unknown>;
const boom = (where: string, e: { code?: string } | null): never => {
  if (e?.code === 'PR004') throw new ApiError(409, 'payroll_not_finalized');
  throw new Error(`${where}: ${e?.code ?? 'unknown'}`);
};

export type PubState = { statementId: string; published: boolean; at: string | null };
/** 명세서마다 마지막 공개 기록 — PUBLISHED면 공개 중 */
async function latestEvents(filter: { runId?: string; employeeId?: string }): Promise<Map<string, { kind: string; at: string }>> {
  let q = db().from('payroll_publication_events').select('statement_id, kind, created_at, id');
  if (filter.runId) q = q.eq('run_id', filter.runId);
  if (filter.employeeId) q = q.eq('employee_id', filter.employeeId);
  const { data, error } = await q.order('id', { ascending: true }).limit(20000);
  if (error) boom('latestEvents', error);
  const out = new Map<string, { kind: string; at: string }>();
  for (const e of data ?? []) out.set(e.statement_id as string, { kind: e.kind as string, at: e.created_at as string }); // 뒤의 기록이 앞의 것을 덮는다
  return out;
}

/** 대장의 직원별 공개 상태 (확정한 대장의 지금 계산 세대 기준) */
export async function loadPublication(runId: string, generationId: string | null): Promise<Map<string, PubState>> {
  const out = new Map<string, PubState>();
  if (!generationId) return out;
  const [{ data: sts, error }, events] = await Promise.all([db().from('payroll_statements').select('id, employee_id').eq('generation_id', generationId).eq('state', 'OK'), latestEvents({ runId })]);
  if (error) boom('loadPublication', error);
  for (const s of sts ?? []) {
    const e = events.get(s.id as string);
    out.set(s.employee_id as string, { statementId: s.id as string, published: e?.kind === 'PUBLISHED', at: e?.at ?? null });
  }
  return out;
}

/** 공개 — 확정한 대장만. employeeIds를 주지 않으면 아직 공개하지 않은 전원. 이미 공개 중인 사람은 건너뛴다 */
export async function publishRun(args: { runId: string; employeeIds?: string[]; me: Me; requestId?: string }): Promise<{ published: number; skipped: number }> {
  const run = await loadRun(args.runId);
  if (!run) throw new ApiError(404, 'not_found');
  if (run.status !== 'FINALIZED') throw new ApiError(409, 'payroll_not_finalized');
  const pub = await loadPublication(run.id, run.generationId);
  const targets = [...pub].filter(([id, s]) => !s.published && (!args.employeeIds || args.employeeIds.includes(id)));
  const skipped = (args.employeeIds?.length ?? pub.size) - targets.length;
  if (targets.length === 0) return { published: 0, skipped };
  const { error } = await db().from('payroll_publication_events').insert(targets.map(([employeeId, s]) => ({ statement_id: s.statementId, run_id: run.id, employee_id: employeeId, kind: 'PUBLISHED', actor_id: args.me.id })));
  if (error) boom('publishRun', error);
  await payrollAudit({ actorId: args.me.id, action: 'run.publish', table: 'payroll_publication_events', runId: run.id, requestId: args.requestId, detail: { count: targets.length } });
  return { published: targets.length, skipped };
}

/** 공개 회수 — 사유 필수. 기록은 남는다(조용히 숨기지 않는다) */
export async function unpublishStatement(args: { runId: string; employeeId: string; reason: string; me: Me; requestId?: string }): Promise<void> {
  const run = await loadRun(args.runId);
  if (!run) throw new ApiError(404, 'not_found');
  const s = (await loadPublication(run.id, run.generationId)).get(args.employeeId);
  if (!s) throw new ApiError(404, 'not_found');
  if (!s.published) throw new ApiError(409, 'payroll_not_published');
  const { error } = await db().from('payroll_publication_events').insert({ statement_id: s.statementId, run_id: run.id, employee_id: args.employeeId, kind: 'UNPUBLISHED', reason: args.reason, actor_id: args.me.id });
  if (error) boom('unpublishStatement', error);
  await payrollAudit({ actorId: args.me.id, action: 'statement.unpublish', table: 'payroll_publication_events', subjectId: s.statementId, runId: run.id, employeeId: args.employeeId, requestId: args.requestId });
}

// ── 직원: 내 명세서 ──
export type MySlip = { id: string; month: string; payDate: string; kind: string; revision: number; pay: number; deduction: number; net: number; publishedAt: string; isTest: boolean };
export type MySlipLine = { code: string; kind: 'PAYMENT' | 'DEDUCTION'; label: string; quantity: string | null; unitPrice: string | null; factor: string | null; amount: number };

/** 내게 공개 중인 명세서 (새 달부터). practice = 지금 앱의 모드 — 연습 대장과 운영 대장을 섞어 보이지 않는다 */
export async function loadMySlips(employeeId: string, practice: boolean): Promise<MySlip[]> {
  const events = await latestEvents({ employeeId });
  const ids = [...events].filter(([, e]) => e.kind === 'PUBLISHED').map(([id]) => id);
  if (ids.length === 0) return [];
  const { data, error } = await db().from('payroll_statements').select('id, generation_id, pay_total, deduction_total, net_total, state, payroll_runs!inner(id, run_kind, period_from, pay_date, revision, status, is_test, current_generation_id)').eq('employee_id', employeeId).in('id', ids);
  if (error) boom('loadMySlips', error);
  return (data ?? [])
    .map((s) => ({ s, r: s.payroll_runs as unknown as Row }))
    .filter(({ s, r }) => s.state === 'OK' && r.status === 'FINALIZED' && r.current_generation_id === s.generation_id && r.is_test === practice)
    .map(({ s, r }) => ({ id: s.id as string, month: (r.period_from as string).slice(0, 7), payDate: r.pay_date as string, kind: r.run_kind as string, revision: r.revision as number, pay: Number(s.pay_total), deduction: Number(s.deduction_total), net: Number(s.net_total), publishedAt: events.get(s.id as string)!.at, isTest: r.is_test as boolean }))
    .sort((a, b) => b.month.localeCompare(a.month) || b.revision - a.revision);
}

/** 내 명세서 한 장. 내 것이 아니거나 공개 중이 아니면 null (있는지 없는지도 알려 주지 않는다) */
export async function loadMySlip(employeeId: string, statementId: string, practice: boolean): Promise<{ slip: MySlip; lines: MySlipLine[] } | null> {
  const slip = (await loadMySlips(employeeId, practice)).find((x) => x.id === statementId);
  if (!slip) return null;
  const { data, error } = await db().from('payroll_statement_items').select('item_code, kind, label_ko, quantity, unit_price, factor, amount, line_no, created_at').eq('statement_id', statementId).in('kind', ['PAYMENT', 'DEDUCTION']).order('created_at').order('line_no');
  if (error) boom('loadMySlip', error);
  const t = (v: unknown) => (v === null || v === undefined ? null : String(Number(v)));
  return { slip, lines: (data ?? []).map((i) => ({ code: i.item_code as string, kind: i.kind as 'PAYMENT' | 'DEDUCTION', label: i.label_ko as string, quantity: t(i.quantity), unitPrice: t(i.unit_price), factor: t(i.factor), amount: Number(i.amount) })) };
}
