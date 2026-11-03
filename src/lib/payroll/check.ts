// 급여 점검 (결정 급여-68, 2026-11-03 의뢰인) — 서버 전용.
// 기준은 이번 달 근태 기록: 급여대장과 같은 엔진으로 미리 계산하고(previewMonth), 계산 세부에서 이상한 점을 점검 항목으로 뽑는다.
//   must_fix: 고쳐야만 사라진다(근태 마감 안 됨 · 계산이 막힘) — 「이대로 반영」을 고를 수 없다
//   review  : 근거를 보고 정산에 어떻게 반영할지 관리자가 고른다(이대로 반영 · 급여대장에서 이번 달만 조정) — 결정은 payroll_check_reviews에 남는다
// 지난달과 다른 것은 이슈가 아니다 — 비교 · 교차 분석(compareMonth)은 참고용으로 따로 낸다.
import 'server-only';
import { OFFICE } from '@/config/office';
import { createAdminClient } from '@/lib/supabase/admin';
import { canonicalItemCode } from './engine/reserved-items';
import { previewMonth } from './run-data';

export type CheckLevel = 'must_fix' | 'review';
export type CheckItem = {
  key: string; // 직원 안에서 항목을 가리키는 열쇠 — 결정이 이 열쇠에 붙는다
  code: string; // 화면 문구 · 근거 문구의 열쇠
  level: CheckLevel;
  detail?: string; // 엔진이 남긴 자세한 값(날짜 · 금액 등)
  values?: Record<string, string | number>;
  dates?: string[]; // 근거가 되는 날 — 누르면 그날 기록으로
  fix: 'records' | 'closing' | 'staff' | 'inbox' | 'leave' | null; // 고치러 갈 곳
};
export type PersonCheck = {
  employeeId: string; name: string; group: string | null; groupId: string | null;
  state: 'OK' | 'BLOCKED';
  pay: number | null; deduction: number | null; net: number | null;
  overtimeHours: number; // 인정한 연장 + 휴일(시간)
  parts: Parts | null; // 비교용 칸별 금액
  items: CheckItem[];
};
export type Parts = { base: number; overtime: number; allowance: number; cut: number; deduction: number; net: number };
export type Decision = { itemKey: string; decision: 'as_is' | 'adjust'; note: string | null; by: string; at: string };

const BASE = new Set(['BASE', 'PAID_LEAVE', 'WEEKLY_REST', 'PAID_HOLIDAY']);
const OT = new Set(['OVERTIME', 'NIGHT', 'HOLIDAY', 'HOLIDAY_OVER8']);
const CUT = new Set(['UNPAID_LEAVE_CUT', 'LATENESS_CUT']);
/** 줄 → 칸별 합 (지급은 기본 · 연장 · 수당, 깎는 것은 지각 · 무급, 그 밖의 공제는 세금 · 보험 등) */
export function partsOf(lines: { code: string; kind: string; amount: number }[], net: number | null): Parts {
  const p: Parts = { base: 0, overtime: 0, allowance: 0, cut: 0, deduction: 0, net: net ?? 0 };
  for (const l of lines) {
    const c = canonicalItemCode(l.code);
    if (CUT.has(c)) p.cut += Math.abs(l.amount);
    else if (l.kind === 'PAYMENT') {
      if (BASE.has(c)) p.base += l.amount;
      else if (OT.has(c)) p.overtime += l.amount;
      else p.allowance += l.amount;
    } else if (l.kind === 'DEDUCTION') p.deduction += l.amount;
  }
  return p;
}

// 경고 중 사람마다 따로 점검할 것 — 그 밖(가족 수 신고 전 · 기준 임시 등)은 화면 위 안내 한 줄로만
const REVIEW_WARNINGS = new Set(['perfect_attendance_cut', 'weekly_rest_with_absence', 'mid_join_hourly', 'below_minimum_wage', 'overtime_unreviewed', 'included_hours_exceeded', 'overtime_comp_leave', 'employer_notice_missing']);
const GLOBAL_WARNINGS = new Set(['basis_unverified', 'family_unreported']);
/** 연장이 많다고 볼 기준 — 같은 지점 평균의 1.5배 이상이고 최소 이 시간 이상일 때만 점검 */
export const OVERTIME_REVIEW_HOURS = 20;
const OVERTIME_GROUP_FACTOR = 1.5;
/** 계약 만료를 미리 알리는 날 수 */
export const CONTRACT_NOTICE_DAYS = 30;

export async function buildPayCheck(ym: string, practice: boolean): Promise<{ people: PersonCheck[]; globalNotes: { code: string; n: number }[]; closed: number; total: number }> {
  const from = `${ym}-01`;
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const db = createAdminClient();
  // 근태 마감 화면 자료(loadCloseBoard)는 한 달 근태를 다시 계산하고 연장 맞추기까지 해서 무겁다 — 여기서는 마감 여부와 관리자가 넣은 휴가만 가볍게 읽는다 (2026-11-03 속도)
  const to = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const [preview, { data: closes }, { data: adminLv }, { data: leaveTypes }, { data: people }, { data: groups }, { data: cons }, { data: terms }] = await Promise.all([
    previewMonth(ym, practice),
    db.from('attendance_closes').select('employee_id').eq('state', 'CLOSED').eq('is_test', practice).eq('period_from', from).eq('period_to', to),
    db.from('leave_requests').select('employee_id, requested_by, type_code, start_date').eq('status', 'approved').eq('is_test', practice).lte('start_date', last).gte('end_date', from),
    db.from('leave_types').select('code, is_paid, deducts_balance'),
    db.from('profiles').select('id, name, group_id, employee_no'),
    db.from('org_groups').select('id, name'),
    db.from('payroll_contract_versions').select('employee_id, valid_from').eq('status', 'active').gt('valid_from', from).lte('valid_from', last),
    db.from('payroll_contract_terms').select('employee_id, ends_on').eq('active', true),
  ]);
  const person = new Map((people ?? []).map((p) => [p.id as string, p]));
  const groupName = new Map((groups ?? []).map((g) => [g.id as string, g.name as string]));
  const closedSet = new Set((closes ?? []).map((c) => c.employee_id as string));
  const typeOf = new Map((leaveTypes ?? []).map((lt) => [lt.code as string, lt]));
  // 관리자가 직접 넣은 무급 · 연차 차감 휴가 (급여-67과 같은 기준)
  const adminLeavesOf = (id: string) => (adminLv ?? []).filter((l) => l.employee_id === id && l.requested_by && l.requested_by !== id && (() => { const lt = typeOf.get(l.type_code as string); return !!lt && (!lt.is_paid || lt.deducts_balance); })()).map((l) => ({ date: l.start_date as string }));
  const otHours = (snap: Record<string, unknown>) => {
    const a = (snap.attendance as { approved?: { overtime?: number; holidayWithin8?: number; holidayOver8?: number } } | null)?.approved;
    return a ? Math.round((((a.overtime ?? 0) + (a.holidayWithin8 ?? 0) + (a.holidayOver8 ?? 0)) / 60) * 10) / 10 : 0;
  };
  // 같은 지점 평균 연장(시간) — 교차 점검
  const byGroup = new Map<string, number[]>();
  for (const r of preview) {
    const g = (person.get(r.employeeId)?.group_id as string | null) ?? '';
    byGroup.set(g, [...(byGroup.get(g) ?? []), otHours(r.snapshot)]);
  }
  const avg = (g: string) => {
    const xs = byGroup.get(g) ?? [];
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  };
  const globals = new Map<string, number>();
  const out: PersonCheck[] = [];
  for (const r of preview) {
    const p = person.get(r.employeeId);
    if (!p || (p.employee_no as string | null) === OFFICE.ownerEmployeeNo) continue;
    const items: CheckItem[] = [];
    const gid = (p.group_id as string | null) ?? null;
    // ⑦ 근태 마감 · 계산이 막힌 것 — 고쳐야만 사라진다
    const isClosed = closedSet.has(r.employeeId);
    if (!isClosed) items.push({ key: 'not_closed', code: 'not_closed', level: 'must_fix', fix: 'closing' });
    if (r.result.state === 'BLOCKED') {
      // 같은 사유가 여러 번(보험마다 등) 나오면 한 줄로 — 자세한 값은 이어 붙인다
      const byCode = new Map<string, string[]>();
      for (const b of r.result.blockers) {
        if (b.code === 'no_attendance' && !isClosed) continue; // 위 「근태 마감 안 됨」과 같은 것
        byCode.set(b.code, [...(byCode.get(b.code) ?? []), ...(b.detail ? [b.detail] : [])]);
      }
      for (const [code, details] of byCode) {
        const toStaff = /contract|tax|item|wage|insurance|hours|divisor|relief|family/.test(code);
        items.push({ key: `blocked:${code}`, code: 'blocked', level: 'must_fix', detail: code, values: { what: code, detail: [...new Set(details)].join(', ') }, fix: toStaff ? 'staff' : 'records' });
      }
    }
    // ① 무급 · 지각 공제 — 관리자가 넣은 무급 · 연차 차감 휴가 포함 (급여-67)
    const att = r.snapshot.attendance as { unpaidLeaveDays?: number; lateMinutes?: number; pendingMinutes?: number } | null;
    const lines = r.result.state === 'OK' ? r.result.lines : [];
    const cutAmount = lines.filter((l) => CUT.has(canonicalItemCode(l.code))).reduce((a, l) => a + Math.abs(l.amount), 0);
    const adminLeaves = adminLeavesOf(r.employeeId);
    if ((att?.unpaidLeaveDays ?? 0) > 0 || cutAmount > 0 || adminLeaves.length > 0) {
      items.push({ key: 'unpaid', code: 'unpaid', level: 'review', values: { days: Math.round((att?.unpaidLeaveDays ?? 0) * 1000) / 1000, amount: cutAmount, admin: adminLeaves.length }, dates: [...new Set(adminLeaves.map((a) => a.date))], fix: 'leave' });
    }
    // ② 연장 · 휴일근로가 많다 — 기준 시간 이상이거나 같은 지점 평균보다 크게 많다
    const ot = otHours(r.snapshot);
    const gAvg = avg(gid ?? '');
    // 연장이 많은 게 평소인 회사라 절대 시간으로는 띄우지 않는다 — 같은 지점 평균보다 크게 많을 때만 (2026-11-03: 달마다 다른 것은 정상)
    if (gAvg >= 1 && ot >= gAvg * OVERTIME_GROUP_FACTOR && ot >= OVERTIME_REVIEW_HOURS) {
      items.push({ key: 'overtime_high', code: 'overtime_high', level: 'review', values: { hours: ot, avg: Math.round(gAvg * 10) / 10 }, fix: 'records' });
    }
    // ③~⑥ 엔진이 남긴 경고(만근수당 빠짐 · 결근 주 주휴 · 중간 입사 · 최저임금 · 확인 안 된 연장 등)
    const seenWarn = new Set<string>();
    for (const w of r.result.warnings) {
      if (GLOBAL_WARNINGS.has(w.code)) { if (!seenWarn.has(w.code)) globals.set(w.code, (globals.get(w.code) ?? 0) + 1); seenWarn.add(w.code); continue; }
      if (!REVIEW_WARNINGS.has(w.code) || seenWarn.has(w.code)) continue;
      seenWarn.add(w.code);
      items.push({ key: `warn:${w.code}`, code: 'warning', level: 'review', detail: w.code, values: { what: w.code, detail: w.detail ?? '' }, dates: w.detail && /\d{4}-\d{2}-\d{2}/.test(w.detail) ? w.detail.match(/\d{4}-\d{2}-\d{2}/g)! : undefined, fix: w.code === 'overtime_unreviewed' ? 'inbox' : w.code === 'below_minimum_wage' ? 'staff' : 'records' });
    }
    // ⑥ 이번 달에 계약이 바뀜 — 바뀐 날부터 새 계약으로 계산한다
    const changed = (cons ?? []).filter((c) => c.employee_id === r.employeeId).map((c) => c.valid_from as string);
    if (changed.length) items.push({ key: 'contract_changed', code: 'contract_changed', level: 'review', values: { from: changed.sort()[0] }, fix: 'staff' });
    // ⑧ 계약 만료 점검 — 만료 30일 전부터 · 지났으면
    const term = (terms ?? []).find((t) => t.employee_id === r.employeeId)?.ends_on as string | undefined;
    if (term) {
      const left = Math.round((Date.parse(`${term}T00:00:00Z`) - Date.parse(`${last}T00:00:00Z`)) / 86_400_000);
      if (left <= CONTRACT_NOTICE_DAYS) items.push({ key: `contract_term:${term}`, code: left < 0 ? 'contract_expired' : 'contract_expiring', level: 'review', values: { date: term, days: left }, fix: 'staff' });
    }
    out.push({
      employeeId: r.employeeId, name: p.name as string, group: gid ? groupName.get(gid) ?? null : null, groupId: gid,
      state: r.result.state, pay: r.result.totals?.pay ?? null, deduction: r.result.totals?.deduction ?? null, net: r.result.totals?.net ?? null,
      overtimeHours: ot, parts: r.result.state === 'OK' ? partsOf(r.result.lines, r.result.totals.net) : null, items,
    });
  }
  out.sort((a, b) => Number(b.items.some((i) => i.level === 'must_fix')) - Number(a.items.some((i) => i.level === 'must_fix')) || b.items.length - a.items.length || a.name.localeCompare(b.name));
  return { people: out, globalNotes: [...globals].map(([code, n]) => ({ code, n })), closed: out.filter((p) => closedSet.has(p.employeeId)).length, total: out.length };
}

/** 그 달 점검 결정 (직원 → 항목 → 결정) */
export async function loadDecisions(ym: string, practice: boolean): Promise<Map<string, Map<string, Decision>>> {
  const { data, error } = await createAdminClient().from('payroll_check_reviews').select('employee_id, item_key, decision, note, decided_by, created_at').eq('month', ym).eq('is_test', practice).eq('active', true);
  if (error) throw new Error(`loadDecisions: ${error.code}`);
  const out = new Map<string, Map<string, Decision>>();
  for (const r of data ?? []) {
    const m = out.get(r.employee_id as string) ?? new Map<string, Decision>();
    m.set(r.item_key as string, { itemKey: r.item_key as string, decision: r.decision as Decision['decision'], note: r.note as string | null, by: r.decided_by as string, at: r.created_at as string });
    out.set(r.employee_id as string, m);
  }
  return out;
}

/** 비교용 — 지난달 확정한 정규 급여대장의 사람별 칸 (없으면 빈 Map) */
export async function lastMonthParts(ym: string, practice: boolean): Promise<{ month: string; parts: Map<string, Parts> }> {
  const [y, m] = ym.split('-').map(Number);
  const prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
  const db = createAdminClient();
  const { data: runs } = await db.from('payroll_runs').select('id, current_generation_id, revision').eq('run_kind', 'REGULAR').eq('period_from', `${prev}-01`).eq('status', 'FINALIZED').eq('is_test', practice).order('revision', { ascending: false }).limit(1);
  const gen = runs?.[0]?.current_generation_id as string | undefined;
  const parts = new Map<string, Parts>();
  if (!gen) return { month: prev, parts };
  const { data: sts } = await db.from('payroll_statements').select('id, employee_id, net_total').eq('generation_id', gen).eq('state', 'OK');
  const ids = (sts ?? []).map((s) => s.id as string);
  const { data: items } = ids.length ? await db.from('payroll_statement_items').select('statement_id, item_code, kind, amount').in('statement_id', ids) : { data: [] };
  for (const s of sts ?? []) {
    const mine = (items ?? []).filter((i) => i.statement_id === s.id).map((i) => ({ code: i.item_code as string, kind: i.kind as string, amount: Number(i.amount) }));
    parts.set(s.employee_id as string, partsOf(mine, s.net_total === null ? null : Number(s.net_total)));
  }
  return { month: prev, parts };
}
