// 사원별 급여(계약) 엑셀 올리기 (2026-10-14 다우오피스 비교 문서 08 ⑬). 순수 함수 — 양식 만들기 · 읽기 · 비교.
// ① [양식 받기]: 지금 계약 값이 채워진 엑셀(직원 한 줄씩) ② 담당자가 고쳐서 [올리기] ③ 미리보기: 빠지거나 틀린 칸은 빨갛게, 바뀐 줄만 「바뀜」
// ④ [적용]: 바뀐 줄만 새 판으로 저장(앞 판은 적용 시작일 전날까지로 닫힌다 — 화면에서 하나씩 고치는 것과 같다).
// ★ 사번으로 직원을 찾는다(이름은 참고). 계산 규칙 검사는 화면 저장과 같은 validateContract를 쓴다.
import ExcelJS from 'exceljs';
import { PAY_TYPES, TIME_BASES, validateContract, type ContractInput, type PayType, type TimeBasis } from './contract';

export const IMPORT_COLS = ['employeeNo', 'name', 'payType', 'amount', 'timeBasis', 'monthlyHours', 'annualDivisor'] as const;
export type ImportCol = (typeof IMPORT_COLS)[number];
export type ImportLabels = { cols: Record<ImportCol, string>; payType: Record<PayType, string>; timeBasis: Record<TimeBasis, string>; sheet: string; guide: string };
export type Person = { id: string; employeeNo: string | null; name: string; contract: ContractInput | null; version: number };
export type ImportLine = {
  row: number;
  employeeNo: string;
  name: string;
  employeeId: string | null;
  input: ContractInput | null;
  errors: Partial<Record<ImportCol, string>>; // 칸마다 무엇이 틀렸는지(오류 코드)
  changed: boolean;
  expectedVersion: number;
};

/** 양식 — 지금 계약 값을 채운다. 1행 안내, 2행 머리, 3행부터 직원 */
export function contractTemplate(people: readonly Person[], L: ImportLabels): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(L.sheet);
  ws.addRow([L.guide]).font = { italic: true };
  ws.addRow(IMPORT_COLS.map((c) => L.cols[c])).font = { bold: true };
  for (const p of people) {
    const c = p.contract;
    const row = ws.addRow([p.employeeNo ?? '', p.name, c ? L.payType[c.payType] : '', c?.amount ?? '', c ? L.timeBasis[c.timeBasis] : '', c?.monthlyHours ?? '', c?.annualDivisor ?? '']);
    row.getCell(1).numFmt = '@'; // 사번 '001'이 1이 되지 않게
  }
  ws.columns.forEach((col, i) => (col.width = [14, 14, 12, 14, 18, 14, 14][i]));
  ws.getColumn(4).numFmt = '#,##0';
  return wb;
}

const cellText = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && v && 'text' in v) return String((v as { text: unknown }).text ?? '').trim();
  if (typeof v === 'object' && v && 'result' in v) return String((v as { result: unknown }).result ?? '').trim();
  return String(v).trim();
};
const toNum = (s: string): number | null | undefined => {
  if (s === '') return null;
  const n = Number(s.replace(/[,\s원]/g, ''));
  return Number.isFinite(n) ? n : undefined;
};

/** 올린 엑셀의 행들(머리 행 다음부터) → 줄마다 직원 · 값 · 칸별 오류 · 바뀜 */
export function readContractRows(rows: readonly unknown[][], people: readonly Person[], L: ImportLabels): ImportLine[] {
  const byNo = new Map(people.filter((p) => p.employeeNo).map((p) => [p.employeeNo!, p]));
  const payOf = new Map<string, PayType>([...PAY_TYPES.map((k) => [k, k] as [string, PayType]), ...PAY_TYPES.map((k) => [L.payType[k], k] as [string, PayType])]);
  const basisOf = new Map<string, TimeBasis>([...TIME_BASES.map((k) => [k, k] as [string, TimeBasis]), ...TIME_BASES.map((k) => [L.timeBasis[k], k] as [string, TimeBasis])]);
  const out: ImportLine[] = [];
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    const v = (c: ImportCol) => cellText(r[IMPORT_COLS.indexOf(c)]);
    if (IMPORT_COLS.every((c) => v(c) === '')) return; // 빈 줄은 건너뛴다
    // 계약 값을 하나도 적지 않은 줄(아직 계약이 없는 직원 그대로)은 「그대로」 — 틀린 것으로 보지 않는다. 일부만 적으면 빠진 칸을 빨갛게
    const VALUE_COLS: ImportCol[] = ['payType', 'amount', 'timeBasis', 'monthlyHours', 'annualDivisor'];
    if (VALUE_COLS.every((c) => v(c) === '') && byNo.has(v('employeeNo'))) {
      const known = byNo.get(v('employeeNo'))!;
      out.push({ row: i, employeeNo: v('employeeNo'), name: known.name, employeeId: known.id, input: null, errors: {}, changed: false, expectedVersion: known.version });
      return;
    }
    const errors: ImportLine['errors'] = {};
    const no = v('employeeNo');
    const person = byNo.get(no) ?? null;
    if (!no) errors.employeeNo = 'import_required';
    else if (!person) errors.employeeNo = 'import_unknown_employee';
    else if (seen.has(no)) errors.employeeNo = 'import_duplicate';
    seen.add(no);
    const payType = payOf.get(v('payType'));
    const timeBasis = basisOf.get(v('timeBasis'));
    if (!v('payType')) errors.payType = 'import_required';
    else if (!payType) errors.payType = 'contract_pay_type';
    if (!v('timeBasis')) errors.timeBasis = 'import_required';
    else if (!timeBasis) errors.timeBasis = 'contract_time_basis';
    const amount = toNum(v('amount')), monthlyHours = toNum(v('monthlyHours')), annualDivisor = toNum(v('annualDivisor'));
    if (amount === null) errors.amount = 'import_required';
    else if (amount === undefined) errors.amount = 'contract_amount';
    if (monthlyHours === undefined) errors.monthlyHours = 'contract_monthly_hours';
    if (annualDivisor === undefined) errors.annualDivisor = 'contract_annual_divisor';
    let input: ContractInput | null = null;
    if (Object.keys(errors).length === 0 || (payType && timeBasis && typeof amount === 'number')) {
      const ok = validateContract({ payType, timeBasis, amount, monthlyHours: monthlyHours ?? null, annualDivisor: annualDivisor ?? null, included: person?.contract?.included ?? {} });
      if (ok.ok) input = ok.value;
      else {
        const col: ImportCol = ok.code === 'contract_amount' ? 'amount' : ok.code === 'contract_monthly_hours' ? 'monthlyHours' : ok.code === 'contract_annual_divisor' ? 'annualDivisor' : ok.code === 'contract_time_basis' ? 'timeBasis' : 'payType';
        errors[col] ??= ok.code;
      }
    }
    const c = person?.contract;
    const changed = !!input && (!c || c.payType !== input.payType || c.amount !== input.amount || c.timeBasis !== input.timeBasis || c.monthlyHours !== input.monthlyHours || c.annualDivisor !== input.annualDivisor);
    out.push({ row: i, employeeNo: no, name: person?.name ?? v('name'), employeeId: person?.id ?? null, input: Object.keys(errors).length ? null : input, errors, changed: Object.keys(errors).length === 0 && changed, expectedVersion: person?.version ?? 0 });
  });
  return out;
}

/** 엑셀 파일 → 머리 행 다음의 행들 (머리 행 = 첫 칸이 사번 머리인 줄) */
export async function sheetRows(buf: ArrayBuffer, L: ImportLabels): Promise<unknown[][] | null> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf);
  } catch {
    return null;
  }
  const ws = wb.worksheets[0];
  if (!ws) return null;
  const all: unknown[][] = [];
  ws.eachRow({ includeEmpty: true }, (row) => all.push((row.values as unknown[]).slice(1)));
  const h = all.findIndex((r) => cellText(r[0]) === L.cols.employeeNo);
  return h < 0 ? null : all.slice(h + 1);
}
