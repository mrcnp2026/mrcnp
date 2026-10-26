// 급여명세서 엑셀 올리기 (2026-10-16 의뢰인: 명세서는 업로드 방식 — 다운로드 외 업로드 버튼). 급여 담당 관리자만.
//   GET  → 양식 엑셀 받기(사번 · 성명이 채워진 표). 회사 급여 프로그램의 엑셀을 그대로 올려도 된다.
//   POST → (formData) file · month(YYYY-MM) · payDate · overrides(칸 번호 → 종류 JSON) · apply('1'이면 저장)
//          미리보기: 칸 짐작 · 줄마다 지급/공제/실지급 · 막힌 줄. 저장: 막힌 줄이 하나라도 있으면 저장하지 않는다(파일이나 칸 종류를 고친 뒤 다시).
//   저장하면 직원마다 한 장씩 바로 「내 급여」에 공개된다. 같은 달에 다시 올리면 앞 장은 「바뀜」으로 남고 새 장(판 +1)이 공개된다.
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { after } from 'next/server';
import { OFFICE } from '@/config/office';
import { api, ApiError } from '@/lib/api';
import type { Me } from '@/lib/auth';
import { deny } from '@/lib/csv-response';
import { requirePayroll } from '@/lib/payroll/data';
import { mailPublished } from '@/lib/payroll/slip-mail';
import { notifyPayslipPublished } from '@/lib/push-events';
import { createAdminClient } from '@/lib/supabase/admin';
import { COL_KINDS, findHeader, readColumns, readSlipRows, TEMPLATE_HEADERS, type ColKind } from '@/lib/payroll/slip-upload';
import { fileHash, readSheet, saveUpload, uploadPeople } from '@/lib/payroll/slip-upload-data';

export const maxDuration = 60;
const MAX_BYTES = 5 * 1024 * 1024;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(): Promise<Response> {
  let me: Me;
  try {
    me = await requirePayroll();
  } catch {
    return deny(403, 'forbidden');
  }
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('payslips');
  ws.addRow([...TEMPLATE_HEADERS]);
  ws.getRow(1).font = { bold: true };
  for (const p of await uploadPeople(me)) ws.addRow([p.employeeNo ?? '', p.name]);
  ws.columns.forEach((c, i) => { c.width = i < 2 ? 12 : 14; });
  return new Response((await wb.xlsx.writeBuffer()) as ArrayBuffer, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="payslips.xlsx"`,
      'cache-control': 'no-store',
      'x-request-id': randomUUID(),
    },
  });
}

export const POST = api('admin.payroll.slips.upload', async (req, ctx) => {
  const me = await requirePayroll();
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!form || !(file instanceof File) || file.size === 0) throw new ApiError(400, 'import_no_file');
  if (file.size > MAX_BYTES) throw new ApiError(400, 'import_too_big');
  const month = String(form.get('month') ?? '');
  if (!MONTH.test(month)) throw new ApiError(400, 'invalid_input');
  let overrides: Record<number, ColKind> = {};
  try {
    const raw = JSON.parse(String(form.get('overrides') ?? '{}')) as Record<string, string>;
    overrides = Object.fromEntries(Object.entries(raw).filter(([k, v]) => /^\d+$/.test(k) && (COL_KINDS as readonly string[]).includes(v)).map(([k, v]) => [Number(k), v as ColKind]));
  } catch {
    throw new ApiError(400, 'invalid_input');
  }
  const buf = await file.arrayBuffer();
  const rows = await readSheet(buf, file.name);
  if (!rows) throw new ApiError(400, 'import_bad_file');
  const header = findHeader(rows);
  if (header < 0) throw new ApiError(400, 'slip_no_header');
  const columns = readColumns(rows, header, overrides);
  if (!columns.some((c) => c.kind === 'ID' || c.kind === 'NAME')) throw new ApiError(400, 'slip_no_header');
  const lines = readSlipRows(rows, header, columns, await uploadPeople(me));
  if (form.get('apply') !== '1') return { header: header + 1, columns, lines };

  const payDate = String(form.get('payDate') ?? '');
  if (!DATE.test(payDate) || Number.isNaN(Date.parse(`${payDate}T00:00:00Z`))) throw new ApiError(400, 'invalid_input');
  if (lines.length === 0) throw new ApiError(400, 'slip_empty');
  if (lines.some((l) => l.errors.length > 0)) throw new ApiError(409, 'slip_has_errors');
  const saved = await saveUpload({ me, month, payDate, rows: lines, fileName: file.name, hash: fileHash(buf), practice: OFFICE.practiceMode, requestId: ctx.requestId });
  // 저장 = 공개이므로 폰 알림과 명세서 메일도 함께 (2026-10-24 의뢰인). 응답을 돌려준 뒤 서버에서만 보낸다
  after(async () => {
    const { data } = await createAdminClient().from('payroll_uploaded_slips').select('id, employee_id').eq('batch_id', saved.batchId).eq('state', 'PUBLISHED');
    const slips = (data ?? []).map((r) => ({ employeeId: r.employee_id as string, slipId: r.id as string }));
    await notifyPayslipPublished(saved.batchId, month, 'REGULAR', slips.map((x) => x.employeeId));
    await mailPublished({ me, items: slips, practice: OFFICE.practiceMode, origin: req.nextUrl.origin, requestId: ctx.requestId });
  });
  return { ...saved, header: header + 1, columns, lines };
});
