// 인건비 현황 (PRD v1.3 18.6 W09) — 급여대장의 명세서를 달 · 부서 · 직원으로 더한다. 서버 전용, 급여 담당 관리자만 부른다.
// ★ 여기서 다시 계산하지 않는다. 저장된 명세서의 합계를 더할 뿐이다.
// ★ 기본은 「확정한 대장의 가장 새 판」만. 정정본이 확정되면 앞 판은 빠진다(두 번 세지 않는다). 확정 전 대장은 고를 때만 넣고 「검토용」이라고 적는다.
// ★ 실지급 합계와 총인건비(지급 합계 + 사업주 부담)는 다른 숫자다 — 따로 적는다.
// ★ 계산이 막힌(BLOCKED) 명세서는 금액이 없어 합계에 들어가지 않는다. 몇 명인지 따로 센다(0원으로 넣지 않는다).
// ★ 소속은 지금의 소속이다(명세서에 그때의 소속을 남기지 않는다) — 화면에 그렇게 적는다.
// ★ 일용직 대장(2026-10-14, 미구현 목록 16번)도 더한다 — 로그인 없는 지급 대상자라 소속 · 직무가 없고 「일용직」 한 묶음으로 보인다. 사업주 부담은 계산하지 않아 0원이다.
import 'server-only';
import { groupScope } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { createAdminClient } from '@/lib/supabase/admin';

export type LaborKind = 'REGULAR' | 'BONUS' | 'DAILY';
export type LaborRow = { runId: string; kind: LaborKind; month: string; final: boolean; employeeId: string; groupId: string | null; jobId?: string | null; pay: number; deduction: number; net: number; employer: number };
/** 명세서 항목 한 줄 (지급 · 공제) — 항목별 표에 쓴다 */
export type LaborItemLine = { kind: 'PAYMENT' | 'DEDUCTION'; code: string; label: string; amount: number; employeeId: string };
export type LaborItemSum = { kind: 'PAYMENT' | 'DEDUCTION'; code: string; label: string; amount: number; people: number };
export type LaborSum = { statements: number; pay: number; deduction: number; net: number; employer: number; total: number };
export type LaborReport = {
  year: number; rows: number; blocked: number; hasDraft: boolean;
  months: (LaborSum & { month: string })[];
  groups: (LaborSum & { groupId: string | null; name: string; people: number })[];
  employees: (LaborSum & { employeeId: string; name: string; employeeNo: string | null; groupId: string | null })[];
  total: LaborSum & { people: number };
  jobs: (LaborSum & { jobId: string | null; name: string; people: number })[];
  items: LaborItemSum[];
};

const DAILY_GROUP = 'daily'; // 일용직 묶음 (조직 표의 소속이 아니다)
const zero = (): LaborSum => ({ statements: 0, pay: 0, deduction: 0, net: 0, employer: 0, total: 0 });
const add = (s: LaborSum, r: Pick<LaborRow, 'pay' | 'deduction' | 'net' | 'employer'>) => {
  s.statements += 1;
  s.pay += r.pay;
  s.deduction += r.deduction;
  s.net += r.net;
  s.employer += r.employer;
  s.total += r.pay + r.employer; // 총인건비 = 지급 합계 + 사업주 부담
};

/** 같은 대장(종류 · 기간 · 차수)의 판들 가운데 쓸 판 하나를 고른다: 가장 높은 판. (대상 대장만 넘겨받는다) */
export function pickRevisions<R extends { kind: string; periodFrom: string; periodTo: string; sequence: number; revision: number }>(runs: readonly R[]): R[] {
  const best = new Map<string, R>();
  for (const r of runs) {
    const k = `${r.kind}|${r.periodFrom}|${r.periodTo}|${r.sequence}`;
    const cur = best.get(k);
    if (!cur || r.revision > cur.revision) best.set(k, r);
  }
  return [...best.values()];
}

/** 명세서 줄을 달 · 부서 · 직원으로 더한다 (순수 계산) */
export function sumLabor(rows: readonly LaborRow[], people: ReadonlyMap<string, { name: string; employeeNo: string | null }>, groupName: (id: string | null) => string): Pick<LaborReport, 'months' | 'groups' | 'employees' | 'total'> {
  const months = new Map<string, LaborSum>(), groups = new Map<string, LaborSum & { people: Set<string> }>(), emps = new Map<string, LaborSum & { groupId: string | null }>();
  const total = zero();
  for (const r of rows) {
    add(total, r);
    add(months.get(r.month) ?? months.set(r.month, zero()).get(r.month)!, r);
    const gk = r.groupId ?? '';
    const g = groups.get(gk) ?? groups.set(gk, { ...zero(), people: new Set() }).get(gk)!;
    add(g, r);
    g.people.add(r.employeeId);
    add(emps.get(r.employeeId) ?? emps.set(r.employeeId, { ...zero(), groupId: r.groupId }).get(r.employeeId)!, r);
  }
  return {
    months: [...months].map(([month, s]) => ({ month, ...s })).sort((a, b) => a.month.localeCompare(b.month)),
    groups: [...groups].map(([id, { people: set, ...s }]) => ({ groupId: id || null, name: groupName(id || null), people: set.size, ...s })).sort((a, b) => b.total - a.total),
    employees: [...emps].map(([employeeId, s]) => ({ employeeId, name: people.get(employeeId)?.name ?? '', employeeNo: people.get(employeeId)?.employeeNo ?? null, ...s })).sort((a, b) => a.name.localeCompare(b.name)),
    total: { ...total, people: emps.size },
  };
}

/** 직무별 합계 (순수 계산) — 소속처럼 지금의 직무로 묶는다 */
export function sumByJob(rows: readonly LaborRow[], jobName: (id: string | null) => string): LaborReport['jobs'] {
  const m = new Map<string, LaborSum & { people: Set<string> }>();
  for (const r of rows) {
    const k = r.jobId ?? '';
    const g = m.get(k) ?? m.set(k, { ...zero(), people: new Set() }).get(k)!;
    add(g, r);
    g.people.add(r.employeeId);
  }
  return [...m].map(([id, { people, ...x }]) => ({ jobId: id || null, name: jobName(id || null), people: people.size, ...x })).sort((a, b) => b.total - a.total);
}

/** 지급 · 공제 항목별 합계 (순수 계산) — 같은 항목 코드끼리, 금액이 큰 순 */
export function sumItems(lines: readonly LaborItemLine[]): LaborItemSum[] {
  const m = new Map<string, { kind: LaborItemLine['kind']; code: string; label: string; amount: number; people: Set<string> }>();
  for (const l of lines) {
    const k = `${l.kind}|${l.code}`;
    const x = m.get(k) ?? m.set(k, { kind: l.kind, code: l.code, label: l.label, amount: 0, people: new Set() }).get(k)!;
    x.amount += l.amount;
    x.people.add(l.employeeId);
  }
  return [...m.values()].map(({ people, ...x }) => ({ ...x, people: people.size })).sort((a, b) => (a.kind === b.kind ? b.amount - a.amount : a.kind === 'PAYMENT' ? -1 : 1));
}

export async function buildLaborCost(args: { year: number; practice: boolean; kind: LaborKind | null; groupId: string | null; withDraft: boolean; testViewer: boolean; unassigned: string; daily: { group: string; wage: string; nontax: string; incomeTax: string; localTax: string; other: string } }): Promise<LaborReport> {
  const c = createAdminClient();
  const [{ data: runs, error }, { data: staff }, { data: jobRows }, orgGroups] = await Promise.all([
    c.from('payroll_runs').select('id, run_kind, title, period_from, period_to, sequence, revision, status, current_generation_id').eq('is_test', args.practice).in('run_kind', args.kind ? [args.kind] : ['REGULAR', 'BONUS', 'DAILY']).gte('period_from', `${args.year}-01-01`).lte('period_from', `${args.year}-12-31`),
    c.from('profiles').select('id, name, employee_no, group_id, job_id'),
    c.from('jobs').select('id, name'),
    loadOrgGroups(),
  ]);
  if (error) throw new Error(`buildLaborCost: ${error.code}`);
  // 검사가 만든 대장(제목 e2e-)은 검사 계정에게만, 실제 대장은 실제 관리자에게만 보인다
  const usable = (runs ?? []).filter((r) => !!(r.title as string | null)?.startsWith('e2e-') === args.testViewer && r.current_generation_id && (r.status === 'FINALIZED' || (args.withDraft && r.status !== 'DRAFT')));
  const picked = pickRevisions(usable.map((r) => ({ id: r.id as string, kind: r.run_kind as LaborKind, periodFrom: r.period_from as string, periodTo: r.period_to as string, sequence: r.sequence as number, revision: r.revision as number, final: r.status === 'FINALIZED', generationId: r.current_generation_id as string })));
  const people = new Map((staff ?? []).map((p) => [p.id as string, { name: p.name as string, employeeNo: p.employee_no as string | null, groupId: p.group_id as string | null, jobId: p.job_id as string | null }]));
  const itemLines: LaborItemLine[] = [];
  const scope = args.groupId ? groupScope(orgGroups, args.groupId) : null;
  const rows: LaborRow[] = [];
  let blocked = 0;
  const regularPicked = picked.filter((r) => r.kind !== 'DAILY');
  for (let i = 0; i < regularPicked.length; i += 50) {
    const part = regularPicked.slice(i, i + 50);
    const { data: sts, error: e2 } = await c.from('payroll_statements').select('id, generation_id, employee_id, state, pay_total, deduction_total, net_total, employer_total').in('generation_id', part.map((r) => r.generationId)).limit(20000);
    if (e2) throw new Error(`buildLaborCost.statements: ${e2.code}`);
    const okIds = new Map<string, string>(); // 합계에 들어간 명세서 → 직원
    for (const s of sts ?? []) {
      const run = part.find((r) => r.generationId === s.generation_id)!;
      const groupId = people.get(s.employee_id as string)?.groupId ?? null;
      if (scope && !(groupId && scope.has(groupId))) continue;
      if (s.state !== 'OK' || s.pay_total === null) {
        blocked++;
        continue;
      }
      okIds.set(s.id as string, s.employee_id as string);
      rows.push({ runId: run.id, kind: run.kind, month: run.periodFrom.slice(0, 7), final: run.final, employeeId: s.employee_id as string, groupId, jobId: people.get(s.employee_id as string)?.jobId ?? null, pay: Number(s.pay_total), deduction: Number(s.deduction_total), net: Number(s.net_total), employer: Number(s.employer_total ?? 0) });
    }
    // 항목별 표: 합계에 들어간 명세서의 지급 · 공제 줄 (사업주 부담 줄은 빼고)
    const ids = [...okIds.keys()];
    for (let j = 0; j < ids.length; j += 200) {
      const { data: its, error: e3 } = await c.from('payroll_statement_items').select('statement_id, item_code, kind, label_ko, amount').in('statement_id', ids.slice(j, j + 200)).in('kind', ['PAYMENT', 'DEDUCTION']).limit(50000);
      if (e3) throw new Error(`buildLaborCost.items: ${e3.code}`);
      for (const x of its ?? []) itemLines.push({ kind: x.kind as LaborItemLine['kind'], code: x.item_code as string, label: x.label_ko as string, amount: Number(x.amount), employeeId: okIds.get(x.statement_id as string)! });
    }
  }
  // ── 일용직 대장: 지급 대상자별 지급명세 (부서를 골랐으면 넣지 않는다 — 일용직은 소속이 없다) ──
  const dailyPicked = picked.filter((r) => r.kind === 'DAILY');
  if (dailyPicked.length && !scope) {
    const { data: ds, error: e4 } = await c.from('payroll_daily_statements').select('generation_id, payee_id, state, gross_total, taxable_total, nontax_total, income_tax, local_tax, other_deduction, net_total').in('generation_id', dailyPicked.map((r) => r.generationId)).limit(20000);
    if (e4) throw new Error(`buildLaborCost.daily: ${e4.code}`);
    const payeeIds = [...new Set((ds ?? []).map((s) => s.payee_id as string))];
    const { data: payees } = payeeIds.length ? await c.from('payroll_payees').select('id, name, internal_no').in('id', payeeIds) : { data: [] as { id: string; name: string; internal_no: string }[] };
    for (const p of payees ?? []) people.set(`payee:${p.id}`, { name: p.name as string, employeeNo: p.internal_no as string, groupId: DAILY_GROUP, jobId: null });
    for (const s of ds ?? []) {
      const run = dailyPicked.find((r) => r.generationId === s.generation_id)!;
      if (s.state !== 'OK' || s.gross_total === null) {
        blocked++;
        continue;
      }
      const key = `payee:${s.payee_id}`;
      const ded = Number(s.income_tax ?? 0) + Number(s.local_tax ?? 0) + Number(s.other_deduction ?? 0);
      rows.push({ runId: run.id, kind: 'DAILY', month: run.periodFrom.slice(0, 7), final: run.final, employeeId: key, groupId: DAILY_GROUP, jobId: null, pay: Number(s.gross_total), deduction: ded, net: Number(s.net_total), employer: 0 });
      const line = (kind: LaborItemLine['kind'], code: string, label: string, amount: number) => amount > 0 && itemLines.push({ kind, code, label, amount, employeeId: key });
      line('PAYMENT', 'DAILY_WAGE', args.daily.wage, Number(s.taxable_total ?? 0));
      line('PAYMENT', 'DAILY_NONTAX', args.daily.nontax, Number(s.nontax_total ?? 0));
      line('DEDUCTION', 'INCOME_TAX', args.daily.incomeTax, Number(s.income_tax ?? 0));
      line('DEDUCTION', 'LOCAL_TAX', args.daily.localTax, Number(s.local_tax ?? 0));
      line('DEDUCTION', 'DAILY_OTHER', args.daily.other, Number(s.other_deduction ?? 0));
    }
  }
  const nameOf = (id: string | null) => {
    if (id === DAILY_GROUP) return args.daily.group;
    const g = orgGroups.find((x) => x.id === id);
    const parent = g?.parentId ? orgGroups.find((x) => x.id === g.parentId) : null;
    return g ? (parent ? `${parent.name} › ${g.name}` : g.name) : args.unassigned;
  };
  const jobName = new Map((jobRows ?? []).map((j) => [j.id as string, j.name as string]));
  return { year: args.year, rows: rows.length, blocked, hasDraft: rows.some((r) => !r.final), ...sumLabor(rows, people, nameOf), jobs: sumByJob(rows, (id) => (id ? (jobName.get(id) ?? args.unassigned) : args.unassigned)), items: sumItems(itemLines) };
}
