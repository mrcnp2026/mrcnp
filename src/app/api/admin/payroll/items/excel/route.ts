// 지급 · 공제 항목 엑셀 (PRD v1.3 17.3, 2026-10-20 의뢰인: 만들어 줘) — GET: 지금 항목이 든 양식 · POST: 올린 파일 미리보기 / 넣기.
// 넣기는 줄마다 손으로 고칠 때와 같은 길(saveItem, 새 판)이다. 문제 있는 줄 · 그대로인 줄은 건드리지 않는다. 통합설정 잠금을 연 급여 담당 관리자만.
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { getTranslations } from 'next-intl/server';
import { api, ApiError } from '@/lib/api';
import { requireConsole } from '@/lib/console-pin';
import { deny } from '@/lib/csv-response';
import { loadItems, requirePayroll, saveItem } from '@/lib/payroll/data';
import { ITEM_COLUMNS, ITEM_WORDS, itemToRow, readItemSheet, type ItemColumn, type ItemLine, type SheetRow } from '@/lib/payroll/item-sheet';
import { toKstDate } from '@/lib/time';

export const maxDuration = 60;
const MAX_BYTES = 2 * 1024 * 1024;
const LISTS: Partial<Record<ItemColumn, readonly string[]>> = {
  kind: Object.values(ITEM_WORDS.kind), calcKind: Object.values(ITEM_WORDS.calcKind), taxTreatment: Object.values(ITEM_WORDS.taxTreatment), ordinaryWage: Object.values(ITEM_WORDS.ordinaryWage), fixedAllowance: Object.values(ITEM_WORDS.yesNo),
};

async function words() {
  const t = await getTranslations({ locale: 'ko', namespace: 'admin.paySettings.itemX' });
  return { t, head: Object.fromEntries(ITEM_COLUMNS.map((c) => [c, t(`col.${c}`)])) as Record<ItemColumn, string> };
}

export async function GET(): Promise<Response> {
  try {
    await requireConsole();
    await requirePayroll();
  } catch (e) {
    return deny(e instanceof ApiError ? e.status : 403, e instanceof ApiError ? e.code : 'forbidden');
  }
  const [{ t, head }, items] = await Promise.all([words(), loadItems()]);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(t('sheet'));
  ws.addRow(ITEM_COLUMNS.map((c) => head[c])).font = { bold: true };
  for (const i of items) ws.addRow(ITEM_COLUMNS.map((c) => itemToRow(i)[c]));
  ws.columns.forEach((col, i) => (col.width = [22, 8, 18, 22, 14, 12, 9, 12, 14, 16, 10, 10, 14, 24][i] ?? 12));
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  // 고르는 칸은 목록에서만 — 100줄까지
  ITEM_COLUMNS.forEach((c, i) => {
    const list = LISTS[c];
    if (!list) return;
    for (let r = 2; r <= 100; r++) ws.getCell(r, i + 1).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${list.join(',')}"`] };
  });
  const guide = wb.addWorksheet(t('guideSheet'));
  for (const line of t('guide').split('\n')) guide.addRow([line]);
  guide.getColumn(1).width = 110;
  const name = `${t('file')}_${toKstDate(new Date())}.xlsx`;
  return new Response((await wb.xlsx.writeBuffer()) as ArrayBuffer, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="pay-items.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'cache-control': 'no-store',
      'x-request-id': randomUUID(),
    },
  });
}

// 미리보기에 내보낼 때는 저장용 값(input)을 뺀다
const strip = (l: ItemLine): Omit<ItemLine, 'input'> => Object.fromEntries(Object.entries(l).filter(([k]) => k !== 'input')) as Omit<ItemLine, 'input'>;

export const POST = api('admin.payroll.items.excel', async (req) => {
  await requireConsole();
  const me = await requirePayroll();
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!form || !(file instanceof File) || file.size === 0) throw new ApiError(400, 'import_no_file');
  if (file.size > MAX_BYTES) throw new ApiError(400, 'import_too_big');
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await file.arrayBuffer());
  } catch {
    throw new ApiError(400, 'import_bad_file');
  }
  const ws = wb.worksheets[0];
  const { head } = await words();
  // 머리 줄의 글자로 칸을 찾는다 — 칸 순서를 바꿔도 된다
  const at = new Map<ItemColumn, number>();
  ws?.getRow(1).eachCell((cell, col) => {
    const k = ITEM_COLUMNS.find((c) => head[c] === String(cell.value ?? '').trim());
    if (k) at.set(k, col);
  });
  if (!ws || !at.has('code') || !at.has('kind')) throw new ApiError(400, 'import_bad_file');
  const rows: { rowNo: number; cells: SheetRow }[] = [];
  ws.eachRow((row, rowNo) => {
    if (rowNo === 1) return;
    const cells = Object.fromEntries([...at].map(([k, col]) => [k, row.getCell(col).value])) as SheetRow;
    if (Object.values(cells).every((v) => v === null || v === undefined || String(v).trim() === '')) return;
    rows.push({ rowNo, cells });
  });
  if (rows.length > 300) throw new ApiError(400, 'import_too_big');
  const today = toKstDate(new Date());
  const lines = readItemSheet(rows, await loadItems(), today);
  if (form.get('apply') !== '1') return { lines: lines.map(strip) };
  const failed: { row: number; error: string }[] = [];
  let saved = 0;
  for (const l of lines) {
    if ((l.state !== 'new' && l.state !== 'changed') || !l.input) continue;
    try {
      await saveItem({ input: l.input, validFrom: l.validFrom!, reason: l.reason ?? `엑셀 · ${file.name}`.slice(0, 500), expectedVersion: l.expectedVersion!, me });
      saved++;
    } catch (e) {
      failed.push({ row: l.row, error: e instanceof ApiError ? e.code : 'generic' });
    }
  }
  return { lines: lines.map(strip), saved, failed };
});
