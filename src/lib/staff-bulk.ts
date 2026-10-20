// 직원 여러 명 엑셀로 등록 (2026-10-20 노프로 비교). 순수 함수 — 양식 만들기 · 읽기 · 검사.
// 한 줄 = 한 사람. 저장은 한 명씩 추가와 같은 길(createEmployee)로 한다. 초대 링크는 자동으로 보내지 않는다(직원 화면에서 보낸다).
// 주민번호 · 계좌는 받지 않는다(결정 사항 급여-36).
import ExcelJS from 'exceljs';
const EMPLOYEE_NO_RE = /^[A-Za-z0-9-]{1,20}$/; // lib/invite.ts와 같은 규칙 (그쪽은 서버 전용이라 여기 따로 둔다)

export const STAFF_COLS = ['employeeNo', 'name', 'joinedOn', 'phone', 'email', 'jobTitle', 'group', 'job', 'nationality', 'visaType', 'stayUntil'] as const;
export type StaffCol = (typeof STAFF_COLS)[number];
export type StaffLabels = { sheet: string; guide: string; cols: Record<StaffCol, string> };
export type StaffInput = { employeeNo: string; name: string; joinedOn: string | null; phone: string | null; email: string | null; jobTitle: string | null; groupId: string | null; jobId: string | null; nationality: string | null; visaType: string | null; stayUntil: string | null };
export type StaffLine = { row: number; employeeNo: string; name: string; input: StaffInput | null; error: string | null };
type Named = { id: string; label: string };

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
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
/** 2026-01-02 · 2026.1.2 · 20260102 모두 받는다 */
export const toDate = (s: string): string | null | undefined => {
  if (!s) return null;
  const m = /^(\d{4})[.\-/]?\s*(\d{1,2})[.\-/]?\s*(\d{1,2})\.?$/.exec(s.replace(/\s/g, ''));
  if (!m) return undefined;
  const d = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return isDate(d) ? d : undefined;
};

export function staffTemplate(groups: readonly Named[], jobs: readonly Named[], L: StaffLabels): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(L.sheet);
  ws.addRow([L.guide]);
  ws.getRow(1).font = { italic: true, color: { argb: 'FF666666' } };
  ws.addRow(STAFF_COLS.map((c) => L.cols[c]));
  ws.getRow(2).font = { bold: true };
  ws.columns = STAFF_COLS.map((c) => ({ width: c === 'group' || c === 'email' ? 26 : 14 }));
  // 고를 수 있는 소속 · 직무 이름을 둘째 시트에 — 이름 그대로 적는다
  const ref = wb.addWorksheet('목록');
  ref.addRow([L.cols.group, L.cols.job]);
  for (let i = 0; i < Math.max(groups.length, jobs.length); i++) ref.addRow([groups[i]?.label ?? '', jobs[i]?.label ?? '']);
  return wb;
}

export function readStaff(all: readonly unknown[][], ctx: { existingNos: ReadonlySet<string>; groups: readonly Named[]; jobs: readonly Named[]; today: string }, L: StaffLabels): StaffLine[] | null {
  const h = all.findIndex((r) => text(r[0]) === L.cols.employeeNo);
  if (h < 0) return null;
  const seen = new Set<string>();
  const out: StaffLine[] = [];
  for (let i = h + 1; i < all.length; i++) {
    const v = Object.fromEntries(STAFF_COLS.map((c, j) => [c, text(all[i][j])])) as Record<StaffCol, string>;
    if (STAFF_COLS.every((c) => !v[c])) continue;
    const fail = (error: string): StaffLine => ({ row: i + 1, employeeNo: v.employeeNo, name: v.name, input: null, error });
    if (!v.employeeNo || !v.name) { out.push(fail('import_required')); continue; }
    if (!EMPLOYEE_NO_RE.test(v.employeeNo)) { out.push(fail('invalid_no')); continue; }
    if (v.name.length > 50) { out.push(fail('invalid_name')); continue; }
    if (ctx.existingNos.has(v.employeeNo)) { out.push(fail('duplicate_no')); continue; }
    if (seen.has(v.employeeNo)) { out.push(fail('import_duplicate')); continue; }
    const joinedOn = toDate(v.joinedOn), stayUntil = toDate(v.stayUntil);
    if (joinedOn === undefined || stayUntil === undefined) { out.push(fail('import_bad_date')); continue; }
    const phone = v.phone.replace(/[^\d]/g, '');
    if (v.phone && !/^0\d{8,10}$/.test(phone)) { out.push(fail('invalid_phone')); continue; }
    const email = v.email.toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { out.push(fail('invalid_email')); continue; }
    const group = v.group ? ctx.groups.find((g) => g.label === v.group || g.label.endsWith(`› ${v.group}`)) : null;
    if (v.group && !group) { out.push(fail('import_unknown_group')); continue; }
    const job = v.job ? ctx.jobs.find((g) => g.label === v.job) : null;
    if (v.job && !job) { out.push(fail('import_unknown_job')); continue; }
    const nat = v.nationality.toUpperCase();
    if (nat && !/^[A-Z]{2}$/.test(nat)) { out.push(fail('foreign_nationality')); continue; }
    const visa = v.visaType.toUpperCase();
    if (visa && !/^[A-Z][0-9A-Z-]{0,9}$/.test(visa)) { out.push(fail('foreign_visa')); continue; }
    seen.add(v.employeeNo);
    out.push({
      row: i + 1, employeeNo: v.employeeNo, name: v.name, error: null,
      input: { employeeNo: v.employeeNo, name: v.name, joinedOn, phone: phone || null, email: email || null, jobTitle: v.jobTitle.slice(0, 40) || null, groupId: group?.id ?? null, jobId: job?.id ?? null, nationality: nat && nat !== 'KR' ? nat : null, visaType: nat && nat !== 'KR' ? visa || null : null, stayUntil: nat && nat !== 'KR' ? stayUntil : null },
    });
  }
  return out;
}
