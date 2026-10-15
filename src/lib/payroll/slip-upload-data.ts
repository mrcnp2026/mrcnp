// 올린 급여명세서 — 읽기 · 저장 · 회수 · 직원 화면용 (DB 0047 payroll_uploaded_slips, 2026-10-16 의뢰인: 명세서는 업로드 방식).
// 표가 아직 없는 DB(묶음 14 적용 전)에서는 목록을 빈 것으로 보고, 저장은 「DB 갱신 필요」로 막는다 — 직원 「내 급여」가 깨지지 않게.
import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { ApiError } from '@/lib/api';
import { atomicRpc } from '@/lib/atomic-rpc';
import type { Me } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { isTestNo } from '@/lib/work-messages';
import { parseCsv, type SlipLine, type SlipPerson, type SlipRow } from './slip-upload';
import { payrollAudit } from './staff-data';

const db = () => createAdminClient();
const missingTable = (code?: string) => code === '42P01' || code === 'PGRST205' || code === 'PGRST204';

/** 올릴 수 있는 직원 — 켜져 있는 직원(검사 계정끼리 · 실제끼리) */
export async function uploadPeople(me: Me): Promise<SlipPerson[]> {
  const { data } = await db().from('profiles').select('id, name, employee_no, active').order('employee_no');
  return (data ?? []).filter((p) => isTestNo(p.employee_no as string | null) === isTestNo(me.employeeNo)).map((p) => ({ id: p.id as string, employeeNo: (p.employee_no as string | null) ?? null, name: p.name as string }));
}

/** 엑셀(xlsx) 첫 장 또는 CSV(UTF-8, 안 되면 EUC-KR) → 행들 */
export async function readSheet(buf: ArrayBuffer, fileName: string): Promise<unknown[][] | null> {
  if (/\.csv$/i.test(fileName)) {
    let text = new TextDecoder('utf-8').decode(buf);
    if (text.includes('�')) {
      try {
        text = new TextDecoder('euc-kr').decode(buf);
      } catch {
        return null;
      }
    }
    return parseCsv(text);
  }
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf);
  } catch {
    return null;
  }
  const ws = wb.worksheets.find((w) => w.state === 'visible') ?? wb.worksheets[0];
  if (!ws) return null;
  const all: unknown[][] = [];
  ws.eachRow({ includeEmpty: true }, (row, n) => {
    while (all.length < n - 1) all.push([]);
    all.push((row.values as unknown[]).slice(1));
  });
  return all;
}

export const fileHash = (buf: ArrayBuffer) => createHash('sha256').update(Buffer.from(buf)).digest('hex');

export async function saveUpload(args: { me: Me; month: string; payDate: string; rows: SlipRow[]; fileName: string; hash: string; practice: boolean; requestId?: string }): Promise<{ count: number; batchId: string }> {
  const batchId = randomUUID();
  const payload = args.rows.map((r) => ({ employee_id: r.employeeId, lines: r.lines, pay: r.pay, deduction: r.deduction, net: r.net }));
  const count = await atomicRpc<number>('upload_payslips_atomic', { p_actor: args.me.id, p_month: `${args.month}-01`, p_pay_date: args.payDate, p_rows: payload, p_file_name: args.fileName.slice(0, 200), p_file_hash: args.hash, p_is_test: args.practice, p_batch: batchId });
  await payrollAudit({ actorId: args.me.id, action: 'payslip.upload', table: 'payroll_uploaded_slips', subjectId: batchId, requestId: args.requestId, detail: { month: args.month, count, file: args.fileName, hash: args.hash } });
  return { count, batchId };
}

export type UploadedSlip = { id: string; batchId: string; employeeId: string; month: string; payDate: string; lines: SlipLine[]; pay: number; deduction: number; net: number; revision: number; state: 'PUBLISHED' | 'REPLACED' | 'WITHDRAWN'; fileName: string | null; uploadedBy: string; createdAt: string; withdrawReason: string | null };
type Row = Record<string, unknown>;
const toSlip = (r: Row): UploadedSlip => ({
  id: r.id as string, batchId: r.batch_id as string, employeeId: r.employee_id as string, month: (r.pay_month as string).slice(0, 7), payDate: r.pay_date as string, lines: (r.lines as SlipLine[]) ?? [],
  pay: Number(r.pay_total), deduction: Number(r.deduction_total), net: Number(r.net_total), revision: r.revision as number, state: r.state as UploadedSlip['state'],
  fileName: (r.file_name as string | null) ?? null, uploadedBy: r.uploaded_by as string, createdAt: r.created_at as string, withdrawReason: (r.withdraw_reason as string | null) ?? null,
});

/** 한 달에 올린 명세서 (관리자 화면). 표가 없으면 null — 「DB 갱신 필요」 안내 */
export async function loadUploads(month: string, practice: boolean): Promise<UploadedSlip[] | null> {
  const { data, error } = await db().from('payroll_uploaded_slips').select('*').eq('pay_month', `${month}-01`).eq('is_test', practice).order('created_at', { ascending: false });
  if (missingTable(error?.code)) return null;
  if (error) throw new Error(`loadUploads: ${error.code}`);
  return (data ?? []).map(toSlip);
}

/** 공개 중인 명세서 회수 — 직원 화면에서 사라진다(기록은 남는다) */
export async function withdrawUploads(args: { ids: string[]; reason: string; me: Me; practice: boolean; requestId?: string }): Promise<number> {
  const { data, error } = await db().from('payroll_uploaded_slips').update({ state: 'WITHDRAWN', withdrawn_by: args.me.id, withdrawn_at: new Date().toISOString(), withdraw_reason: args.reason }).in('id', args.ids).eq('state', 'PUBLISHED').eq('is_test', args.practice).select('id, employee_id');
  if (missingTable(error?.code)) throw new ApiError(503, 'db_update_required');
  if (error) throw new Error(`withdrawUploads: ${error.code}`);
  for (const r of data ?? []) await payrollAudit({ actorId: args.me.id, action: 'payslip.withdraw', table: 'payroll_uploaded_slips', subjectId: r.id as string, employeeId: r.employee_id as string, requestId: args.requestId, detail: { reason: args.reason } });
  return (data ?? []).length;
}

/** 직원 본인의 올린 명세서 — 공개 중(current)과 바뀐 앞 판. 회수된 것은 없다. 표가 없으면 빈 목록 */
export async function loadMyUploaded(employeeId: string, practice: boolean): Promise<UploadedSlip[]> {
  const { data, error } = await db().from('payroll_uploaded_slips').select('*').eq('employee_id', employeeId).eq('is_test', practice).in('state', ['PUBLISHED', 'REPLACED']);
  if (error) {
    if (!missingTable(error.code)) console.error(JSON.stringify({ route: 'my-uploaded-slips', code: error.code }));
    return [];
  }
  return (data ?? []).map(toSlip);
}
