// 지급 · 공제 항목 엑셀 내려받기 · 올리기 (PRD v1.3 17.3, 2026-10-20 의뢰인: 만들어 줘) — 순수 계산. 화면 · 서버 · 검사가 같이 쓴다.
// 내려받은 파일에는 지금 항목이 들어 있다 → 고치거나 줄을 더해 올린다 → 줄마다 새 항목 / 바뀜 / 그대로 / 문제를 보여 주고 → 넣으면 항목마다 새 판(손으로 고칠 때와 같은 길).
// ★ 빈 칸을 0으로 바꾸지 않는다(기본 금액 빈 칸 = 「설정 필요」). 모르는 글자는 문제 줄이다. 종류(지급/공제)는 바꿀 수 없다.
import { CALC_KINDS, ORDINARY, TAX_TREATMENTS, validateItem, type ItemInput } from './settings';

export const ITEM_COLUMNS = ['code', 'kind', 'koName', 'enName', 'calcKind', 'defaultAmount', 'fixedAllowance', 'taxTreatment', 'taxExemptLimit', 'taxExemptAnnualLimit', 'ordinaryWage', 'averageWageKind', 'sort', 'validFrom', 'reason'] as const;
export type ItemColumn = (typeof ITEM_COLUMNS)[number];

/** 칸에 쓰는 글자 — 코드 그대로도, 한국어 이름으로도 받는다 */
export const ITEM_WORDS = {
  kind: { PAYMENT: '지급', DEDUCTION: '공제' },
  calcKind: { FIXED: '고정 금액', MANUAL: '직접 입력', TIME: '시간 × 단가', RULE: '기준표로 계산', NOTICE: '고지 금액' },
  taxTreatment: { TAXABLE: '과세', EXEMPT: '비과세', PARTIAL: '일부 비과세', NOT_APPLICABLE: '해당 없음' },
  ordinaryWage: { INCLUDED: '포함', EXCLUDED: '제외', UNKNOWN: '모름' },
  averageWageKind: { MONTHLY: '월 임금', BONUS: '연 상여', EXCLUDED: '뺌' },
  yesNo: { YES: '예', NO: '아니오' },
} as const;

type Current = ItemInput & { version: number; validFrom: string };
export type SheetRow = Partial<Record<ItemColumn, unknown>>;
export type ItemProblem = 'bad_code' | 'bad_value' | 'kind_locked' | 'duplicate' | 'bad_date' | 'past_date';
export type ItemLine = { row: number; code: string; name: string; state: 'new' | 'changed' | 'same' | 'problem'; changes: ItemColumn[]; problem?: ItemProblem; input?: ItemInput; validFrom?: string; reason?: string | null; expectedVersion?: number };

const str = (v: unknown) => (v === null || v === undefined ? '' : String(typeof v === 'object' && v && 'text' in v ? (v as { text: unknown }).text : v).trim());
/** 코드 또는 한국어 낱말 → 코드. 모르면 undefined, 빈 칸이면 null */
function word<K extends string>(v: unknown, map: Record<K, string>): K | null | undefined {
  const s = str(v);
  if (!s) return null;
  const up = s.toUpperCase();
  if (up in map) return up as K;
  return (Object.keys(map) as K[]).find((k) => map[k] === s);
}
const dateOf = (v: unknown): string | null | undefined => {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = str(v);
  if (!s) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
};

/** 지금 판을 엑셀 한 줄로 (내려받기) */
export function itemToRow(i: ItemInput): Record<ItemColumn, string | number | null> {
  return {
    code: i.code, kind: ITEM_WORDS.kind[i.kind], koName: i.koName, enName: i.enName, calcKind: ITEM_WORDS.calcKind[i.calcKind], defaultAmount: i.defaultAmount,
    fixedAllowance: i.fixedAllowance ? ITEM_WORDS.yesNo.YES : ITEM_WORDS.yesNo.NO, taxTreatment: ITEM_WORDS.taxTreatment[i.taxTreatment], taxExemptLimit: i.taxExemptLimit, taxExemptAnnualLimit: i.taxExemptAnnualLimit ?? null,
    ordinaryWage: ITEM_WORDS.ordinaryWage[i.ordinaryWage], averageWageKind: i.averageWageKind ? ITEM_WORDS.averageWageKind[i.averageWageKind] : null, sort: i.sort, validFrom: null, reason: null,
  };
}

const SAME: (keyof ItemInput)[] = ['koName', 'enName', 'calcKind', 'defaultAmount', 'fixedAllowance', 'taxTreatment', 'taxExemptLimit', 'taxExemptAnnualLimit', 'ordinaryWage', 'averageWageKind', 'sort'];

/** 올린 줄들을 지금 항목과 견준다. rowNo는 엑셀 줄 번호(머리 줄 다음부터) */
export function readItemSheet(rows: { rowNo: number; cells: SheetRow }[], current: Current[], today: string): ItemLine[] {
  const have = new Map(current.map((c) => [c.code, c]));
  const seen = new Set<string>();
  return rows.map(({ rowNo, cells }): ItemLine => {
    const code = str(cells.code).toUpperCase();
    const name = str(cells.koName) || code;
    const no = (problem: ItemProblem): ItemLine => ({ row: rowNo, code, name, state: 'problem', changes: [], problem });
    if (!/^[A-Z0-9_]{2,40}$/.test(code)) return no('bad_code');
    if (seen.has(code)) return no('duplicate');
    seen.add(code);
    const kind = word(cells.kind, ITEM_WORDS.kind), calcKind = word(cells.calcKind, ITEM_WORDS.calcKind);
    const taxTreatment = word(cells.taxTreatment, ITEM_WORDS.taxTreatment), ordinaryWage = word(cells.ordinaryWage, ITEM_WORDS.ordinaryWage), fixed = word(cells.fixedAllowance, ITEM_WORDS.yesNo);
    // 「평균임금 구분」 칸이 아예 없는 예전 엑셀은 지금 값을 그대로 둔다(빈 칸으로 지우지 않는다). 칸이 있는데 비어 있으면 「정하지 않음」
    const averageCell = cells.averageWageKind === undefined ? (have.get(code)?.averageWageKind ?? null) : word(cells.averageWageKind, ITEM_WORDS.averageWageKind);
    if (kind === undefined || calcKind === undefined || taxTreatment === undefined || ordinaryWage === undefined || fixed === undefined || averageCell === undefined) return no('bad_value');
    const v = validateItem({
      code, kind, koName: str(cells.koName), enName: str(cells.enName), calcKind, defaultAmount: str(cells.defaultAmount), taxTreatment: kind === 'DEDUCTION' ? 'NOT_APPLICABLE' : taxTreatment,
      taxExemptLimit: str(cells.taxExemptLimit), taxExemptAnnualLimit: str(cells.taxExemptAnnualLimit), ordinaryWage: ordinaryWage ?? 'UNKNOWN', averageWageKind: kind === 'DEDUCTION' ? null : averageCell, sort: str(cells.sort), fixedAllowance: fixed === 'YES',
    });
    if (!v.ok) return no('bad_value');
    if (!(CALC_KINDS as readonly string[]).includes(v.value.calcKind) || !(TAX_TREATMENTS as readonly string[]).includes(v.value.taxTreatment) || !(ORDINARY as readonly string[]).includes(v.value.ordinaryWage)) return no('bad_value');
    const validFrom = dateOf(cells.validFrom);
    if (validFrom === undefined) return no('bad_date');
    const from = validFrom ?? today;
    const reason = str(cells.reason).slice(0, 500) || null;
    const cur = have.get(code);
    if (!cur) return { row: rowNo, code, name: v.value.koName, state: 'new', changes: [], input: v.value, validFrom: from, reason, expectedVersion: 0 };
    if (cur.kind !== v.value.kind) return no('kind_locked');
    const changes = SAME.filter((k) => (cur[k] ?? null) !== (v.value[k] ?? null)) as ItemColumn[];
    if (!changes.length) return { row: rowNo, code, name: v.value.koName, state: 'same', changes: [] };
    if (from < cur.validFrom) return no('past_date'); // 지금 판보다 앞선 날짜로는 새 판을 만들 수 없다
    return { row: rowNo, code, name: v.value.koName, state: 'changed', changes, input: v.value, validFrom: from, reason, expectedVersion: cur.version };
  });
}
