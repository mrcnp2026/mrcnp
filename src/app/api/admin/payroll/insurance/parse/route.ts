// 공단 고지서 엑셀 · CSV 읽기 (2026-10-20 노프로 비교) — 파일을 받아 머리 줄 · 줄을 돌려준다(저장하지 않는다). 열 고르기 · 직원 맞추기는 화면이 하고,
// 저장은 손으로 넣기와 같은 길(notice.save, source FILE)로 한다. 급여 담당 관리자만.
import ExcelJS from 'exceljs';
import { api, ApiError } from '@/lib/api';
import { requirePayroll } from '@/lib/payroll/data';
import { guessMapping, noticeSheet, type Insurer } from '@/lib/payroll/notice-upload';

const MAX_BYTES = 3 * 1024 * 1024;
const isInsurer = (v: unknown): v is Insurer => v === 'NP' || v === 'HI' || v === 'EI' || v === 'IA';

/** CSV 한 줄 나누기 (따옴표 안의 쉼표는 그대로) */
const csvRows = (text: string): string[][] =>
  text.replace(/^\uFEFF/, '').split(/\r?\n/).map((line) => {
    const out: string[] = [];
    let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  });

export const POST = api('admin.payroll.insurance.parse', async (req) => {
  await requirePayroll();
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  const insurer = form?.get('insurer');
  if (!form || !(file instanceof File) || file.size === 0) throw new ApiError(400, 'import_no_file');
  if (file.size > MAX_BYTES) throw new ApiError(400, 'import_too_big');
  if (!isInsurer(insurer)) throw new ApiError(400, 'invalid_input');
  let all: unknown[][] = [];
  if (/\.csv$/i.test(file.name)) {
    const buf = new Uint8Array(await file.arrayBuffer());
    // 공단 CSV는 EUC-KR인 경우가 많다 — UTF-8로 읽어 깨지면 EUC-KR로 다시 읽는다
    let text = new TextDecoder('utf-8').decode(buf);
    if (text.includes('\uFFFD')) text = new TextDecoder('euc-kr').decode(buf);
    all = csvRows(text);
  } else {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(await file.arrayBuffer());
    } catch {
      throw new ApiError(400, 'import_bad_file');
    }
    wb.worksheets[0]?.eachRow({ includeEmpty: true }, (row) => all.push((row.values as unknown[]).slice(1)));
  }
  const sheet = noticeSheet(all);
  if (!sheet || !sheet.rows.length) throw new ApiError(400, 'import_bad_file');
  if (sheet.rows.length > 300) throw new ApiError(400, 'insurance_rows');
  return { sheet, guess: guessMapping(insurer, sheet.headers), fileName: file.name.slice(0, 100) };
});
