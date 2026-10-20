// 휴가(연차) 엑셀 일괄 입력 (2026-10-20 노프로 비교). 순수 함수 — 양식 · 읽기.
// 한 줄 = 한 사람의 휴가 한 건. 저장은 최고관리자 직권 휴가와 같은 길(planLeave direct → 확정 · 마감 검사 → 넣고 바로 승인)로 한다.
// 시간 단위 휴가(반차 · 외출 등)는 시작 시각을 적는다(종류에 시각이 정해져 있으면 비워도 된다).
import ExcelJS from 'exceljs';
import { toTime } from '@/lib/punch-bulk';
import { toDate } from '@/lib/staff-bulk';

export type LeaveLabels = { sheet: string; guide: string; cols: { employeeNo: string; name: string; type: string; start: string; end: string; time: string; reason: string }; typesSheet: string };
export type LeaveMember = { id: string; employeeNo: string | null; name: string };
export type LeaveKind = { code: string; name: string; dayUnit: number };
export type LeaveLine = { row: number; employeeNo: string; name: string; employeeId: string | null; typeCode: string | null; typeName: string; startDate: string | null; endDate: string | null; startTime: string | null; reason: string; error: 'unknown_employee' | 'unknown_type' | 'bad_date' | 'bad_time' | null };

const text = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[] };
    if (o.richText) return o.richText.map((r) => r.text).join('').trim();
    return text(o.result ?? o.text ?? '');
  }
  return String(v).trim();
};

export function leaveTemplate(types: readonly LeaveKind[], L: LeaveLabels): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(L.sheet);
  ws.addRow([L.guide]);
  ws.getRow(1).font = { italic: true, color: { argb: 'FF666666' } };
  ws.addRow([L.cols.employeeNo, L.cols.name, L.cols.type, L.cols.start, L.cols.end, L.cols.time, L.cols.reason]);
  ws.getRow(2).font = { bold: true };
  ws.columns = [{ width: 12 }, { width: 12 }, { width: 20 }, { width: 13 }, { width: 13 }, { width: 11 }, { width: 30 }];
  const ref = wb.addWorksheet(L.typesSheet);
  for (const t of types) ref.addRow([t.name]);
  return wb;
}

export function readLeaves(all: readonly unknown[][], members: readonly LeaveMember[], types: readonly LeaveKind[], L: LeaveLabels): LeaveLine[] | null {
  const h = all.findIndex((r) => text(r[0]) === L.cols.employeeNo);
  if (h < 0) return null;
  const byNo = new Map(members.filter((m) => m.employeeNo).map((m) => [m.employeeNo!, m]));
  const out: LeaveLine[] = [];
  for (let i = h + 1; i < all.length; i++) {
    const r = all[i];
    const no = text(r[0]), typeName = text(r[2]);
    if (!no && !typeName && !text(r[3])) continue;
    const m = byNo.get(no);
    const type = types.find((t) => t.name === typeName || t.code === typeName.toUpperCase());
    const start = r[3] instanceof Date ? (r[3] as Date).toISOString().slice(0, 10) : toDate(text(r[3]));
    const endRaw = r[4] instanceof Date ? (r[4] as Date).toISOString().slice(0, 10) : toDate(text(r[4]));
    const end = endRaw === null ? start : endRaw;
    const time = toTime(r[5]);
    const reason = text(r[6]).slice(0, 200);
    const error: LeaveLine['error'] = !m ? 'unknown_employee' : !type ? 'unknown_type' : !start || end === undefined || !end || end < start ? 'bad_date' : time === undefined ? 'bad_time' : null;
    out.push({ row: i + 1, employeeNo: no, name: text(r[1]) || m?.name || '', employeeId: m?.id ?? null, typeCode: type?.code ?? null, typeName, startDate: start ?? null, endDate: end ?? null, startTime: time ?? null, reason, error });
  }
  return out;
}
