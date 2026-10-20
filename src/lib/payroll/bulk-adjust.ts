// 급여대장 「한꺼번에 넣기」 (2026-10-20 노프로 비교: 공제 엑셀 일괄 입력 · 상여 일괄 지급). 순수 함수.
// 엑셀 한 칸 = 한 사람의 한 항목 「조정」 — 하나씩 넣는 조정과 같은 길(addOverride)로 저장하고 사유에 파일 이름을 남긴다.
// 빈 칸은 건드리지 않는다. 0을 넣으면 「0원으로 조정」(떼지 않음)이다.
import ExcelJS from 'exceljs';

export type BulkColumn = { code: string; kind: 'PAYMENT' | 'DEDUCTION'; label: string };
export type BulkMember = { employeeId: string; employeeNo: string | null; name: string };
export type BulkCell = { code: string; kind: 'PAYMENT' | 'DEDUCTION'; amount: number };
export type BulkLine = { row: number; employeeNo: string; name: string; employeeId: string | null; cells: BulkCell[]; error: 'unknown_employee' | 'bad_amount' | 'negative_pay' | null };
export type BulkLabels = { sheet: string; guide: string; employeeNo: string; name: string; kind: Record<'PAYMENT' | 'DEDUCTION', string> };

/** 엑셀에 넣을 수 있는 항목: 공제 전부 + 직접 넣는 지급(상여 · 결근차감 등) */
export function bulkColumns(items: readonly { code: string; kind: 'PAYMENT' | 'DEDUCTION'; koName: string; calcKind: string; inUse: boolean }[]): BulkColumn[] {
  return items
    .filter((i) => i.inUse && (i.kind === 'DEDUCTION' || i.calcKind === 'MANUAL'))
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'PAYMENT' ? -1 : 1))
    .map((i) => ({ code: i.code, kind: i.kind, label: i.koName }));
}

const head = (c: BulkColumn, L: BulkLabels) => `${L.kind[c.kind]} · ${c.label} [${c.code}]`;
const CODE = /\[([A-Z0-9_]{2,40})\]\s*$/;

export function bulkTemplate(members: readonly BulkMember[], columns: readonly BulkColumn[], L: BulkLabels): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(L.sheet);
  ws.addRow([L.guide]);
  ws.getRow(1).font = { italic: true, color: { argb: 'FF666666' } };
  ws.addRow([L.employeeNo, L.name, ...columns.map((c) => head(c, L))]);
  ws.getRow(2).font = { bold: true };
  for (const m of members) ws.addRow([m.employeeNo ?? '', m.name]);
  ws.columns = [{ width: 12 }, { width: 12 }, ...columns.map(() => ({ width: 22 }))];
  return wb;
}

const text = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && v !== null) {
    const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[] };
    if (o.richText) return o.richText.map((r) => r.text).join('').trim();
    return text(o.result ?? o.text ?? '');
  }
  return String(v).trim();
};

/** 올린 파일 → 줄마다 넣을 조정. 머리 줄(사번 · 이름 · 항목 [코드])을 찾아 그 아래를 읽는다 */
export function readBulk(all: readonly unknown[][], columns: readonly BulkColumn[], members: readonly BulkMember[], L: BulkLabels): BulkLine[] | null {
  const h = all.findIndex((r) => text(r[0]) === L.employeeNo);
  if (h < 0) return null;
  const known = new Map(columns.map((c) => [c.code, c]));
  const cols = all[h].map((v) => { const m = CODE.exec(text(v)); return m ? (known.get(m[1]) ?? null) : null; });
  const byNo = new Map(members.filter((m) => m.employeeNo).map((m) => [m.employeeNo!, m]));
  const byName = new Map<string, BulkMember | null>();
  for (const m of members) byName.set(m.name, byName.has(m.name) ? null : m); // 같은 이름이 둘이면 이름으로 찾지 않는다
  const out: BulkLine[] = [];
  for (let i = h + 1; i < all.length; i++) {
    const r = all[i];
    const no = text(r[0]), name = text(r[1]);
    const cells: BulkCell[] = [];
    let error: BulkLine['error'] = null;
    for (let j = 2; j < r.length; j++) {
      const c = cols[j];
      const raw = text(r[j]).replace(/,/g, '');
      if (!c || raw === '') continue;
      if (!/^-?\d{1,12}$/.test(raw)) { error = 'bad_amount'; continue; }
      const amount = Number(raw);
      if (c.kind === 'PAYMENT' && amount < 0) { error = 'negative_pay'; continue; }
      cells.push({ code: c.code, kind: c.kind, amount });
    }
    if (!no && !name && !cells.length) continue;
    const m = (no && byNo.get(no)) || (!no && name ? byName.get(name) : undefined) || null;
    out.push({ row: i + 1, employeeNo: no, name, employeeId: m?.employeeId ?? null, cells, error: error ?? (m ? null : 'unknown_employee') });
  }
  return out;
}
