// 출퇴근 기록 엑셀 일괄 입력 (2026-10-20 노프로 비교). 순수 함수 — 양식 · 읽기.
// 한 줄 = 한 사람 한 날의 출근 · 퇴근. 저장은 관리자 대리 등록과 같은 길(proxyPunch — 정정을 만들고 바로 승인)로 한다.
// 퇴근이 출근보다 이르면 자정을 넘긴 퇴근(다음 날)으로 본다. 이미 있는 기록은 덮지 않는다(그 칸만 실패로 알린다).
import ExcelJS from 'exceljs';
import { toDate } from '@/lib/staff-bulk';

export type PunchLabels = { sheet: string; guide: string; cols: { employeeNo: string; name: string; date: string; in: string; out: string; reason: string } };
export type PunchMember = { id: string; employeeNo: string | null; name: string };
export type PunchLine = { row: number; employeeNo: string; name: string; employeeId: string | null; workDate: string | null; in: string | null; out: string | null; nextDay: boolean; reason: string; error: 'unknown_employee' | 'bad_date' | 'bad_time' | 'no_time' | 'reason_required' | null };

const text = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 16).replace('T', ' ');
  if (typeof v === 'object') {
    const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[] };
    if (o.richText) return o.richText.map((r) => r.text).join('').trim();
    return text(o.result ?? o.text ?? '');
  }
  return String(v).trim();
};
/** 9:00 · 09:00 · 0900 · 900 · 엑셀 시간(소수) → HH:MM */
export function toTime(v: unknown): string | null | undefined {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number' && v >= 0 && v < 1) { const m = Math.round(v * 1440); return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }
  if (v instanceof Date) return `${String(v.getUTCHours()).padStart(2, '0')}:${String(v.getUTCMinutes()).padStart(2, '0')}`;
  const s = text(v).replace(/\s/g, '');
  const m = /^(\d{1,2}):?(\d{2})$/.exec(s);
  if (!m) return undefined;
  const h = Number(m[1]), mi = Number(m[2]);
  return h < 24 && mi < 60 ? `${String(h).padStart(2, '0')}:${m[2]}` : undefined;
}
const dateOf = (v: unknown): string | null | undefined => (v instanceof Date ? v.toISOString().slice(0, 10) : toDate(text(v)));

export function punchTemplate(members: readonly PunchMember[], date: string, L: PunchLabels): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(L.sheet);
  ws.addRow([L.guide]);
  ws.getRow(1).font = { italic: true, color: { argb: 'FF666666' } };
  ws.addRow([L.cols.employeeNo, L.cols.name, L.cols.date, L.cols.in, L.cols.out, L.cols.reason]);
  ws.getRow(2).font = { bold: true };
  for (const m of members) ws.addRow([m.employeeNo ?? '', m.name, date, '', '', '']);
  ws.columns = [{ width: 12 }, { width: 12 }, { width: 13 }, { width: 9 }, { width: 9 }, { width: 30 }];
  return wb;
}

export function readPunches(all: readonly unknown[][], members: readonly PunchMember[], L: PunchLabels, defaultReason: string): PunchLine[] | null {
  const h = all.findIndex((r) => text(r[0]) === L.cols.employeeNo);
  if (h < 0) return null;
  const byNo = new Map(members.filter((m) => m.employeeNo).map((m) => [m.employeeNo!, m]));
  const out: PunchLine[] = [];
  for (let i = h + 1; i < all.length; i++) {
    const r = all[i];
    const no = text(r[0]), name = text(r[1]);
    const tin = toTime(r[3]), tout = toTime(r[4]);
    if (!tin && !tout && tin !== undefined && tout !== undefined) continue; // 시각이 비어 있는 줄(양식 그대로)은 건너뛴다
    const reason = text(r[5]) || defaultReason;
    const m = byNo.get(no);
    const workDate = dateOf(r[2]);
    const base = { row: i + 1, employeeNo: no, name: name || m?.name || '', employeeId: m?.id ?? null, workDate: workDate ?? null, in: tin ?? null, out: tout ?? null, nextDay: !!(tin && tout && tout < tin), reason };
    const error: PunchLine['error'] = !m ? 'unknown_employee' : !workDate ? 'bad_date' : tin === undefined || tout === undefined ? 'bad_time' : !tin && !tout ? 'no_time' : reason.length < 2 ? 'reason_required' : null;
    out.push({ ...base, error });
  }
  return out;
}
