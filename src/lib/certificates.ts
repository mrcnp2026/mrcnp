// 제증명 — 재직 · 경력 · 퇴직증명서 (2026-10-29 남은 일 9-3, DB 묶음 40 certificate_issues). 서버 전용.
// 직원이 「내 계정 › 증명서」에서 신청 → 최고관리자가 발급(또는 관리자가 바로 발급). 발급하면 발급번호(예: 2026-0001)가 붙고,
// 증명서에 찍을 내용을 그때 그대로 snapshot으로 남긴다 — 나중에 인사 정보가 바뀌어도 그때 무엇을 증명했는지 알 수 있다.
// 대장은 덧붙이기만 한다(신청 → 발급 · 반려는 한 번만, DB 보호 장치). ★ 주민번호는 넣지 않는다(생년월일만, 있으면).
import 'server-only';
import { ApiError } from '@/lib/api';
import { companyProfile, companyName } from '@/lib/company';
import { groupPath } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';

export const CERT_KINDS = ['EMPLOYMENT', 'CAREER', 'RETIREMENT'] as const;
export type CertKind = (typeof CERT_KINDS)[number];
export type CertState = 'REQUESTED' | 'ISSUED' | 'REJECTED';
export type CertSnapshot = {
  kind: CertKind; name: string; employeeNo: string | null; birthDate: string | null; group: string | null; jobTitle: string | null;
  startsOn: string | null; endsOn: string | null; purpose: string; issuedOn: string;
  company: { name: string; ceo: string; bizNo: string; address: string; phone: string };
};
export type CertRow = { id: string; serial: string | null; employeeId: string; kind: CertKind; purpose: string; copies: number; state: CertState; requestedBy: string; issuedBy: string | null; issuedAt: string | null; snapshot: CertSnapshot | null; rejectReason: string | null; createdAt: string };

const COLS = 'id, serial, employee_id, kind, purpose, copies, state, requested_by, issued_by, issued_at, snapshot, reject_reason, created_at';
const toRow = (r: Record<string, unknown>): CertRow => ({
  id: r.id as string, serial: r.serial as string | null, employeeId: r.employee_id as string, kind: r.kind as CertKind, purpose: r.purpose as string, copies: r.copies as number,
  state: r.state as CertState, requestedBy: r.requested_by as string, issuedBy: r.issued_by as string | null, issuedAt: r.issued_at as string | null,
  snapshot: (r.snapshot as CertSnapshot | null) ?? null, rejectReason: r.reject_reason as string | null, createdAt: r.created_at as string,
});

export function cleanCertInput(b: Record<string, unknown>): { kind: CertKind; purpose: string; copies: number } | null {
  const kind = CERT_KINDS.find((k) => k === b.kind);
  const purpose = typeof b.purpose === 'string' ? b.purpose.trim().slice(0, 100) : '';
  const copies = Number(b.copies ?? 1);
  if (!kind || !purpose || !Number.isInteger(copies) || copies < 1 || copies > 5) return null;
  return { kind, purpose, copies };
}

/** 그 직원의 재직 기간 — 가장 최근 줄(퇴사했으면 끝난 날 포함). 기간 표가 비어 있으면 입사일만 */
async function employment(employeeId: string): Promise<{ startsOn: string | null; endsOn: string | null }> {
  const db = createAdminClient();
  const [{ data: periods }, { data: p }] = await Promise.all([
    db.from('staff_employment_periods').select('starts_on, ends_on').eq('employee_id', employeeId).eq('active', true).order('starts_on', { ascending: false }).limit(1),
    db.from('profiles').select('joined_on').eq('id', employeeId).maybeSingle(),
  ]);
  const last = periods?.[0];
  return { startsOn: (last?.starts_on as string | undefined) ?? (p?.joined_on as string | null) ?? null, endsOn: (last?.ends_on as string | null | undefined) ?? null };
}

/** 이 종류를 낼 수 있는가 — 재직증명서는 재직 중, 퇴직증명서는 퇴사한 사람만 */
export async function certAllowed(employeeId: string, kind: CertKind): Promise<{ ok: true } | { ok: false; code: string }> {
  const { data: p } = await createAdminClient().from('profiles').select('active').eq('id', employeeId).maybeSingle();
  if (!p) return { ok: false, code: 'not_found' };
  const e = await employment(employeeId);
  if (!e.startsOn) return { ok: false, code: 'cert_no_start' };
  const left = !p.active || (!!e.endsOn && e.endsOn < toKstDate(new Date()));
  if (kind === 'EMPLOYMENT' && left) return { ok: false, code: 'cert_not_employed' };
  if (kind === 'RETIREMENT' && !left) return { ok: false, code: 'cert_not_retired' };
  return { ok: true };
}

export async function snapshotOf(employeeId: string, kind: CertKind, purpose: string): Promise<CertSnapshot> {
  const db = createAdminClient();
  const [{ data: p }, { data: d }, e, groups, profile, cname] = await Promise.all([
    db.from('profiles').select('name, employee_no, group_id, job_title').eq('id', employeeId).maybeSingle(),
    db.from('staff_details').select('birth_date').eq('id', employeeId).maybeSingle(),
    employment(employeeId),
    loadOrgGroups(),
    companyProfile(),
    companyName(),
  ]);
  if (!p) throw new ApiError(404, 'not_found');
  return {
    kind, name: p.name as string, employeeNo: (p.employee_no as string | null) ?? null, birthDate: (d?.birth_date as string | null) ?? null,
    group: groupPath(groups, p.group_id as string | null), jobTitle: (p.job_title as string | null) ?? null,
    startsOn: e.startsOn, endsOn: kind === 'EMPLOYMENT' ? null : e.endsOn, purpose, issuedOn: toKstDate(new Date()),
    company: { name: cname, ceo: profile.ceo, bizNo: profile.bizNo, address: profile.address, phone: profile.phone },
  };
}

/** 발급 전에 관리자가 고칠 수 있는 칸 (2026-10-30 의뢰인: 「PDF 전에 내용을 편집할 수 있어야」). 이름 · 종류 · 회사 정보는 고치지 않는다(회사 정보는 회사 기본설정에서) */
export type CertEdits = Partial<Pick<CertSnapshot, 'birthDate' | 'group' | 'jobTitle' | 'startsOn' | 'endsOn' | 'purpose'>>;
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
export function cleanCertEdits(raw: unknown): CertEdits | null {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const out: CertEdits = {};
  for (const k of ['group', 'jobTitle'] as const) if (typeof r[k] === 'string') out[k] = (r[k] as string).trim().slice(0, 60) || null;
  if (typeof r.purpose === 'string') {
    const v = r.purpose.trim().slice(0, 100);
    if (!v) return null;
    out.purpose = v;
  }
  for (const k of ['birthDate', 'startsOn', 'endsOn'] as const) {
    if (r[k] === '' || r[k] === null) out[k] = null;
    else if (r[k] !== undefined) {
      if (!isDate(r[k])) return null;
      out[k] = r[k] as string;
    }
  }
  if (out.startsOn && out.endsOn && out.endsOn < out.startsOn) return null;
  return out;
}

/** 직원의 신청 (재직 중인 본인만) */
export async function requestCert(args: { employeeId: string; kind: CertKind; purpose: string; copies: number; practice: boolean }): Promise<string> {
  const ok = await certAllowed(args.employeeId, args.kind);
  if (!ok.ok) throw new ApiError(400, ok.code);
  const { data, error } = await createAdminClient().from('certificate_issues').insert({ employee_id: args.employeeId, kind: args.kind, purpose: args.purpose, copies: args.copies, requested_by: args.employeeId, is_test: args.practice }).select('id').single();
  if (error) throw new Error(`requestCert: ${error.code}`);
  return data.id as string;
}

/** 다음 발급번호 — 그해 발급한 것 중 가장 큰 번호 + 1. 동시에 발급하면 유일 제약이 막고 다시 센다 */
async function nextSerial(year: string): Promise<string> {
  const { data } = await createAdminClient().from('certificate_issues').select('serial').like('serial', `${year}-%`).order('serial', { ascending: false }).limit(1);
  const last = Number((data?.[0]?.serial as string | undefined)?.slice(5) ?? 0);
  return `${year}-${String(last + 1).padStart(4, '0')}`;
}

/** 발급 — 신청을 발급하거나(id), 관리자가 바로 발급(employeeId · kind · purpose). 발급한 줄을 돌려준다 */
export async function issueCert(args: { actorId: string; id?: string; direct?: { employeeId: string; kind: CertKind; purpose: string; copies: number }; edits?: CertEdits; practice: boolean }): Promise<CertRow> {
  const db = createAdminClient();
  let id = args.id;
  if (!id && args.direct) {
    const { data, error } = await db.from('certificate_issues').insert({ employee_id: args.direct.employeeId, kind: args.direct.kind, purpose: args.direct.purpose, copies: args.direct.copies, requested_by: args.actorId, is_test: args.practice }).select('id').single();
    if (error) throw new Error(`issueCert.insert: ${error.code}`);
    id = data.id as string;
  }
  if (!id) throw new ApiError(400, 'invalid_input');
  const { data: row } = await db.from('certificate_issues').select(COLS).eq('id', id).maybeSingle();
  if (!row) throw new ApiError(404, 'not_found');
  if (row.state !== 'REQUESTED') throw new ApiError(409, 'cert_already_done');
  const ok = await certAllowed(row.employee_id as string, row.kind as CertKind);
  if (!ok.ok) throw new ApiError(400, ok.code);
  const snap = { ...(await snapshotOf(row.employee_id as string, row.kind as CertKind, row.purpose as string)), ...(args.edits ?? {}) }; // 관리자가 미리보기에서 고친 칸을 덮어쓴다
  for (let i = 0; i < 5; i++) {
    const serial = await nextSerial(snap.issuedOn.slice(0, 4));
    const { data, error } = await db.from('certificate_issues').update({ state: 'ISSUED', serial, issued_by: args.actorId, issued_at: new Date().toISOString(), snapshot: snap }).eq('id', id).eq('state', 'REQUESTED').select(COLS).maybeSingle();
    if (error?.code === '23505') continue; // 같은 번호를 누가 먼저 썼다 — 다시 센다
    if (error) throw new Error(`issueCert.update: ${error.code}`);
    if (!data) throw new ApiError(409, 'cert_already_done');
    return toRow(data);
  }
  throw new ApiError(409, 'cert_busy');
}

export async function rejectCert(args: { id: string; reason: string }): Promise<void> {
  const reason = args.reason.trim().slice(0, 200);
  if (reason.length < 2) throw new ApiError(400, 'cert_reason_required');
  const { data, error } = await createAdminClient().from('certificate_issues').update({ state: 'REJECTED', reject_reason: reason }).eq('id', args.id).eq('state', 'REQUESTED').select('id').maybeSingle();
  if (error) throw new Error(`rejectCert: ${error.code}`);
  if (!data) throw new ApiError(409, 'cert_already_done');
}

export async function loadCerts(opts: { employeeId?: string; practice: boolean; limit?: number }): Promise<{ rows: CertRow[]; missing: boolean }> {
  let q = createAdminClient().from('certificate_issues').select(COLS).eq('is_test', opts.practice).order('created_at', { ascending: false }).limit(opts.limit ?? 300);
  if (opts.employeeId) q = q.eq('employee_id', opts.employeeId);
  const { data, error } = await q;
  if (error?.code === '42P01') return { rows: [], missing: true }; // 묶음 40 적용 전
  if (error) throw new Error(`loadCerts: ${error.code}`);
  return { rows: (data ?? []).map(toRow), missing: false };
}

/** 처리할 증명서 신청 수 — 최고관리자의 종 · 요청 숫자에 더한다 (2026-10-30 의뢰인: 신청해도 「처리할 요청」에 알림이 없다). 검사 계정(e2e-) 신청은 세지 않는다 */
export async function pendingCertCount(practice: boolean): Promise<number> {
  const db = createAdminClient();
  const { data: test } = await db.from('profiles').select('id').like('employee_no', 'e2e-%');
  let q = db.from('certificate_issues').select('id', { count: 'exact', head: true }).eq('is_test', practice).eq('state', 'REQUESTED');
  if (test?.length) q = q.not('employee_id', 'in', `(${test.map((p) => p.id).join(',')})`);
  const { count, error } = await q;
  return error ? 0 : (count ?? 0);
}

export async function loadCert(id: string): Promise<CertRow | null> {
  const { data } = await createAdminClient().from('certificate_issues').select(COLS).eq('id', id).maybeSingle();
  return data ? toRow(data) : null;
}
