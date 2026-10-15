// 급여명세서 엑셀 올리기 — 회사 급여 프로그램의 엑셀(또는 CSV)을 읽어 직원마다 명세서 한 장으로 바꾼다. 순수함수 (2026-10-16 의뢰인: 명세서는 업로드 방식).
// 머리 행 = 위에서 20줄 안에 「사번」이나 「성명 · 이름」 칸이 있는 첫 줄. 그 아래 줄이 한 사람씩이다.
// 칸 종류는 머리 글자로 짐작한다(아래 단어 목록) — 관리자가 미리보기에서 칸마다 바꿀 수 있다(overrides).
//   ID 사번 · NAME 이름 · PAYMENT 지급 · DEDUCTION 공제 · TOTAL_PAY 지급 합계 · TOTAL_DED 공제 합계 · NET 실지급 · SKIP 안 씀(부서 · 직급 · 근무일수 같은 정보)
// 합계 칸이 있으면 줄마다 지급 · 공제를 더한 값과 맞는지 본다 — 다르면 그 줄은 「합계 다름」으로 막는다(칸 종류를 잘못 짐작했을 가능성이 크다).
// 금액은 원 단위 정수. 쉼표 · 「원」 · 빈칸은 지우고, 괄호나 앞의 -는 음수(연말정산 환급 같은 경우).

export const COL_KINDS = ['ID', 'NAME', 'PAYMENT', 'DEDUCTION', 'TOTAL_PAY', 'TOTAL_DED', 'NET', 'SKIP'] as const;
export type ColKind = (typeof COL_KINDS)[number];
export type SlipColumn = { index: number; header: string; kind: ColKind; guessed: boolean };
export type SlipLine = { kind: 'PAYMENT' | 'DEDUCTION'; label: string; amount: number };
export type SlipPerson = { id: string; employeeNo: string | null; name: string };
export type SlipRowError = 'unknown_employee' | 'duplicate_employee' | 'bad_amount' | 'total_mismatch' | 'net_mismatch' | 'no_amount';
export type SlipRow = {
  row: number; // 엑셀 줄 번호(1부터)
  employeeNo: string;
  name: string;
  employeeId: string | null;
  lines: SlipLine[];
  pay: number;
  deduction: number;
  net: number;
  errors: SlipRowError[];
};

const norm = (s: string) => s.replace(/[\s·.()[\]_-]/g, '');
const has = (h: string, words: readonly string[]) => words.some((w) => h.includes(w));
// 머리 글자 → 칸 종류. 앞에 있는 규칙이 먼저다(「공제합계」는 공제가 아니라 공제 합계)
const ID_WORDS = ['사번', '사원번호', '직원번호', '사원코드', '아이디'];
const NAME_WORDS = ['성명', '이름', '사원명', '직원명', '성함'];
const NET_WORDS = ['차인지급', '실지급', '실수령', '차감지급', '실지급액', '지급예정액', '실급여'];
const TOTAL_DED_WORDS = ['공제합계', '공제총액', '총공제', '공제액계', '공제계'];
const TOTAL_PAY_WORDS = ['지급합계', '지급총액', '총지급', '지급액계', '급여총액', '총급여', '지급계', '세전'];
const DED_WORDS = ['국민연금', '건강보험', '장기요양', '고용보험', '산재', '소득세', '주민세', '공제', '가불', '상조', '회비', '사우회', '조합비', '연말정산', '정산', '대출', '차감', '기부', '보험료', '원천'];
const PAY_WORDS = ['급', '수당', '상여', '보너스', '성과', '인센티브', '식대', '식비', '교통', '차량', '보조', '장려', '포상', '지원'];
// 분명히 돈이 아닌 칸(「직급」 · 「지급일」처럼 「급」이 들어가도) — 지급 · 공제보다 먼저 본다
const INFO_WORDS = ['부서', '소속', '직급', '직위', '직책', '직무', '입사', '퇴사', '생년', '주민등록', '비고', '계좌', '은행', '지급일', '급여일', '귀속', '연월', '순번', '근무형태', '구분'];
// 돈이 아닐 가능성이 큰 칸(「시간외수당」은 앞의 「수당」으로 이미 지급)
const SKIP_WORDS = ['코드', '번호', '일수', '시간', '시수', '율', '률', 'No', 'NO'];

export function guessKind(header: string): ColKind | null {
  const h = norm(header);
  if (!h) return 'SKIP';
  if (has(h, ID_WORDS)) return 'ID';
  if (has(h, NAME_WORDS)) return 'NAME';
  if (has(h, NET_WORDS)) return 'NET';
  if (has(h, TOTAL_DED_WORDS)) return 'TOTAL_DED';
  if (has(h, TOTAL_PAY_WORDS)) return 'TOTAL_PAY';
  if (has(h, INFO_WORDS)) return 'SKIP';
  if (has(h, DED_WORDS)) return 'DEDUCTION';
  if (has(h, PAY_WORDS)) return 'PAYMENT';
  if (has(h, SKIP_WORDS)) return 'SKIP';
  return null; // 모르는 칸 — 숫자면 지급으로 짐작하고 「짐작」 표시
}

export function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if ('result' in o) return cellText(o.result);
    if ('text' in o) return cellText(o.text);
    if (Array.isArray(o.richText)) return (o.richText as { text?: string }[]).map((x) => x.text ?? '').join('').trim();
    return '';
  }
  return String(v).trim();
}

/** 금액 칸 → 원 단위 정수. 비어 있으면 0, 숫자가 아니면 null */
export function toWon(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : null;
  let s = cellText(v).replace(/[,\s원₩]/g, '');
  if (s === '' || s === '-') return 0;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.startsWith('△') || s.startsWith('▲')) { neg = true; s = s.slice(1); }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Math.round(Number(s));
  return neg ? -n : n;
}

/** 머리 행 찾기 — 위에서 20줄 안에 사번이나 이름 칸이 있는 첫 줄 */
export function findHeader(rows: readonly unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const kinds = rows[i].map((c) => guessKind(cellText(c)));
    if (kinds.includes('ID') || kinds.includes('NAME')) return i;
  }
  return -1;
}

export function readColumns(rows: readonly unknown[][], header: number, overrides: Record<number, ColKind> = {}): SlipColumn[] {
  const head = rows[header] ?? [];
  const body = rows.slice(header + 1);
  const width = Math.max(head.length, ...body.map((r) => r.length));
  const cols: SlipColumn[] = [];
  for (let i = 0; i < width; i++) {
    const h = cellText(head[i]);
    let kind = guessKind(h);
    let guessed = false;
    if (kind === null) {
      // 모르는 머리: 값이 모두 숫자(또는 비어 있음)면 지급으로 짐작, 아니면 안 씀
      const vals = body.map((r) => r[i]).filter((v) => cellText(v) !== '');
      kind = vals.length > 0 && vals.every((v) => toWon(v) !== null) ? 'PAYMENT' : 'SKIP';
      guessed = true;
    }
    if (!h && kind === 'SKIP' && body.every((r) => cellText(r[i]) === '')) continue; // 완전히 빈 칸
    const o = overrides[i];
    cols.push({ index: i, header: h, kind: o && (COL_KINDS as readonly string[]).includes(o) ? o : kind, guessed: o ? false : guessed });
  }
  return cols;
}

const TOTAL_ROW = /^(합계|총계|소계|계|total)$/i;

export function readSlipRows(rows: readonly unknown[][], header: number, cols: readonly SlipColumn[], people: readonly SlipPerson[]): SlipRow[] {
  const idCol = cols.find((c) => c.kind === 'ID');
  const nameCol = cols.find((c) => c.kind === 'NAME');
  const of = (k: ColKind) => cols.filter((c) => c.kind === k);
  const byNo = new Map(people.filter((p) => p.employeeNo).map((p) => [p.employeeNo!.trim(), p]));
  const byName = new Map<string, SlipPerson[]>();
  for (const p of people) byName.set(p.name.trim(), [...(byName.get(p.name.trim()) ?? []), p]);
  const out: SlipRow[] = [];
  rows.slice(header + 1).forEach((r, k) => {
    const no = idCol ? cellText(r[idCol.index]) : '';
    const name = nameCol ? cellText(r[nameCol.index]) : '';
    if (!no && !name) return; // 빈 줄
    if (TOTAL_ROW.test(norm(no)) || TOTAL_ROW.test(norm(name))) return; // 합계 줄
    const errors: SlipRowError[] = [];
    // 사번이 맞으면 그 사람, 아니면 이름이 한 사람에게만 맞을 때 그 사람
    const sameName = name ? byName.get(name) : undefined;
    const person = (no ? byNo.get(no) : undefined) ?? (sameName?.length === 1 ? sameName[0] : undefined);
    if (!person) errors.push('unknown_employee');
    const lines: SlipLine[] = [];
    let bad = false;
    for (const c of [...of('PAYMENT'), ...of('DEDUCTION')]) {
      const v = toWon(r[c.index]);
      if (v === null) { bad = true; continue; }
      if (v !== 0) lines.push({ kind: c.kind as 'PAYMENT' | 'DEDUCTION', label: c.header || `#${c.index + 1}`, amount: v });
    }
    if (bad) errors.push('bad_amount');
    const pay = lines.filter((l) => l.kind === 'PAYMENT').reduce((a, l) => a + l.amount, 0);
    const deduction = lines.filter((l) => l.kind === 'DEDUCTION').reduce((a, l) => a + l.amount, 0);
    const net = pay - deduction;
    const total = (k2: ColKind) => { const c = of(k2)[0]; return c ? toWon(r[c.index]) : undefined; };
    const tp = total('TOTAL_PAY');
    const td = total('TOTAL_DED');
    const tn = total('NET');
    if ((tp !== undefined && tp !== pay) || (td !== undefined && td !== deduction)) errors.push('total_mismatch');
    if (tn !== undefined && tn !== net) errors.push('net_mismatch');
    if (lines.length === 0) errors.push('no_amount');
    out.push({ row: header + 2 + k, employeeNo: no || person?.employeeNo || '', name: name || person?.name || '', employeeId: person?.id ?? null, lines, pay, deduction, net, errors });
  });
  // 한 파일에 같은 직원이 두 번
  const seen = new Map<string, number>();
  for (const x of out) if (x.employeeId) seen.set(x.employeeId, (seen.get(x.employeeId) ?? 0) + 1);
  for (const x of out) if (x.employeeId && (seen.get(x.employeeId) ?? 0) > 1 && !x.errors.includes('duplicate_employee')) x.errors.push('duplicate_employee');
  return out;
}

/** CSV 글자 → 행들 (따옴표 · 줄바꿈 포함 칸 지원) */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/** 양식 엑셀의 머리 — 회사 엑셀이 따로 있으면 그대로 올려도 된다(머리 글자로 칸을 짐작한다) */
export const TEMPLATE_HEADERS = ['사번', '성명', '기본급', '연장근로수당', '야간근로수당', '휴일근로수당', '식대', '상여금', '국민연금', '건강보험', '장기요양보험', '고용보험', '소득세', '지방소득세', '지급합계', '공제합계', '차인지급액'] as const;
