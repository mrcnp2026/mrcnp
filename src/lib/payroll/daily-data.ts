// 일용직 — 지급 대상자 · 고용 기간 · 근무 입력 · 일용 대장(계산 → 검토 → 확정) (PRD v1.3 9장 · 18.5 W07, DB 0039). 서버 전용, 급여 담당 관리자만 부른다.
// ★ 지급 대상자는 로그인 계정과 따로다(계정을 만들지 않는다). 이름이 같아도 내부번호가 다르면 다른 사람이다.
// ★ 같은 사람 · 날짜 · 현장 · 구간의 근무는 한 번만 들어간다(DB가 막는다). 확정한 줄은 금액을 고치지 못하고 무효로 한 뒤 새로 넣는다.
// ★ 일용 대장은 급여대장 표(payroll_runs, 종류 DAILY)를 같이 쓰되 명세는 일용 명세 표에 쌓는다. 한 근무 줄은 확정한 대장 하나에만 들어간다.
// ★ 세금은 일용근로소득 임시 규칙(daily.ts), 4대보험료는 계산하지 않는다. 적용 상태가 「모름」이면 그 사람은 계산하지 않는다(0원 아님).
// ★ 신고용 파일(지급명세서 제출)과 이체는 없다.
import 'server-only';
import { readAll } from '@/lib/read-all';
import { ApiError } from '@/lib/api';
import type { Me } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { calcDaily, DAILY_INSURANCE_RULE, DAILY_RULE, QTY_MAX, toDailyItems, type DailyAdjustment, type DailyItem, type DailyLineRow, type DailyResult, type DailyTerms, type DailyWork, type MonthlyItem, type PayBasis, type WorkerKind } from './daily';
import { sha } from './data';
import { loadCalcBasis, loadRun, type RunRow } from './run-data';
import { payrollAudit } from './staff-data';

const db = () => createAdminClient();
type Row = Record<string, unknown>;
const isTestNo = (no: string | null | undefined) => !!no?.startsWith('e2e-');
const boom = (where: string, e: { code?: string; message?: string } | null): never => {
  if (e?.code === 'P0001' && ['payroll_duplicate_payment','payroll_stale','payroll_has_blocked','payroll_not_calculated','daily_work_in_run'].includes(e.message ?? '')) throw new ApiError(409, e.message!);
  if (e?.code === 'PX001') throw new ApiError(409, 'daily_work_locked');
  if (e?.code === 'PX003') throw new ApiError(409, 'version_conflict');
  if (e?.code === 'PX004') throw new ApiError(409, 'daily_payee_has_records');
  if (e?.code === 'PR001') throw new ApiError(409, 'payroll_finalized');
  if (e?.code === 'PR003') throw new ApiError(409, 'payroll_run_conflict');
  throw new Error(`${where}: ${e?.code ?? 'unknown'}`);
};

// ── 대상자 · 고용 기간 ──
export type Payee = { id: string; internalNo: string; name: string; jobTitle: string | null; profileId: string | null; phone: string | null; note: string | null; active: boolean; isTest: boolean; workerKind: WorkerKind; nationality: string | null; visaType: string | null; stayUntil: string | null; monthlyItems: MonthlyItem[]; hasRecords?: boolean };
export type Engagement = DailyTerms & { id: string; payeeId: string; startsOn: string; endsOn: string | null; project: string; dayRate: number | null; payBasis: PayBasis; basisNote: string | null; active: boolean };
const toPayee = (r: Row): Payee => ({ id: r.id as string, internalNo: r.internal_no as string, name: r.name as string, jobTitle: (r.job_title as string | null) ?? null, profileId: r.profile_id as string | null, phone: r.phone as string | null, note: r.note as string | null, active: r.active as boolean, isTest: r.is_test as boolean, workerKind: ((r.worker_kind as WorkerKind | undefined) ?? 'GENERAL'), nationality: (r.nationality as string | null) ?? null, visaType: (r.visa_type as string | null) ?? null, stayUntil: (r.stay_until as string | null) ?? null, monthlyItems: Array.isArray(r.monthly_items) ? (r.monthly_items as MonthlyItem[]) : [] });
const toEngagement = (r: Row): Engagement => ({ id: r.id as string, payeeId: r.payee_id as string, startsOn: r.starts_on as string, endsOn: r.ends_on as string | null, project: r.project as string, dayRate: r.day_rate === null ? null : Number(r.day_rate), payBasis: ((r.pay_basis as PayBasis | undefined) ?? 'DAY'), taxState: r.tax_state as DailyTerms['taxState'], ei: r.ei_state as DailyTerms['ei'], np: r.np_state as DailyTerms['np'], hi: r.hi_state as DailyTerms['hi'], basisNote: r.basis_note as string | null, active: r.active as boolean });

/** 검사 계정이 만든 대상자(is_test)는 검사 계정에게만, 실제 대상자는 실제 관리자에게만 보인다 */
export async function loadPayees(testViewer: boolean): Promise<{ payees: Payee[]; engagements: Engagement[] }> {
  const c = db();
  const { data, error } = await c.from('payroll_payees').select('*').eq('is_test', testViewer).order('name').limit(2000);
  if (error) boom('loadPayees', error);
  const payees = ((data ?? []) as Row[]).map(toPayee);
  const ids = payees.map((p) => p.id);
  const { data: es } = ids.length ? await c.from('payroll_payee_engagements').select('*').in('payee_id', ids).eq('active', true).order('starts_on', { ascending: false }) : { data: [] as Row[] };
  // 지급 기록(근무 줄)이 있는 대상자 — 없으면 지울 수 있다
  const { data: used } = ids.length ? await c.from('payroll_daily_work').select('payee_id').in('payee_id', ids).limit(5000) : { data: [] as Row[] };
  const withRecords = new Set(((used ?? []) as Row[]).map((u) => u.payee_id as string));
  return { payees: payees.map((p) => ({ ...p, hasRecords: withRecords.has(p.id) })), engagements: ((es ?? []) as Row[]).map(toEngagement) };
}
const myPayee = async (id: string, me: Me): Promise<Payee> => {
  const { data } = await db().from('payroll_payees').select('*').eq('id', id).maybeSingle();
  if (!data || (data.is_test as boolean) !== isTestNo(me.employeeNo)) throw new ApiError(404, 'not_found');
  return toPayee(data as Row);
};

export type PayeeInfo = { name: string; jobTitle?: string | null; phone: string | null; note: string | null; workerKind?: WorkerKind; nationality?: string | null; visaType?: string | null; stayUntil?: string | null; monthlyItems?: MonthlyItem[] };
const infoRow = (i: PayeeInfo) => ({
  name: i.name, job_title: i.jobTitle ?? null, phone: i.phone, note: i.note,
  ...(i.workerKind ? { worker_kind: i.workerKind, nationality: i.workerKind === 'FOREIGN' ? (i.nationality ?? null) : null, visa_type: i.workerKind === 'FOREIGN' ? (i.visaType ?? null) : null, stay_until: i.workerKind === 'FOREIGN' ? (i.stayUntil ?? null) : null } : {}),
  ...(i.monthlyItems ? { monthly_items: i.monthlyItems } : {}),
});
/** 다음 내부번호 — D0001부터 (검사 계정은 e2e-D0001). 비워 두면 자동으로 붙인다 */
async function nextInternalNo(test: boolean): Promise<string> {
  const prefix = test ? 'e2e-D' : 'D';
  const { data } = await db().from('payroll_payees').select('internal_no').like('internal_no', `${prefix}%`).limit(5000);
  const nums = ((data ?? []) as Row[]).map((r) => Number(String(r.internal_no).slice(prefix.length))).filter((n) => Number.isInteger(n));
  return `${prefix}${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(4, '0')}`;
}
export async function addPayee(args: PayeeInfo & { internalNo: string; profileId: string | null; me: Me; requestId?: string }): Promise<{ id: string; internalNo: string }> {
  const test = isTestNo(args.me.employeeNo);
  const internalNo = args.internalNo || (await nextInternalNo(test));
  if (internalNo.toLowerCase().startsWith('e2e-') !== test) throw new ApiError(400, 'daily_internal_no'); // e2e- 로 시작하는 번호는 검사용으로 남겨 둔다
  const { data, error } = await db().from('payroll_payees').insert({ internal_no: internalNo, ...infoRow(args), profile_id: args.profileId, is_test: test, created_by: args.me.id }).select('id').single();
  if (error?.code === '23505') throw new ApiError(409, 'daily_payee_exists'); // 내부번호가 겹치거나, 그 직원에 이미 이어진 대상자가 있다
  if (error || !data) boom('addPayee', error);
  await payrollAudit({ actorId: args.me.id, action: 'daily.payee.add', table: 'payroll_payees', subjectId: data!.id as string, requestId: args.requestId });
  return { id: data!.id as string, internalNo };
}
/** 대상자 정보 고치기 — 이름 · 연락처 · 일반/외국인 · 국적 · 체류 자격 · 매달 항목. 내부번호는 바꾸지 않는다 */
export async function updatePayee(args: PayeeInfo & { id: string; me: Me; requestId?: string }): Promise<void> {
  const p = await myPayee(args.id, args.me);
  const { error } = await db().from('payroll_payees').update({ ...infoRow(args), updated_by: args.me.id }).eq('id', p.id);
  if (error) boom('updatePayee', error);
  await payrollAudit({ actorId: args.me.id, action: 'daily.payee.update', table: 'payroll_payees', subjectId: p.id, requestId: args.requestId });
}
/** 지우기 — 근무 줄 · 명세가 하나도 없을 때만(고용 기간도 함께). 있으면 DB가 막는다(사용 중지로) */
export async function deletePayee(args: { id: string; me: Me; requestId?: string }): Promise<void> {
  const p = await myPayee(args.id, args.me);
  const c = db();
  const { data: used } = await c.from('payroll_daily_work').select('id').eq('payee_id', p.id).limit(1);
  if (used?.length) throw new ApiError(409, 'daily_payee_has_records');
  const e1 = await c.from('payroll_payee_engagements').delete().eq('payee_id', p.id);
  if (e1.error) boom('deletePayee.engagements', e1.error);
  const e2 = await c.from('payroll_payees').delete().eq('id', p.id);
  if (e2.error) boom('deletePayee', e2.error);
  await payrollAudit({ actorId: args.me.id, action: 'daily.payee.delete', table: 'payroll_payees', subjectId: p.id, requestId: args.requestId, detail: { name: p.name, internalNo: p.internalNo } });
}
export async function setPayeeActive(args: { id: string; active: boolean; me: Me; requestId?: string }): Promise<void> {
  const p = await myPayee(args.id, args.me);
  const { error } = await db().from('payroll_payees').update({ active: args.active, updated_by: args.me.id }).eq('id', p.id);
  if (error) boom('setPayeeActive', error);
  await payrollAudit({ actorId: args.me.id, action: 'daily.payee.active', table: 'payroll_payees', subjectId: p.id, requestId: args.requestId, detail: { active: args.active } });
}

export async function addEngagement(args: { payeeId: string; startsOn: string; endsOn: string | null; project: string; dayRate: number | null; payBasis?: PayBasis; terms: DailyTerms; basisNote: string | null; me: Me; requestId?: string }): Promise<{ id: string }> {
  const p = await myPayee(args.payeeId, args.me);
  if (args.endsOn && args.endsOn < args.startsOn) throw new ApiError(400, 'daily_period');
  const { data, error } = await db().from('payroll_payee_engagements').insert({ payee_id: p.id, starts_on: args.startsOn, ends_on: args.endsOn, project: args.project, day_rate: args.dayRate, ...(args.payBasis && args.payBasis !== 'DAY' ? { pay_basis: args.payBasis } : {}), tax_state: args.terms.taxState, ei_state: args.terms.ei, np_state: args.terms.np, hi_state: args.terms.hi, basis_note: args.basisNote, created_by: args.me.id }).select('id').single();
  if (error?.code === '23P01') throw new ApiError(409, 'daily_engagement_overlap'); // 같은 현장의 기간이 겹친다
  if (error || !data) boom('addEngagement', error);
  await payrollAudit({ actorId: args.me.id, action: 'daily.engagement.add', table: 'payroll_payee_engagements', subjectId: data!.id as string, requestId: args.requestId });
  return { id: data!.id as string };
}
/** 적용 상태 · 일단가 · 끝나는 날 고치기, 끄기. 시작일 · 현장은 바꾸지 못한다(새로 넣는다) */
export async function setEngagement(args: { id: string; endsOn?: string | null; dayRate?: number | null; terms?: DailyTerms; basisNote?: string | null; disable?: boolean; me: Me; requestId?: string }): Promise<void> {
  const c = db();
  const { data: e } = await c.from('payroll_payee_engagements').select('id, payee_id, starts_on').eq('id', args.id).maybeSingle();
  if (!e) throw new ApiError(404, 'not_found');
  await myPayee(e.payee_id as string, args.me);
  const patch: Row = { updated_by: args.me.id };
  if (args.disable) patch.active = false;
  else {
    if (args.endsOn !== undefined) {
      if (args.endsOn && args.endsOn < (e.starts_on as string)) throw new ApiError(400, 'daily_period');
      patch.ends_on = args.endsOn;
    }
    if (args.dayRate !== undefined) patch.day_rate = args.dayRate;
    if (args.terms) Object.assign(patch, { tax_state: args.terms.taxState, ei_state: args.terms.ei, np_state: args.terms.np, hi_state: args.terms.hi });
    if (args.basisNote !== undefined) patch.basis_note = args.basisNote;
  }
  const { error } = await c.from('payroll_payee_engagements').update(patch).eq('id', args.id);
  if (error?.code === '23P01') throw new ApiError(409, 'daily_engagement_overlap');
  if (error) boom('setEngagement', error);
  await payrollAudit({ actorId: args.me.id, action: args.disable ? 'daily.engagement.disable' : 'daily.engagement.set', table: 'payroll_payee_engagements', subjectId: args.id, requestId: args.requestId });
}

// ── 근무 입력 ──
export type WorkRow = DailyWork & { payeeId: string; engagementId: string; segmentKey: string; basisNote: string | null; version: number; isTest: boolean; createdAt: string };
const toWork = (r: Row): WorkRow => ({ id: r.id as string, payeeId: r.payee_id as string, engagementId: r.engagement_id as string, workDate: r.work_date as string, project: r.project as string, segmentKey: r.segment_key as string, quantity: Number(r.quantity), dayRate: Number(r.day_rate), items: toDailyItems(r.items) ?? [], basisNote: r.basis_note as string | null, status: r.status as WorkRow['status'], version: r.version as number, isTest: r.is_test as boolean, createdAt: r.created_at as string });

export async function loadWork(args: { month: string; practice: boolean; payeeIds: string[] }): Promise<WorkRow[]> {
  if (args.payeeIds.length === 0) return [];
  const [y, m] = args.month.split('-').map(Number);
  const to = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const { data } = await readAll((a,b) => db().from('payroll_daily_work').select('*').eq('is_test', args.practice).in('payee_id', args.payeeIds).gte('work_date', `${args.month}-01`).lt('work_date', to).order('work_date').order('created_at').order('id').range(a,b));
  return ((data ?? []) as Row[]).map(toWork);
}

/** 근무 넣기 — 여러 날짜를 한 번에. 날짜마다 그 날짜 · 현장에 걸친 고용 기간이 있어야 한다. 단가를 비우면 고용 기간의 단가를 쓴다.
 *  confirm이면 바로 확정으로 넣는다(2026-10-28 급여-58: 한 줄씩 확정을 누르지 않게). 이미 있는 날 · 고용 기간 밖인 날은 건너뛰고 알려 준다 */
export async function addWork(args: { payeeId: string; workDates: string[]; project: string; segmentKey: string; quantity: number; dayRate: number | null; items: DailyItem[]; basisNote: string | null; confirm?: boolean; practice: boolean; me: Me; requestId?: string }): Promise<{ added: string[]; skipped: { date: string; code: string }[] }> {
  const c = db();
  const p = await myPayee(args.payeeId, args.me);
  const { data: es } = await c.from('payroll_payee_engagements').select('*').eq('payee_id', p.id).eq('active', true).eq('project', args.project);
  const engs = ((es ?? []) as Row[]).map(toEngagement);
  const added: string[] = [];
  const skipped: { date: string; code: string }[] = [];
  for (const workDate of [...new Set(args.workDates)].sort()) {
    const e = engs.find((x) => x.startsOn <= workDate && (x.endsOn === null || x.endsOn >= workDate));
    if (!e) {
      skipped.push({ date: workDate, code: 'daily_no_engagement' }); // 그 날짜 · 현장의 고용 기간이 없다
      continue;
    }
    if (args.quantity > QTY_MAX[e.payBasis]) throw new ApiError(400, 'daily_quantity'); // 지급 기준마다 수량 상한(일당 3 · 시간 744 · 월 12 · 건 100)
    const rate = args.dayRate ?? e.dayRate;
    if (!rate) throw new ApiError(400, 'daily_no_rate');
    const { data, error } = await c.from('payroll_daily_work').insert({ payee_id: p.id, engagement_id: e.id, work_date: workDate, project: args.project, segment_key: args.segmentKey, quantity: args.quantity, day_rate: rate, items: args.items, basis_note: args.basisNote, status: args.confirm ? 'CONFIRMED' : 'DRAFT', is_test: args.practice, created_by: args.me.id }).select('id').single();
    if (error?.code === '23505') {
      skipped.push({ date: workDate, code: 'daily_work_exists' }); // 같은 사람 · 날짜 · 현장 · 구간
      continue;
    }
    if (error || !data) boom('addWork', error);
    added.push(data!.id as string);
    await payrollAudit({ actorId: args.me.id, action: 'daily.work.add', table: 'payroll_daily_work', subjectId: data!.id as string, requestId: args.requestId, detail: { date: workDate } });
  }
  if (added.length === 0 && skipped.length) throw new ApiError(409, skipped[0].code);
  return { added, skipped };
}

/** 근무 한 줄 고치기 — 수량 · 단가 · 항목 · 근거. 확정 전이면 그 줄을 고치고, 확정한 줄이면 무효로 하고 같은 날에 새 줄을 넣는다(원래 줄은 기록으로 남는다) */
export async function editWork(args: { id: string; expectedVersion: number; quantity: number; dayRate: number | null; items: DailyItem[]; basisNote: string | null; me: Me; requestId?: string }): Promise<{ id: string }> {
  const c = db();
  const { data: w } = await c.from('payroll_daily_work').select('*').eq('id', args.id).maybeSingle();
  if (!w) throw new ApiError(404, 'not_found');
  await myPayee(w.payee_id as string, args.me);
  if (w.version !== args.expectedVersion) throw new ApiError(409, 'version_conflict');
  if (w.status === 'VOID') throw new ApiError(409, 'daily_work_locked');
  const { data: e } = await c.from('payroll_payee_engagements').select('*').eq('id', w.engagement_id as string).maybeSingle();
  const eng = e ? toEngagement(e as Row) : null;
  if (eng && args.quantity > QTY_MAX[eng.payBasis]) throw new ApiError(400, 'daily_quantity');
  const rate = args.dayRate ?? eng?.dayRate ?? Number(w.day_rate);
  if (w.status === 'DRAFT') {
    const { data, error } = await c.from('payroll_daily_work').update({ quantity: args.quantity, day_rate: rate, items: args.items, basis_note: args.basisNote, version: args.expectedVersion + 1, updated_by: args.me.id }).eq('id', args.id).eq('version', args.expectedVersion).select('id');
    if (error) boom('editWork', error);
    if (!data?.length) throw new ApiError(409, 'version_conflict');
    await payrollAudit({ actorId: args.me.id, action: 'daily.work.edit', table: 'payroll_daily_work', subjectId: args.id, requestId: args.requestId });
    return { id: args.id };
  }
  await setWorkStatus({ id: args.id, expectedVersion: args.expectedVersion, status: 'VOID', me: args.me, requestId: args.requestId });
  const { data, error } = await c.from('payroll_daily_work').insert({ payee_id: w.payee_id, engagement_id: w.engagement_id, work_date: w.work_date, project: w.project, segment_key: w.segment_key, quantity: args.quantity, day_rate: rate, items: args.items, basis_note: args.basisNote, status: 'CONFIRMED', is_test: w.is_test, created_by: args.me.id }).select('id').single();
  if (error || !data) boom('editWork.insert', error);
  await payrollAudit({ actorId: args.me.id, action: 'daily.work.edit', table: 'payroll_daily_work', subjectId: data!.id as string, requestId: args.requestId, detail: { replaces: args.id } });
  return { id: data!.id as string };
}

/** 확정 / 무효. 확정한 대장에 들어간 줄은 무효로 하지 못한다(대장이 먼저다) */
export async function setWorkStatus(args: { id: string; expectedVersion: number; status: 'CONFIRMED' | 'VOID'; me: Me; requestId?: string }): Promise<void> {
  const c = db();
  const { data: w } = await c.from('payroll_daily_work').select('id, payee_id, version, status').eq('id', args.id).maybeSingle();
  if (!w) throw new ApiError(404, 'not_found');
  await myPayee(w.payee_id as string, args.me);
  if (w.version !== args.expectedVersion) throw new ApiError(409, 'version_conflict');
  if (args.status === 'VOID') {
    // 정정 중인 대장(그 대장을 고치는 새 판이 아직 확정 전)의 근무는 정정 판에서 고칠 수 있게 무효로 할 수 있다 (2026-10-14)
    const { data: open } = await c.from('payroll_runs').select('supersedes_id').eq('run_kind', 'DAILY').neq('status', 'FINALIZED').not('supersedes_id', 'is', null);
    if ((await finalizedWorkIds([w.payee_id as string], new Set((open ?? []).map((r) => r.supersedes_id as string)))).has(w.id as string)) throw new ApiError(409, 'daily_work_in_run');
  }
  const { data, error } = await c.from('payroll_daily_work').update({ status: args.status, version: args.expectedVersion + 1, updated_by: args.me.id }).eq('id', args.id).eq('version', args.expectedVersion).select('id');
  if (error) boom('setWorkStatus', error);
  if (!data?.length) throw new ApiError(409, 'version_conflict');
  await payrollAudit({ actorId: args.me.id, action: args.status === 'VOID' ? 'daily.work.void' : 'daily.work.confirm', table: 'payroll_daily_work', subjectId: args.id, requestId: args.requestId });
}

/** 확정한 일용 대장에 이미 들어간 근무 줄 (두 대장에 들어가지 않게) */
async function finalizedWorkIds(payeeIds: string[], exceptRunIds: ReadonlySet<string> = new Set()): Promise<Set<string>> {
  if (payeeIds.length === 0) return new Set();
  const c = db();
  const { data: sts } = await c.from('payroll_daily_statements').select('run_id, generation_id, snapshot').in('payee_id', payeeIds).eq('state', 'OK').limit(5000);
  const runIds = [...new Set((sts ?? []).map((s) => s.run_id as string))].filter((id) => !exceptRunIds.has(id));
  if (runIds.length === 0) return new Set();
  const { data: runs } = await c.from('payroll_runs').select('id, current_generation_id').in('id', runIds).eq('status', 'FINALIZED');
  const live = new Set((runs ?? []).map((r) => r.current_generation_id as string));
  const out = new Set<string>();
  for (const s of sts ?? []) if (live.has(s.generation_id as string)) for (const id of ((s.snapshot as { workIds?: string[] } | null)?.workIds ?? [])) out.add(id);
  return out;
}

// ── 일용 대장 ──
export async function loadDailyRuns(args: { practice: boolean; testViewer: boolean }): Promise<RunRow[]> {
  // 검사 대장(제목 e2e-)은 읽을 때부터 나눈다 — 뒤에서 거르면 검사 대장이 60개 자리를 차지해 실제 대장이 사라진다 (2026-10-14)
  let q = db().from('payroll_runs').select('id').eq('run_kind', 'DAILY').eq('is_test', args.practice);
  q = args.testViewer ? q.like('title', 'e2e-%') : q.or('title.is.null,title.not.like.e2e-%');
  const { data, error } = await q.order('period_from', { ascending: false }).order('sequence', { ascending: false }).limit(60);
  if (error) boom('loadDailyRuns', error);
  const runs = (await Promise.all((data ?? []).map((r) => loadRun(r.id as string)))).filter((r): r is RunRow => !!r);
  return runs.filter((r) => !!r.title?.startsWith('e2e-') === args.testViewer);
}

/** 일용 대장 만들기 — 근무월 · 지급일. 한 달에 여러 번 만들 수 있다(차수) */
export async function createDailyRun(args: { month: string; payDate: string; practice: boolean; me: Me; requestId?: string }): Promise<{ id: string }> {
  const c = db();
  const from = `${args.month}-01`;
  const [y, m] = args.month.split('-').map(Number);
  const to = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const { data: prev } = await c.from('payroll_runs').select('sequence').eq('run_kind', 'DAILY').eq('period_from', from).eq('period_to', to).eq('is_test', args.practice).order('sequence', { ascending: false }).limit(1);
  const sequence = ((prev?.[0]?.sequence as number | undefined) ?? 0) + 1;
  // 검사 계정이 만든 대장은 제목으로 구분해 실제 목록에서 숨긴다(정규 대장과 같은 규칙)
  const { data, error } = await c.from('payroll_runs').insert({ run_kind: 'DAILY', title: isTestNo(args.me.employeeNo) ? 'e2e-일용' : null, period_from: from, period_to: to, pay_date: args.payDate, sequence, is_test: args.practice, created_by: args.me.id }).select('id').single();
  if (error?.code === '23505') throw new ApiError(409, 'payroll_run_exists');
  if (error || !data) boom('createDailyRun', error);
  await payrollAudit({ actorId: args.me.id, action: 'daily.run.create', table: 'payroll_runs', subjectId: data!.id as string, runId: data!.id as string, requestId: args.requestId, detail: { month: args.month, sequence } });
  return { id: data!.id as string };
}

/** 같은 일용 대장(근무월 · 차수 · 연습/운영)의 판 전부 — 판 번호 순 */
export async function loadDailyRevisions(run: RunRow): Promise<RunRow[]> {
  const { data, error } = await db().from('payroll_runs').select('id').eq('run_kind', 'DAILY').eq('period_from', run.periodFrom).eq('period_to', run.periodTo).eq('sequence', run.sequence).eq('is_test', run.isTest).order('revision');
  if (error) boom('loadDailyRevisions', error);
  return (await Promise.all((data ?? []).map((r) => loadRun(r.id as string)))).filter((r): r is RunRow => !!r);
}

/**
 * 일용 대장 정정 시작 (2026-10-14, 미구현 목록 12번) — 확정한 대장은 그대로 두고 판 번호를 올린 새 초안을 만든다(사유 필수).
 * 정정 판에서 근무 줄을 고치거나(무효 · 새로 넣기) 그대로 다시 계산 → 검토 → 확정. 인건비 현황은 가장 새 확정 판만 센다.
 * 가장 새 판에서만, 진행 중인 정정이 없을 때만.
 */
export async function startDailyCorrection(args: { id: string; reason: string; me: Me; requestId?: string }): Promise<{ id: string }> {
  const run = await loadRun(args.id);
  if (!run || run.kind !== 'DAILY' || !!run.title?.startsWith('e2e-') !== isTestNo(args.me.employeeNo)) throw new ApiError(404, 'not_found');
  if (run.status !== 'FINALIZED') throw new ApiError(409, 'payroll_not_finalized');
  if ((await loadDailyRevisions(run)).some((r) => r.revision > run.revision)) throw new ApiError(409, 'payroll_correction_exists');
  const { data, error } = await db().from('payroll_runs').insert({ run_kind: 'DAILY', title: run.title, period_from: run.periodFrom, period_to: run.periodTo, pay_date: run.payDate, sequence: run.sequence, is_test: run.isTest, revision: run.revision + 1, supersedes_id: run.id, correction_reason: args.reason, created_by: args.me.id }).select('id').single();
  if (error?.code === '23505') throw new ApiError(409, 'payroll_correction_exists');
  if (error || !data) boom('startDailyCorrection', error);
  await payrollAudit({ actorId: args.me.id, action: 'daily.run.correct', table: 'payroll_runs', subjectId: data!.id as string, runId: data!.id as string, requestId: args.requestId, detail: { from: run.id, revision: run.revision + 1 } });
  return { id: data!.id as string };
}

const mustRun = async (id: string, expectedVersion: number, me: Me): Promise<RunRow> => {
  const run = await loadRun(id);
  if (!run || run.kind !== 'DAILY' || !!run.title?.startsWith('e2e-') !== isTestNo(me.employeeNo)) throw new ApiError(404, 'not_found');
  if (run.status === 'FINALIZED') throw new ApiError(409, 'payroll_finalized');
  if (run.version !== expectedVersion) throw new ApiError(409, 'payroll_run_conflict');
  return run;
};
const setRun = async (run: RunRow, patch: Row) => {
  const { data, error } = await db().from('payroll_runs').update({ ...patch, version: run.version + 1 }).eq('id', run.id).eq('version', run.version).select('id');
  if (error) boom('daily.setRun', error);
  if (!data?.length) throw new ApiError(409, 'payroll_run_conflict');
};

type Built = { payee: Payee; works: (WorkRow & { basis: PayBasis })[]; terms: DailyTerms | null; adjustments: DailyAdjustment[]; result: DailyResult }[];
/** 최고관리자의 조정 (대장 · 대상자마다) — 자동 항목(보험 · 세금)의 금액을 바꾸거나 지급 · 공제 항목을 더한다 */
export type AdjustmentRow = DailyAdjustment & { id: string; payeeId: string; reason: string; createdBy: string; createdAt: string };
export async function loadAdjustments(runId: string): Promise<AdjustmentRow[]> {
  const { data, error } = await db().from('payroll_daily_adjustments').select('*').eq('run_id', runId).eq('active', true).order('created_at');
  if (error) boom('loadAdjustments', error);
  return ((data ?? []) as Row[]).map((r) => ({ id: r.id as string, payeeId: r.payee_id as string, code: r.code as string, label: r.label as string, kind: r.kind as DailyAdjustment['kind'], amount: Number(r.amount), reason: r.reason as string, createdBy: r.created_by as string, createdAt: r.created_at as string }));
}
/** 조정 넣기 — 최고관리자만. 확정 전 대장에서만(확정한 대장은 정정 판에서). 같은 항목은 하나만 살아 있다(새로 넣으면 앞의 것을 끈다). 넣은 뒤 다시 계산해야 반영된다 */
export async function addAdjustment(args: { runId: string; payeeId: string; code: string; label: string; kind: 'PAYMENT' | 'DEDUCTION'; amount: number; reason: string; me: Me; requestId?: string }): Promise<{ id: string }> {
  if (!args.me.top) throw new ApiError(403, 'top_only');
  const run = await loadRun(args.runId);
  if (!run || run.kind !== 'DAILY' || !!run.title?.startsWith('e2e-') !== isTestNo(args.me.employeeNo)) throw new ApiError(404, 'not_found');
  if (run.status === 'FINALIZED') throw new ApiError(409, 'payroll_finalized');
  await myPayee(args.payeeId, args.me);
  const c = db();
  const off = await c.from('payroll_daily_adjustments').update({ active: false, updated_by: args.me.id }).eq('run_id', run.id).eq('payee_id', args.payeeId).eq('code', args.code).eq('active', true);
  if (off.error) boom('addAdjustment.off', off.error);
  const { data, error } = await c.from('payroll_daily_adjustments').insert({ run_id: run.id, payee_id: args.payeeId, code: args.code, label: args.label, kind: args.kind, amount: args.amount, reason: args.reason, created_by: args.me.id }).select('id').single();
  if (error || !data) boom('addAdjustment', error);
  await payrollAudit({ actorId: args.me.id, action: 'daily.adjust.add', table: 'payroll_daily_adjustments', subjectId: data!.id as string, runId: run.id, requestId: args.requestId, detail: { code: args.code, amount: args.amount } });
  return { id: data!.id as string };
}
export async function removeAdjustment(args: { id: string; me: Me; requestId?: string }): Promise<void> {
  if (!args.me.top) throw new ApiError(403, 'top_only');
  const c = db();
  const { data: a } = await c.from('payroll_daily_adjustments').select('id, run_id, payee_id').eq('id', args.id).eq('active', true).maybeSingle();
  if (!a) throw new ApiError(404, 'not_found');
  const run = await loadRun(a.run_id as string);
  if (!run || run.status === 'FINALIZED') throw new ApiError(409, 'payroll_finalized');
  await myPayee(a.payee_id as string, args.me);
  const { error } = await c.from('payroll_daily_adjustments').update({ active: false, updated_by: args.me.id }).eq('id', args.id);
  if (error) boom('removeAdjustment', error);
  await payrollAudit({ actorId: args.me.id, action: 'daily.adjust.remove', table: 'payroll_daily_adjustments', subjectId: args.id, runId: run.id, requestId: args.requestId });
}

/** 그 달의 근무 줄(무효 · 다른 확정 대장에 든 것 제외)을 대상자마다 묶어 계산한다 — 보험 요율 · 끝수는 정규 급여와 같은 판(그 달 마지막 날) */
async function build(run: RunRow, me: Me): Promise<{ built: Built; inputHash: string }> {
  const { payees, engagements } = await loadPayees(isTestNo(me.employeeNo));
  const all = await loadWork({ month: run.periodFrom.slice(0, 7), practice: run.isTest, payeeIds: payees.map((p) => p.id) });
  const lastDay = new Date(Date.parse(`${run.periodTo}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  const [basis, adjustments] = await Promise.all([loadCalcBasis(lastDay), loadAdjustments(run.id)]);
  // 같은 대장의 판들(원본 · 정정 판)은 서로의 근무를 「이미 쓴 것」으로 보지 않는다 — 정정 판이 원본의 근무를 다시 계산한다
  const revs = await loadDailyRevisions(run);
  const family = new Set(revs.map((r) => r.id));
  const used = await finalizedWorkIds(payees.map((p) => p.id), family);
  // 정정 판은 원본(앞 판들)에 들었던 근무 + 정정을 시작한 뒤 새로 넣은 근무만 다시 계산한다 — 다른 차수 대장에 들어갈 근무를 끌어오지 않는다
  let scopeIds: Set<string> | null = null;
  if (run.supersedesId) {
    const gens = revs.filter((r) => r.revision < run.revision && r.generationId).map((r) => r.generationId as string);
    const { data: prevSts } = gens.length ? await db().from('payroll_daily_statements').select('snapshot').in('generation_id', gens) : { data: [] as { snapshot: unknown }[] };
    scopeIds = new Set((prevSts ?? []).flatMap((x) => ((x.snapshot as { workIds?: string[] } | null)?.workIds ?? [])));
  }
  const inScope = (w: WorkRow) => !scopeIds || scopeIds.has(w.id) || w.createdAt >= run.createdAt;
  const built: Built = [];
  for (const p of payees) {
    const works = all.filter((w) => w.payeeId === p.id && w.status !== 'VOID' && !used.has(w.id) && inScope(w)).map((w) => ({ ...w, basis: engagements.find((e) => e.id === w.engagementId)?.payBasis ?? ('DAY' as PayBasis) }));
    if (works.length === 0) continue;
    // 적용 상태는 근무 줄이 가리키는 고용 기간에서. 줄마다 다르면: 하나라도 「모름」이면 막고, 「적용」이 하나라도 있으면 적용, 모두 「제외」면 제외, 그 밖에는 「자동」
    const es = [...new Set(works.map((w) => w.engagementId))].map((id) => engagements.find((e) => e.id === id) ?? null);
    const pick = <K extends 'ei' | 'np' | 'hi'>(k: K): DailyTerms[K] => (es.some((e) => !e || e[k] === 'UNKNOWN') ? 'UNKNOWN' : es.some((e) => e![k] === 'YES') ? 'YES' : es.every((e) => e![k] === 'NO') ? 'NO' : 'AUTO') as DailyTerms[K];
    const taxes = new Set(es.map((e) => e?.taxState ?? 'UNKNOWN'));
    const terms: DailyTerms = { taxState: taxes.size === 1 ? [...taxes][0] : 'UNKNOWN', ei: pick('ei'), np: pick('np'), hi: pick('hi') }; // 세금 적용이 줄마다 다르면 한 명세로 계산하지 않는다
    const adj = adjustments.filter((a) => a.payeeId === p.id).map((a) => ({ code: a.code, label: a.label, kind: a.kind, amount: a.amount }));
    const result = calcDaily(works, terms, { person: { workerKind: p.workerKind, visaType: p.visaType, nationality: p.nationality }, reference: basis.reference, rounding: basis.policy.rounding.insurance, monthly: p.monthlyItems, adjustments: adj });
    built.push({ payee: p, works, terms, adjustments: adj, result });
  }
  const inputHash = sha({ rule: DAILY_RULE, ins: DAILY_INSURANCE_RULE, bundle: basis.bundle, rows: built.map((b) => ({ p: b.payee.id, k: [b.payee.workerKind, b.payee.visaType, b.payee.monthlyItems], t: b.terms, a: b.adjustments, w: b.works.map((w) => [w.id, w.version, w.status, w.quantity, w.dayRate, w.items, w.basis]) })) });
  return { built, inputHash };
}

export async function calculateDaily(args: { id: string; expectedVersion: number; me: Me; requestId?: string }): Promise<{ ok: number; blocked: number }> {
  const c = db();
  const run = await mustRun(args.id, args.expectedVersion, args.me);
  const { built, inputHash } = await build(run, args.me);
  if (built.length === 0) throw new ApiError(409, 'daily_no_work');
  const { data: last } = await c.from('payroll_calculation_generations').select('seq').eq('run_id', run.id).order('seq', { ascending: false }).limit(1);
  const { data: gen, error: e1 } = await c.from('payroll_calculation_generations').insert({ run_id: run.id, seq: ((last?.[0]?.seq as number | undefined) ?? 0) + 1, input_hash: inputHash, engine_version: DAILY_RULE, created_by: args.me.id }).select('id').single();
  if (e1 || !gen) boom('calculateDaily.gen', e1);
  const rows = built.map(({ payee, works, terms, result: r }) => {
    const snapshot = { workIds: works.map((w) => w.id), workVersions: works.map((w) => ({ id: w.id, version: w.version })), terms, person: { workerKind: payee.workerKind, nationality: payee.nationality, visaType: payee.visaType }, days: r.state === 'OK' ? r.days : [], warnings: r.warnings, rule: r.state === 'OK' ? r.rule : DAILY_RULE, ...(r.state === 'OK' ? { manDays: r.manDays, hours: r.hours, insurance: r.insurance, applied: r.applied, deduction: r.deduction } : {}) };
    return {
      generation_id: gen!.id, run_id: run.id, payee_id: payee.id, work_month: run.periodFrom, state: r.state, blockers: r.blockers.map((code) => ({ code })), snapshot,
      ...(r.state === 'OK' ? { work_days: r.workDays, gross_total: r.gross, taxable_total: r.taxable, nontax_total: r.nontax, income_tax: r.incomeTax, local_tax: r.localTax, other_deduction: r.otherDeduction, net_total: r.net, lines: r.lines, insurance_total: r.insuranceTotal } : {}),
      result_hash: sha({ payee: payee.id, r }),
    };
  });
  const ins = await c.from('payroll_daily_statements').insert(rows);
  const ok = built.filter((b) => b.result.state === 'OK').length;
  if (ins.error) {
    await c.from('payroll_calculation_generations').update({ state: 'FAILED', error_code: ins.error.code ?? 'insert', ended_at: new Date().toISOString() }).eq('id', gen!.id);
    boom('calculateDaily.statements', ins.error);
  }
  const sum = (k: 'gross' | 'net' | 'deduction') => built.reduce((a, b) => a + (b.result.state === 'OK' ? b.result[k] : 0), 0);
  const fin = await c.from('payroll_calculation_generations').update({ state: 'SUCCEEDED', result_hash: sha(rows.map((r) => r.result_hash)), summary: { ok, blocked: built.length - ok }, ended_at: new Date().toISOString() }).eq('id', gen!.id);
  if (fin.error) boom('calculateDaily.done', fin.error);
  await setRun(run, { status: 'CALCULATED', current_generation_id: gen!.id, totals: { members: built.length, ok, blocked: built.length - ok, pay: String(sum('gross')), deduction: String(sum('deduction')), net: String(sum('net')) } });
  await payrollAudit({ actorId: args.me.id, action: 'daily.run.calculate', table: 'payroll_runs', subjectId: run.id, runId: run.id, requestId: args.requestId, detail: { ok, blocked: built.length - ok } });
  return { ok, blocked: built.length - ok };
}

/** 검토 · 확정 전에: 계산돼 있고, 막힌 사람이 없고, 계산한 뒤 근무 줄이 바뀌지 않았어야 한다 */
async function ready(run: RunRow, me: Me): Promise<void> {
  if (!run.generationId) throw new ApiError(409, 'payroll_not_calculated');
  const c = db();
  const [{ count }, { data: gen }, { inputHash }] = await Promise.all([
    c.from('payroll_daily_statements').select('id', { count: 'exact', head: true }).eq('generation_id', run.generationId).eq('state', 'BLOCKED'),
    c.from('payroll_calculation_generations').select('input_hash').eq('id', run.generationId).maybeSingle(),
    build(run, me),
  ]);
  if ((count ?? 0) > 0) throw new ApiError(409, 'payroll_has_blocked');
  if (!gen || gen.input_hash !== inputHash) throw new ApiError(409, 'payroll_stale');
}
export async function reviewDaily(args: { id: string; expectedVersion: number; me: Me; requestId?: string }): Promise<void> {
  const run = await mustRun(args.id, args.expectedVersion, args.me);
  if (run.status !== 'CALCULATED') throw new ApiError(409, 'payroll_wrong_status');
  await ready(run, args.me);
  await setRun(run, { status: 'REVIEWED', reviewed_by: args.me.id, reviewed_at: new Date().toISOString() });
  await payrollAudit({ actorId: args.me.id, action: 'daily.run.review', table: 'payroll_runs', subjectId: run.id, runId: run.id, requestId: args.requestId });
}
export async function finalizeDaily(args: { id: string; expectedVersion: number; me: Me; requestId?: string }): Promise<void> {
  const run = await mustRun(args.id, args.expectedVersion, args.me);
  if (run.status !== 'REVIEWED') throw new ApiError(409, 'payroll_wrong_status');
  await ready(run, args.me);
  await setRun(run, { status: 'FINALIZED', finalized_by: args.me.id, finalized_at: new Date().toISOString() });
  await payrollAudit({ actorId: args.me.id, action: 'daily.run.finalize', table: 'payroll_runs', subjectId: run.id, runId: run.id, requestId: args.requestId });
}

export type DailyLine = { payeeId: string; name: string; internalNo: string; workerKind: WorkerKind; visaType: string | null; nationality: string | null; state: 'OK' | 'BLOCKED'; blockers: string[]; warnings: string[]; workDays: number | null; manDays: number | null; hours: number | null; gross: number | null; taxable: number | null; nontax: number | null; incomeTax: number | null; localTax: number | null; insurance: { np: number; hi: number; ltc: number; ei: number } | null; insuranceTotal: number | null; otherDeduction: number | null; deduction: number | null; net: number | null; lines: DailyLineRow[]; days: { workDate: string; gross: number; incomeTax: number; localTax: number; deduction: number }[] };
export async function loadDailyBoard(id: string, me: Me): Promise<{ run: RunRow; lines: DailyLine[]; stale: boolean } | null> {
  const run = await loadRun(id);
  if (!run || run.kind !== 'DAILY' || !!run.title?.startsWith('e2e-') !== isTestNo(me.employeeNo)) return null;
  if (!run.generationId) return { run, lines: [], stale: false };
  const c = db();
  const [{ data: sts }, { data: payees }, { data: gen }] = await Promise.all([
    c.from('payroll_daily_statements').select('*').eq('generation_id', run.generationId),
    c.from('payroll_payees').select('id, name, internal_no, worker_kind, visa_type, nationality'),
    c.from('payroll_calculation_generations').select('input_hash').eq('id', run.generationId).maybeSingle(),
  ]);
  const who = new Map((payees ?? []).map((p) => [p.id as string, p]));
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  const lines = ((sts ?? []) as Row[]).map((s): DailyLine => {
    const snap = (s.snapshot ?? {}) as { days?: DailyLine['days']; warnings?: string[]; manDays?: number; hours?: number; insurance?: DailyLine['insurance']; deduction?: number };
    const p = who.get(s.payee_id as string);
    const lines = (Array.isArray(s.lines) ? s.lines : []) as DailyLineRow[];
    // 예전 명세(항목별 내역이 없던 것)는 세금 · 그 밖의 공제만으로 공제 합계를 낸다
    const deduction = typeof snap.deduction === 'number' ? snap.deduction : s.state === 'OK' ? (n(s.income_tax) ?? 0) + (n(s.local_tax) ?? 0) + (n(s.other_deduction) ?? 0) : null;
    return {
      payeeId: s.payee_id as string, name: (p?.name as string) ?? '', internalNo: (p?.internal_no as string) ?? '', workerKind: ((p?.worker_kind as WorkerKind | undefined) ?? 'GENERAL'), visaType: (p?.visa_type as string | null) ?? null, nationality: (p?.nationality as string | null) ?? null,
      state: s.state as DailyLine['state'], blockers: ((s.blockers ?? []) as { code: string }[]).map((b) => b.code), warnings: snap.warnings ?? [],
      workDays: n(s.work_days), manDays: snap.manDays ?? null, hours: snap.hours ?? null, gross: n(s.gross_total), taxable: n(s.taxable_total), nontax: n(s.nontax_total), incomeTax: n(s.income_tax), localTax: n(s.local_tax),
      insurance: snap.insurance ?? null, insuranceTotal: n(s.insurance_total), otherDeduction: n(s.other_deduction), deduction, net: n(s.net_total), lines, days: snap.days ?? [],
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
  // 확정한 대장은 그대로다. 그 전에는 계산한 뒤 근무 줄이 바뀌었는지 본다
  const stale = run.status === 'FINALIZED' ? false : (await build(run, me)).inputHash !== gen?.input_hash;
  return { run, lines, stale };
}

/** 내 일용 지급명세 (직원 본인, 2026-10-20 미구현 #12) — 대상자가 내 계정에 이어져 있고, 확정한 대장 · 정정되지 않은 판만 */
export async function loadMyDaily(me: Me, practice: boolean): Promise<{ run: RunRow; line: DailyLine }[]> {
  const c = db();
  const { data: payees } = await c.from('payroll_payees').select('id').eq('profile_id', me.id).eq('is_test', practice);
  const ids = (payees ?? []).map((p) => p.id as string);
  if (!ids.length) return [];
  const { data: sts } = await c.from('payroll_daily_statements').select('run_id, generation_id, payee_id').in('payee_id', ids).eq('state', 'OK').limit(500);
  const runIds = [...new Set((sts ?? []).map((s) => s.run_id as string))];
  if (!runIds.length) return [];
  const { data: newer } = await c.from('payroll_runs').select('supersedes_id').in('supersedes_id', runIds).eq('status', 'FINALIZED');
  const replaced = new Set((newer ?? []).map((r) => r.supersedes_id as string));
  const out: { run: RunRow; line: DailyLine }[] = [];
  for (const runId of runIds.filter((id) => !replaced.has(id))) {
    const board = await loadDailyBoard(runId, me);
    if (!board || board.run.status !== 'FINALIZED') continue;
    for (const line of board.lines) if (ids.includes(line.payeeId) && line.state === 'OK' && (sts ?? []).some((s) => s.run_id === runId && s.payee_id === line.payeeId && s.generation_id === board.run.generationId)) out.push({ run: board.run, line });
  }
  return out.sort((a, b) => b.run.periodFrom.localeCompare(a.run.periodFrom) || b.run.sequence - a.run.sequence);
}
