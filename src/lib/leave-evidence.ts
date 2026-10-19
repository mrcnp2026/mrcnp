// 휴가 증빙 파일 (묶음 9 · DB 0060, 2026-10-19 의뢰인 승인). 진단서 · 청첩장 같은 파일을 휴가 신청 한 건에 붙인다.
// ★ 파일은 비공개 저장소(leave-evidence)에만 두고, 보기는 서버가 권한을 확인한 뒤 내려 준다(주소를 밖에 공개하지 않는다).
// ★ 볼 수 있는 사람: 신청한 직원 본인 · 관리자 · 그 직원을 맡은 지점관리자.
// ★ 붙이기 · 떼기는 승인 전(대기)에만 — 본인 또는 그 직원의 요청을 처리할 수 있는 관리자. 승인 뒤에는 기록으로 남는다.
// ★ 한 건에 3개, 한 파일 10MB, PDF · JPG · PNG · HEIC만. 종류는 파일 앞부분(서명)으로 다시 확인한다 — 이름 · 브라우저가 알려 준 종류를 믿지 않는다.
// ★ 종류별 규칙의 「증빙 필수」가 켜져 있으면 파일 없이는 승인할 수 없다(신청은 된다).
import 'server-only';
import { randomUUID } from 'node:crypto';
import { ApiError } from '@/lib/api';
import type { Me } from '@/lib/auth';
import { loadTypeRules } from '@/lib/leave-ledger-data';
import { requireApprover, viewerScope } from '@/lib/scope';
import { createAdminClient } from '@/lib/supabase/admin';

const db = () => createAdminClient();
const BUCKET = 'leave-evidence';
export const MAX_FILES = 3;
export const MAX_BYTES = 10 * 1024 * 1024;
const missingTable = (code?: string) => code === '42P01' || code === 'PGRST205' || code === 'PGRST204';

type Mime = 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/heic' | 'image/heif';
const EXT: Record<Mime, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic', 'image/heif': 'heif' };

/** 파일 앞부분으로 종류 판단. 받지 않는 종류면 null */
export function sniffEvidence(b: Uint8Array): Mime | null {
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) return 'application/pdf'; // %PDF-
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  // HEIC/HEIF: 4~7바이트 'ftyp' + 브랜드
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = String.fromCharCode(b[8], b[9], b[10], b[11]);
    if (['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx'].includes(brand)) return 'image/heic';
    if (['mif1', 'msf1', 'heif'].includes(brand)) return 'image/heif';
  }
  return null;
}

/** 내려받을 때 쓰는 파일 이름 — 경로 · 제어 문자를 뺀다 */
export const cleanFileName = (name: string): string => {
  const base = name.split(/[\\/]/).pop() ?? '';
  const out = base.replace(/[\u0000-\u001f\u007f"<>|:*?]/g, '').trim().slice(0, 200);
  return out || 'file';
};

export type LeaveFile = { id: string; requestId: string; employeeId: string; fileName: string; size: number; mime: string; uploadedBy: string; at: string };
const toFile = (r: Record<string, unknown>): LeaveFile => ({ id: r.id as string, requestId: r.request_id as string, employeeId: r.employee_id as string, fileName: r.file_name as string, size: r.size_bytes as number, mime: r.mime as string, uploadedBy: r.uploaded_by as string, at: r.created_at as string });

/** 신청들에 붙은 파일(뗀 것 빼고). 표가 없으면 빈 것 */
export async function loadLeaveFiles(requestIds: string[]): Promise<Map<string, LeaveFile[]>> {
  const out = new Map<string, LeaveFile[]>();
  if (requestIds.length === 0) return out;
  const { data, error } = await db().from('leave_attachments').select('id, request_id, employee_id, file_name, size_bytes, mime, uploaded_by, created_at').in('request_id', requestIds).is('removed_at', null).order('created_at');
  if (error) {
    if (!missingTable(error.code)) console.error(JSON.stringify({ route: 'leave-files', code: error.code }));
    return out;
  }
  for (const r of data ?? []) {
    const f = toFile(r);
    out.set(f.requestId, [...(out.get(f.requestId) ?? []), f]);
  }
  return out;
}

/** 이 사람이 그 직원의 파일을 볼 수 있는가 — 본인 · 관리자 · 맡은 지점관리자 */
async function canView(me: Me, employeeId: string): Promise<boolean> {
  if (me.id === employeeId) return true;
  if (me.role !== 'admin' && me.role !== 'manager') return false;
  const scope = await viewerScope();
  return !scope || scope.has(employeeId);
}

/** 붙이기 · 떼기를 할 수 있는가 — 대기 중인 신청만, 본인 또는 처리할 수 있는 관리자 */
async function requireEditor(me: Me, requestId: string): Promise<{ employeeId: string; isTest: boolean }> {
  const { data: r } = await db().from('leave_requests').select('employee_id, status, is_test').eq('id', requestId).maybeSingle();
  if (!r) throw new ApiError(404, 'not_found');
  if (r.status !== 'pending') throw new ApiError(409, 'evidence_locked');
  if (r.employee_id !== me.id) await requireApprover(r.employee_id as string);
  return { employeeId: r.employee_id as string, isTest: r.is_test as boolean };
}

export async function addLeaveFile(args: { me: Me; requestId: string; file: File }): Promise<LeaveFile> {
  const { employeeId, isTest } = await requireEditor(args.me, args.requestId);
  if (args.file.size === 0 || args.file.size > MAX_BYTES) throw new ApiError(413, 'evidence_too_large');
  const bytes = new Uint8Array(await args.file.arrayBuffer());
  const mime = sniffEvidence(bytes);
  if (!mime) throw new ApiError(415, 'evidence_type');
  const now = (await loadLeaveFiles([args.requestId])).get(args.requestId) ?? [];
  if (now.length >= MAX_FILES) throw new ApiError(409, 'evidence_too_many');
  const id = randomUUID();
  const path = `${employeeId}/${args.requestId}/${id}.${EXT[mime]}`;
  const up = await db().storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: false });
  if (up.error) {
    if (/bucket.*not.*found/i.test(up.error.message)) throw new ApiError(503, 'db_update_required');
    throw new Error(`leave-files.upload: ${up.error.message}`);
  }
  const row = { id, request_id: args.requestId, employee_id: employeeId, storage_path: path, file_name: cleanFileName(args.file.name), size_bytes: bytes.length, mime, is_test: isTest, uploaded_by: args.me.id };
  const { data, error } = await db().from('leave_attachments').insert(row).select('id, request_id, employee_id, file_name, size_bytes, mime, uploaded_by, created_at').single();
  if (error) {
    await db().storage.from(BUCKET).remove([path]);
    if (missingTable(error.code)) throw new ApiError(503, 'db_update_required');
    throw new Error(`leave-files.insert: ${error.code}`);
  }
  return toFile(data);
}

/** 떼기 — 기록에 뗀 때 · 뗀 사람을 적고 저장소의 파일은 지운다 */
export async function removeLeaveFile(args: { me: Me; fileId: string }): Promise<void> {
  const { data: f } = await db().from('leave_attachments').select('request_id, storage_path, removed_at').eq('id', args.fileId).maybeSingle();
  if (!f || f.removed_at) throw new ApiError(404, 'not_found');
  await requireEditor(args.me, f.request_id as string);
  const { error } = await db().from('leave_attachments').update({ removed_at: new Date().toISOString(), removed_by: args.me.id }).eq('id', args.fileId).is('removed_at', null);
  if (error) throw new Error(`leave-files.remove: ${error.code}`);
  await db().storage.from(BUCKET).remove([f.storage_path as string]);
}

/** 보기 — 권한이 있으면 파일 내용과 종류 · 이름 */
export async function openLeaveFile(args: { me: Me; fileId: string }): Promise<{ body: Blob; mime: string; fileName: string } | null> {
  const { data: f } = await db().from('leave_attachments').select('employee_id, storage_path, mime, file_name, removed_at').eq('id', args.fileId).maybeSingle();
  if (!f || f.removed_at || !(await canView(args.me, f.employee_id as string))) return null;
  const { data, error } = await db().storage.from(BUCKET).download(f.storage_path as string);
  if (error || !data) return null;
  return { body: data, mime: f.mime as string, fileName: f.file_name as string };
}

/** 승인 전에 — 그 종류가 「증빙 필수」인데 파일이 없으면 막는다 */
export async function assertEvidence(requestId: string): Promise<void> {
  const { data: r } = await db().from('leave_requests').select('type_code').eq('id', requestId).maybeSingle();
  if (!r) return;
  const rule = (await loadTypeRules()).get(r.type_code as string)?.rule;
  if (!rule?.evidenceRequired) return;
  if (((await loadLeaveFiles([requestId])).get(requestId) ?? []).length === 0) throw new ApiError(409, 'evidence_required');
}
