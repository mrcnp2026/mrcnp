// 사회보험 — 취득/상실 확인, 고지 보험료 넣기 · 대장에 차액 반영 (PRD v1.3 9장 · 18.4 W06, DB 0039). 서버 전용, 급여 담당 관리자만 부른다.
// ★ 프로그램이 공단에 신고하지 않는다. 「확인 완료」는 담당자가 신고 처리를 확인한 날과 근거를 적는 것이다.
// ★ 고지 금액은 받은 그대로 둔다(고치지 못한다 — 잘못 넣었으면 그 묶음을 거두고 다시 넣는다).
// ★ 차액 = 근로자 고지액 − 그 대장에서 이미 뗀 금액. 추가 공제는 양수, 환급은 음수. 확정 전 대장에만 「정산」 공제 항목으로 넣는다(확정본은 정정 판에서).
// ★ 같은 고지 금액은 한 대장에만 들어간다(DB가 막는다). 대장에서 빼면 다른 대장에 넣을 수 있다.
// ★ 지금은 손으로 넣는다. 공단 파일을 읽는 것은 양식을 받은 뒤(급여-38).
import { OFFICE } from '@/config/office';
import 'server-only';
import { ApiError } from '@/lib/api';
import type { Me } from '@/lib/auth';
import { addDays } from '@/lib/calendar';
import { createAdminClient } from '@/lib/supabase/admin';
import { addOverride, loadRun, withdrawOverride, type RunRow } from './run-data';
import { payrollAudit } from './staff-data';

const db = () => createAdminClient();
type Row = Record<string, unknown>;
const isTestNo = (no: string | null | undefined) => !!no?.startsWith('e2e-');
const boom = (where: string, e: { code?: string } | null): never => {
  throw new Error(`${where}: ${e?.code ?? 'unknown'}`);
};

export const INSURERS = ['NP', 'HI', 'EI', 'IA'] as const;
export type Insurer = (typeof INSURERS)[number];
/** 보험별: 대장에서 근로자에게 떼는 항목(이미 뗀 금액을 볼 때)과 정산 차액을 넣는 항목. 산재는 근로자 부담이 없어 반영하지 않는다 */
export const INSURER_LINES: Record<Insurer, { deducted: string[]; settle: string | null }> = {
  NP: { deducted: ['PENSION'], settle: 'PENSION_SETTLE' },
  HI: { deducted: ['HEALTH', 'LTC'], settle: 'HEALTH_SETTLE' },
  EI: { deducted: ['EMPLOYMENT'], settle: 'EMPLOYMENT_SETTLE' },
  IA: { deducted: [], settle: null },
};
const KEY = 'employee.notice';

// ── 취득 · 상실 ──
export type Enrollment = { id: string; employeeId: string; name: string; employeeNo: string | null; insurer: Insurer; event: 'ACQUIRE' | 'LOSE'; qualifyOn: string; state: 'UNREPORTED' | 'CHECKING' | 'CONFIRMED'; confirmedOn: string | null; evidence: string | null; note: string | null; version: number };
export type EnrollGap = { employeeId: string; name: string; employeeNo: string | null; event: 'ACQUIRE' | 'LOSE'; qualifyOn: string };
export async function loadEnrollments(testViewer: boolean): Promise<{ rows: Enrollment[]; gaps: EnrollGap[]; people: { id: string; name: string; employeeNo: string | null }[] }> {
  const c = db();
  const [{ data, error }, { data: staff }, { data: emps }] = await Promise.all([
    c.from('payroll_insurance_enrollments').select('*').eq('active', true).order('qualify_on', { ascending: false }).limit(2000),
    c.from('profiles').select('id, name, employee_no').order('name'),
    c.from('staff_employment_periods').select('employee_id, starts_on, ends_on').eq('active', true),
  ]);
  if (error) boom('loadEnrollments', error);
  // 시스템관리자(admin)는 직원이 아니라 보험 확인 대상에서 뺀다 (2026-10-17 디자인)
  const people = (staff ?? []).filter((p) => isTestNo(p.employee_no as string | null) === testViewer && p.employee_no !== OFFICE.ownerEmployeeNo).map((p) => ({ id: p.id as string, name: p.name as string, employeeNo: p.employee_no as string | null }));
  const who = new Map(people.map((p) => [p.id, p]));
  const rows = ((data ?? []) as Row[]).filter((r) => who.has(r.employee_id as string)).map((r): Enrollment => ({
    id: r.id as string, employeeId: r.employee_id as string, name: who.get(r.employee_id as string)!.name, employeeNo: who.get(r.employee_id as string)!.employeeNo, insurer: r.insurer as Insurer, event: r.event as Enrollment['event'], qualifyOn: r.qualify_on as string,
    state: r.state as Enrollment['state'], confirmedOn: r.confirmed_on as string | null, evidence: r.evidence as string | null, note: r.note as string | null, version: r.version as number,
  }));
  // 재직 기간은 있는데 취득/상실 줄이 하나도 없는 사람 — 담당자가 확인할 후보 (자동으로 만들지 않는다)
  const has = new Set(rows.map((r) => `${r.employeeId}|${r.event}|${r.qualifyOn}`));
  const gaps: EnrollGap[] = [];
  for (const e of emps ?? []) {
    const p = who.get(e.employee_id as string);
    if (!p) continue;
    const start = e.starts_on as string;
    if (!has.has(`${p.id}|ACQUIRE|${start}`)) gaps.push({ employeeId: p.id, name: p.name, employeeNo: p.employeeNo, event: 'ACQUIRE', qualifyOn: start });
    if (e.ends_on) {
      const lose = new Date(Date.parse(`${e.ends_on as string}T00:00:00Z`) + 86400000).toISOString().slice(0, 10); // 상실일 = 마지막 근무일 다음날
      if (!has.has(`${p.id}|LOSE|${lose}`)) gaps.push({ employeeId: p.id, name: p.name, employeeNo: p.employeeNo, event: 'LOSE', qualifyOn: lose });
    }
  }
  return { rows, gaps, people };
}

/** 「확인할 사람」은 최근에 입사 · 퇴사한 사람만 — 오래전 입사자는 이미 신고했을 가능성이 커서 따로 접어 둔다 (2026-10-26 의뢰인) */
export const GAP_RECENT_DAYS = 90;
export const isRecentGap = (g: EnrollGap, today: string): boolean => g.qualifyOn >= addDays(today, -GAP_RECENT_DAYS);

/** 오래된 건을 한꺼번에 「확인 완료」로 — 이미 신고했다고 담당자가 확인한 직원들. 4대보험 4줄을 확인 완료로 만든다(해당하지 않는 보험은 나중에 줄에서 끈다) */
export async function confirmOldEnrollments(args: { me: Me; today: string; requestId?: string }): Promise<{ people: number; lines: number }> {
  const { gaps } = await loadEnrollments(isTestNo(args.me.employeeNo));
  const old = gaps.filter((g) => !isRecentGap(g, args.today));
  let lines = 0;
  for (const g of old) {
    for (const insurer of INSURERS) {
      const { error } = await db().from('payroll_insurance_enrollments').insert({ employee_id: g.employeeId, insurer, event: g.event, qualify_on: g.qualifyOn, state: 'CONFIRMED', confirmed_on: args.today, evidence: '기존 직원 일괄 확인(이미 신고됨)', created_by: args.me.id });
      if (error && error.code !== '23505') boom('confirmOldEnrollments', error);
      if (!error) lines++;
    }
  }
  await payrollAudit({ actorId: args.me.id, action: 'insurance.enroll.confirmOld', table: 'payroll_insurance_enrollments', requestId: args.requestId, detail: { people: old.length, lines } });
  return { people: old.length, lines };
}

const sameSide = async (employeeId: string, me: Me) => {
  const { data: p } = await db().from('profiles').select('employee_no').eq('id', employeeId).maybeSingle();
  if (!p || isTestNo(p.employee_no as string | null) !== isTestNo(me.employeeNo)) throw new ApiError(404, 'not_found');
};

export async function addEnrollments(args: { employeeId: string; insurers: Insurer[]; event: 'ACQUIRE' | 'LOSE'; qualifyOn: string; me: Me; requestId?: string }): Promise<{ added: number; skipped: number }> {
  await sameSide(args.employeeId, args.me);
  let added = 0, skipped = 0;
  for (const insurer of args.insurers) {
    const { error } = await db().from('payroll_insurance_enrollments').insert({ employee_id: args.employeeId, insurer, event: args.event, qualify_on: args.qualifyOn, created_by: args.me.id });
    if (error?.code === '23505') skipped++; // 이미 있는 줄
    else if (error) boom('addEnrollments', error);
    else added++;
  }
  await payrollAudit({ actorId: args.me.id, action: 'insurance.enroll.add', table: 'payroll_insurance_enrollments', employeeId: args.employeeId, requestId: args.requestId, detail: { event: args.event, insurers: args.insurers, added } });
  return { added, skipped };
}

export async function setEnrollment(args: { id: string; expectedVersion: number; state?: Enrollment['state']; confirmedOn?: string | null; evidence?: string | null; disable?: boolean; me: Me; requestId?: string }): Promise<void> {
  const c = db();
  const { data: cur } = await c.from('payroll_insurance_enrollments').select('id, employee_id, version, active').eq('id', args.id).maybeSingle();
  if (!cur || !cur.active) throw new ApiError(404, 'not_found');
  await sameSide(cur.employee_id as string, args.me);
  if (cur.version !== args.expectedVersion) throw new ApiError(409, 'version_conflict');
  const patch: Row = { version: args.expectedVersion + 1, updated_by: args.me.id };
  if (args.disable) patch.active = false;
  else {
    if (args.state === 'CONFIRMED' && (!args.confirmedOn || !args.evidence)) throw new ApiError(400, 'insurance_evidence'); // 확인 완료는 확인한 날과 근거가 있어야 한다
    patch.state = args.state;
    patch.confirmed_on = args.state === 'CONFIRMED' ? args.confirmedOn : null;
    patch.evidence = args.state === 'CONFIRMED' ? args.evidence : null;
  }
  const { data, error } = await c.from('payroll_insurance_enrollments').update(patch).eq('id', args.id).eq('version', args.expectedVersion).select('id');
  if (error) boom('setEnrollment', error);
  if (!data?.length) throw new ApiError(409, 'version_conflict');
  await payrollAudit({ actorId: args.me.id, action: args.disable ? 'insurance.enroll.disable' : 'insurance.enroll.state', table: 'payroll_insurance_enrollments', subjectId: args.id, employeeId: cur.employee_id as string, requestId: args.requestId, detail: { state: args.state ?? null } });
}

// ── 고지 보험료 ──
export type NoticeFile = { id: string; insurer: Insurer; month: string; source: 'FILE' | 'MANUAL'; rows: number; state: 'SAVED' | 'WITHDRAWN'; withdrawReason: string | null; isTest: boolean; uploadedBy: string; createdAt: string };
const toFile = (r: Row): NoticeFile => ({ id: r.id as string, insurer: r.insurer as Insurer, month: (r.notice_month as string).slice(0, 7), source: r.source_kind as NoticeFile['source'], rows: r.row_count as number, state: r.state as NoticeFile['state'], withdrawReason: r.withdraw_reason as string | null, isTest: r.is_test as boolean, uploadedBy: r.uploaded_by as string, createdAt: r.created_at as string });

async function testUploaders(): Promise<Set<string>> {
  const { data } = await db().from('profiles').select('id').like('employee_no', 'e2e-%');
  return new Set((data ?? []).map((p) => p.id as string));
}
export async function loadNoticeFiles(args: { practice: boolean; testViewer: boolean }): Promise<NoticeFile[]> {
  const [{ data, error }, tests] = await Promise.all([db().from('payroll_insurance_notice_files').select('*').eq('is_test', args.practice).order('notice_month', { ascending: false }).order('created_at', { ascending: false }).limit(200), testUploaders()]);
  if (error) boom('loadNoticeFiles', error);
  // 검사 계정이 넣은 묶음은 검사 계정에게만 보인다
  return ((data ?? []) as Row[]).map(toFile).filter((f) => tests.has(f.uploadedBy) === args.testViewer);
}

export type ManualRow = { employeeId: string; employee: number; employer: number | null; note: string | null };
/** 손으로 넣기 — 보험 · 고지월 · 직원마다 근로자 고지액(필수) · 사업주 고지액. 직원은 넣는 사람이 직접 골랐으므로 바로 이어진다 */
export async function saveManualNotice(args: { insurer: Insurer; month: string; rows: ManualRow[]; practice: boolean; me: Me; requestId?: string; fileName?: string | null }): Promise<{ id: string }> {
  // fileName이 있으면 엑셀 · CSV에서 읽은 줄이다(2026-10-20) — 묶음은 FILE, 줄마다 「파일 · 이름」을 근거로 남긴다
  const fromFile = !!args.fileName;
  const c = db();
  if (args.rows.length === 0 || args.rows.length > 300 || new Set(args.rows.map((r) => r.employeeId)).size !== args.rows.length) throw new ApiError(400, 'insurance_rows');
  for (const r of args.rows) await sameSide(r.employeeId, args.me);
  const { data: staff } = await c.from('profiles').select('id, name').in('id', args.rows.map((r) => r.employeeId));
  const { data: file, error } = await c.from('payroll_insurance_notice_files').insert({ insurer: args.insurer, notice_month: `${args.month}-01`, source_kind: fromFile ? 'FILE' : 'MANUAL', row_count: args.rows.length, is_test: args.practice, uploaded_by: args.me.id }).select('id').single();
  if (error || !file) boom('saveManualNotice.file', error);
  const now = new Date().toISOString();
  const ins = await c.from('payroll_insurance_notices').insert(args.rows.map((r, i) => ({
    file_id: file!.id, row_key: String(i + 1), raw_name: ((staff ?? []).find((p) => p.id === r.employeeId)?.name as string | undefined) ?? null, employee_id: r.employeeId, mapping_state: 'MAPPED', mapping_basis: (fromFile ? `파일 ${args.fileName}${r.note ? ` · ${r.note}` : ''}` : r.note ? `직접 입력 · ${r.note}` : '직접 입력').slice(0, 200), mapped_by: args.me.id, mapped_at: now,
    components: { [KEY]: String(r.employee), ...(r.employer === null ? {} : { 'employer.notice': String(r.employer) }) },
  })));
  if (ins.error) {
    // 줄을 넣지 못했으면 빈 묶음이 남지 않게 거둔다
    await c.from('payroll_insurance_notice_files').update({ state: 'WITHDRAWN', withdraw_reason: '저장 실패' }).eq('id', file!.id);
    boom('saveManualNotice.rows', ins.error);
  }
  await payrollAudit({ actorId: args.me.id, action: 'insurance.notice.save', table: 'payroll_insurance_notice_files', subjectId: file!.id as string, requestId: args.requestId, detail: { insurer: args.insurer, month: args.month, rows: args.rows.length, ...(fromFile ? { file: args.fileName } : {}) } });
  return { id: file!.id as string };
}

export type NoticeLine = { id: string; employeeId: string | null; name: string; employeeNo: string | null; basis: string | null; notice: number; employer: number | null; deducted: number | null; diff: number | null; allocation: { id: string; runId: string; amount: number; here: boolean } | null };
export type NoticeView = { file: NoticeFile; lines: NoticeLine[]; run: RunRow | null; runs: RunRow[]; canAllocate: boolean; why: 'no_run' | 'finalized' | 'not_calculated' | 'no_settle' | 'withdrawn' | null };
/** 한 묶음의 줄 + 고른 대장에서 이미 뗀 금액 · 차액. 대장을 고르지 않았으면 고지액만 보인다 */
export async function loadNotice(args: { id: string; runId: string | null; practice: boolean; testViewer: boolean }): Promise<NoticeView | null> {
  const c = db();
  const [{ data: f }, tests] = await Promise.all([c.from('payroll_insurance_notice_files').select('*').eq('id', args.id).maybeSingle(), testUploaders()]);
  if (!f || tests.has(f.uploaded_by as string) !== args.testViewer || f.is_test !== args.practice) return null;
  const file = toFile(f as Row);
  const [{ data: notices }, { data: staff }, { data: runsRaw }] = await Promise.all([
    c.from('payroll_insurance_notices').select('*').eq('file_id', file.id).order('created_at'),
    c.from('profiles').select('id, name, employee_no'),
    c.from('payroll_runs').select('id').eq('is_test', args.practice).eq('run_kind', 'REGULAR').neq('status', 'FINALIZED').order('period_from', { ascending: false }).limit(24),
  ]);
  const runs = (await Promise.all((runsRaw ?? []).map((r) => loadRun(r.id as string)))).filter((r): r is RunRow => !!r && !!r.title?.startsWith('e2e-') === args.testViewer);
  const run = args.runId ? (runs.find((r) => r.id === args.runId) ?? null) : null;
  const ids = (notices ?? []).map((n) => n.id as string);
  const { data: allocs } = ids.length ? await c.from('payroll_insurance_allocations').select('id, notice_id, run_id, amount').in('notice_id', ids).eq('active', true) : { data: [] as Row[] };
  const lines = INSURER_LINES[file.insurer];
  const deductedOf = new Map<string, number>();
  if (run?.generationId && lines.deducted.length) {
    const { data: sts } = await c.from('payroll_statements').select('id, employee_id, state').eq('generation_id', run.generationId);
    const ok = (sts ?? []).filter((s) => s.state === 'OK');
    const { data: items } = ok.length ? await c.from('payroll_statement_items').select('statement_id, item_code, amount').in('statement_id', ok.map((s) => s.id as string)).eq('kind', 'DEDUCTION').in('item_code', lines.deducted) : { data: [] as Row[] };
    for (const s of ok) deductedOf.set(s.employee_id as string, (items ?? []).filter((i) => i.statement_id === s.id).reduce((a, i) => a + Number(i.amount), 0));
  }
  const who = new Map((staff ?? []).map((p) => [p.id as string, p]));
  const why: NoticeView['why'] = file.state === 'WITHDRAWN' ? 'withdrawn' : !lines.settle ? 'no_settle' : !run ? 'no_run' : !run.generationId ? 'not_calculated' : null;
  return {
    file, run, runs, why, canAllocate: why === null,
    lines: ((notices ?? []) as Row[]).map((n) => {
      const emp = n.employee_id as string | null, comp = (n.components ?? {}) as Record<string, string>;
      const notice = Number(comp[KEY] ?? 0), a = (allocs ?? []).find((x) => x.notice_id === n.id);
      const deducted = emp && run?.generationId ? (deductedOf.get(emp) ?? null) : null; // null = 그 대장에 이 직원의 계산된 명세서가 없다
      return {
        id: n.id as string, employeeId: emp, name: emp ? ((who.get(emp)?.name as string) ?? '') : ((n.raw_name as string | null) ?? ''), employeeNo: emp ? ((who.get(emp)?.employee_no as string | null) ?? null) : null, basis: n.mapping_basis as string | null,
        notice, employer: comp['employer.notice'] === undefined ? null : Number(comp['employer.notice']), deducted, diff: deducted === null ? null : notice - deducted,
        allocation: a ? { id: a.id as string, runId: a.run_id as string, amount: Number(a.amount), here: a.run_id === run?.id } : null,
      };
    }),
  };
}

/** 차액을 대장에 넣는다 — 그 직원의 「○○보험 정산」 공제 항목(조정)으로. 넣은 뒤에는 대장을 다시 계산해야 한다 */
export async function allocateNotice(args: { noticeId: string; runId: string; practice: boolean; me: Me; requestId?: string }): Promise<{ amount: number }> {
  const c = db();
  const { data: n } = await c.from('payroll_insurance_notices').select('id, file_id, employee_id').eq('id', args.noticeId).maybeSingle();
  if (!n?.employee_id) throw new ApiError(404, 'not_found');
  const view = await loadNotice({ id: n.file_id as string, runId: args.runId, practice: args.practice, testViewer: isTestNo(args.me.employeeNo) });
  if (!view) throw new ApiError(404, 'not_found');
  if (!view.canAllocate || !view.run) throw new ApiError(409, `insurance_${view.why ?? 'no_run'}`);
  const line = view.lines.find((l) => l.id === args.noticeId)!;
  if (line.allocation) throw new ApiError(409, 'insurance_allocated');
  if (line.diff === null) throw new ApiError(409, 'insurance_no_statement'); // 그 대장에 이 직원의 계산된 명세서가 없다
  if (line.diff === 0) throw new ApiError(409, 'insurance_no_diff');
  const code = INSURER_LINES[view.file.insurer].settle!;
  // 같은 대장 · 같은 직원 · 같은 보험에 다른 달의 정산이 이미 들어 있으면 덮어쓰지 않는다
  const { data: busy } = await c.from('payroll_statement_overrides').select('id').eq('run_id', view.run.id).eq('employee_id', line.employeeId!).eq('item_code', code).eq('active', true).limit(1);
  if (busy?.length) throw new ApiError(409, 'insurance_other_settle');
  await addOverride({ id: view.run.id, employeeId: line.employeeId!, itemCode: code, kind: 'DEDUCTION', amount: line.diff, reason: `${view.file.month} 고지 ${line.notice} − 공제 ${line.deducted} (고지 정산)`, me: args.me, requestId: args.requestId });
  const { data: ov } = await c.from('payroll_statement_overrides').select('id').eq('run_id', view.run.id).eq('employee_id', line.employeeId!).eq('item_code', code).eq('active', true).order('created_at', { ascending: false }).limit(1);
  const overrideId = ov?.[0]?.id as string | undefined;
  const { error } = await c.from('payroll_insurance_allocations').insert({ notice_id: line.id, component_key: KEY, run_id: view.run.id, employee_id: line.employeeId, amount: line.diff, override_id: overrideId ?? null, created_by: args.me.id });
  if (error) {
    if (overrideId) await withdrawOverride({ id: view.run.id, overrideId, me: args.me, requestId: args.requestId }).catch(() => undefined);
    if (error.code === '23505') throw new ApiError(409, 'insurance_allocated'); // 같은 고지 금액은 한 대장에만
    boom('allocateNotice', error);
  }
  await payrollAudit({ actorId: args.me.id, action: 'insurance.allocate', table: 'payroll_insurance_allocations', subjectId: line.id, runId: view.run.id, employeeId: line.employeeId, requestId: args.requestId, detail: { insurer: view.file.insurer, month: view.file.month } });
  return { amount: line.diff };
}

/** 대장에서 뺀다 — 조정을 거두고 반영 기록을 끈다. 확정한 대장에서는 뺄 수 없다(정정 판에서 한다) */
export async function unallocateNotice(args: { allocationId: string; me: Me; requestId?: string }): Promise<void> {
  const c = db();
  const { data: a } = await c.from('payroll_insurance_allocations').select('id, run_id, employee_id, override_id, active').eq('id', args.allocationId).maybeSingle();
  if (!a?.active) throw new ApiError(404, 'not_found');
  await sameSide(a.employee_id as string, args.me);
  const run = await loadRun(a.run_id as string);
  if (!run || run.status === 'FINALIZED') throw new ApiError(409, 'payroll_finalized');
  if (a.override_id) await withdrawOverride({ id: run.id, overrideId: a.override_id as string, me: args.me, requestId: args.requestId }).catch((e) => { if (!(e instanceof ApiError && e.status === 404)) throw e; });
  const { error } = await c.from('payroll_insurance_allocations').update({ active: false, updated_by: args.me.id }).eq('id', a.id).eq('active', true);
  if (error) boom('unallocateNotice', error);
  await payrollAudit({ actorId: args.me.id, action: 'insurance.unallocate', table: 'payroll_insurance_allocations', subjectId: a.id as string, runId: run.id, employeeId: a.employee_id as string, requestId: args.requestId });
}

/** 묶음 거두기 — 잘못 넣었을 때. 대장에 들어간 줄이 있으면 먼저 빼야 한다 */
export async function withdrawNoticeFile(args: { id: string; reason: string; me: Me; requestId?: string }): Promise<void> {
  const c = db();
  const { data: f } = await c.from('payroll_insurance_notice_files').select('id, state, uploaded_by').eq('id', args.id).maybeSingle();
  if (!f || (await testUploaders()).has(f.uploaded_by as string) !== isTestNo(args.me.employeeNo)) throw new ApiError(404, 'not_found');
  if (f.state !== 'SAVED') throw new ApiError(409, 'insurance_withdrawn');
  const { data: ns } = await c.from('payroll_insurance_notices').select('id').eq('file_id', args.id);
  const ids = (ns ?? []).map((n) => n.id as string);
  if (ids.length) {
    const { count } = await c.from('payroll_insurance_allocations').select('id', { count: 'exact', head: true }).in('notice_id', ids).eq('active', true);
    if ((count ?? 0) > 0) throw new ApiError(409, 'insurance_in_use');
  }
  const { error } = await c.from('payroll_insurance_notice_files').update({ state: 'WITHDRAWN', withdraw_reason: args.reason }).eq('id', args.id).eq('state', 'SAVED');
  if (error) boom('withdrawNoticeFile', error);
  await payrollAudit({ actorId: args.me.id, action: 'insurance.notice.withdraw', table: 'payroll_insurance_notice_files', subjectId: args.id, requestId: args.requestId });
}
