// 인건비 현황 (PRD v1.3 18.6 W09) — 급여대장의 명세서를 달 · 부서 · 직원으로 더한다. 서버 전용, 급여 담당 관리자만 부른다.
// ★ 여기서 다시 계산하지 않는다. 저장된 명세서의 합계를 더할 뿐이다.
// ★ 기본은 「확정한 대장의 가장 새 판」만. 정정본이 확정되면 앞 판은 빠진다(두 번 세지 않는다). 확정 전 대장은 고를 때만 넣고 「검토용」이라고 적는다.
// ★ 실지급 합계와 총인건비(지급 합계 + 사업주 부담)는 다른 숫자다 — 따로 적는다.
// ★ 계산이 막힌(BLOCKED) 명세서는 금액이 없어 합계에 들어가지 않는다. 몇 명인지 따로 센다(0원으로 넣지 않는다).
// ★ 소속은 지금의 소속이다(명세서에 그때의 소속을 남기지 않는다) — 화면에 그렇게 적는다.
import 'server-only';
import { groupScope } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { createAdminClient } from '@/lib/supabase/admin';

export type LaborKind = 'REGULAR' | 'BONUS';
export type LaborRow = { runId: string; kind: LaborKind; month: string; final: boolean; employeeId: string; groupId: string | null; pay: number; deduction: number; net: number; employer: number };
export type LaborSum = { statements: number; pay: number; deduction: number; net: number; employer: number; total: number };
export type LaborReport = {
  year: number; rows: number; blocked: number; hasDraft: boolean;
  months: (LaborSum & { month: string })[];
  groups: (LaborSum & { groupId: string | null; name: string; people: number })[];
  employees: (LaborSum & { employeeId: string; name: string; employeeNo: string | null; groupId: string | null })[];
  total: LaborSum & { people: number };
};

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

export async function buildLaborCost(args: { year: number; practice: boolean; kind: LaborKind | null; groupId: string | null; withDraft: boolean; testViewer: boolean; unassigned: string }): Promise<LaborReport> {
  const c = createAdminClient();
  const [{ data: runs, error }, { data: staff }, orgGroups] = await Promise.all([
    c.from('payroll_runs').select('id, run_kind, title, period_from, period_to, sequence, revision, status, current_generation_id').eq('is_test', args.practice).in('run_kind', args.kind ? [args.kind] : ['REGULAR', 'BONUS']).gte('period_from', `${args.year}-01-01`).lte('period_from', `${args.year}-12-31`),
    c.from('profiles').select('id, name, employee_no, group_id'),
    loadOrgGroups(),
  ]);
  if (error) throw new Error(`buildLaborCost: ${error.code}`);
  // 검사가 만든 대장(제목 e2e-)은 검사 계정에게만, 실제 대장은 실제 관리자에게만 보인다
  const usable = (runs ?? []).filter((r) => !!(r.title as string | null)?.startsWith('e2e-') === args.testViewer && r.current_generation_id && (r.status === 'FINALIZED' || (args.withDraft && r.status !== 'DRAFT')));
  const picked = pickRevisions(usable.map((r) => ({ id: r.id as string, kind: r.run_kind as LaborKind, periodFrom: r.period_from as string, periodTo: r.period_to as string, sequence: r.sequence as number, revision: r.revision as number, final: r.status === 'FINALIZED', generationId: r.current_generation_id as string })));
  const people = new Map((staff ?? []).map((p) => [p.id as string, { name: p.name as string, employeeNo: p.employee_no as string | null, groupId: p.group_id as string | null }]));
  const scope = args.groupId ? groupScope(orgGroups, args.groupId) : null;
  const rows: LaborRow[] = [];
  let blocked = 0;
  for (let i = 0; i < picked.length; i += 50) {
    const part = picked.slice(i, i + 50);
    const { data: sts, error: e2 } = await c.from('payroll_statements').select('generation_id, employee_id, state, pay_total, deduction_total, net_total, employer_total').in('generation_id', part.map((r) => r.generationId)).limit(20000);
    if (e2) throw new Error(`buildLaborCost.statements: ${e2.code}`);
    for (const s of sts ?? []) {
      const run = part.find((r) => r.generationId === s.generation_id)!;
      const groupId = people.get(s.employee_id as string)?.groupId ?? null;
      if (scope && !(groupId && scope.has(groupId))) continue;
      if (s.state !== 'OK' || s.pay_total === null) {
        blocked++;
        continue;
      }
      rows.push({ runId: run.id, kind: run.kind, month: run.periodFrom.slice(0, 7), final: run.final, employeeId: s.employee_id as string, groupId, pay: Number(s.pay_total), deduction: Number(s.deduction_total), net: Number(s.net_total), employer: Number(s.employer_total ?? 0) });
    }
  }
  const nameOf = (id: string | null) => {
    const g = orgGroups.find((x) => x.id === id);
    const parent = g?.parentId ? orgGroups.find((x) => x.id === g.parentId) : null;
    return g ? (parent ? `${parent.name} › ${g.name}` : g.name) : args.unassigned;
  };
  return { year: args.year, rows: rows.length, blocked, hasDraft: rows.some((r) => !r.final), ...sumLabor(rows, people, nameOf) };
}
