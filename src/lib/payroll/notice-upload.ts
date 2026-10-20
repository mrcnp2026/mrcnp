// 공단 고지서 엑셀 올리기 (2026-10-20 노프로 비교). 순수 함수 — 서버(파일 읽기)와 화면(열 고르기 · 직원 찾기)이 같이 쓴다.
// 공단 양식을 아직 받지 못했다(결정 사항 급여-38) → 어떤 양식이 와도 쓰도록: 머리 줄을 찾아 열 이름을 보이고, 담당자가 「이름 · 근로자 고지액」 열을 고른다.
// 직원은 사번이 있으면 사번, 없으면 이름(같은 이름이 둘이면 찾지 않음)으로 찾는다. 주민번호는 쓰지 않는다(우리는 모으지 않는다).
export type Insurer = 'NP' | 'HI' | 'EI' | 'IA';
export type NoticeSheet = { headers: string[]; rows: string[][] };
export type NoticeMapping = { name: number | null; employeeNo: number | null; employee: number | null; employer: number | null; extra: number | null };
export type NoticePerson = { id: string; name: string; employeeNo: string | null };
export type NoticeMatch = { row: number; label: string; employeeId: string | null; employee: number | null; employer: number | null; problem: 'no_person' | 'same_name' | 'no_amount' | 'duplicate' | null };

export const cellText = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[] };
    if (o.richText) return o.richText.map((r) => r.text).join('').trim();
    return cellText(o.result ?? o.text ?? '');
  }
  return String(v).trim();
};

const NAME = /^(성명|이름|가입자명|근로자명|피보험자명|사원명)$/;
/** 머리 줄 = 이름 열이 있는 첫 줄. 없으면 글자 칸이 가장 많은 앞쪽 줄 */
export function noticeSheet(all: readonly unknown[][]): NoticeSheet | null {
  const rows = all.map((r) => r.map(cellText));
  let h = rows.findIndex((r) => r.some((c) => NAME.test(c.replace(/\s/g, ''))));
  if (h < 0) {
    let best = -1, bestN = 1;
    rows.slice(0, 15).forEach((r, i) => { const n = r.filter((c) => c && !/^[\d,.\s-]+$/.test(c)).length; if (n > bestN) { best = i; bestN = n; } });
    h = best;
  }
  if (h < 0) return null;
  const width = Math.max(...rows.slice(h).map((r) => r.length));
  const pad = (r: string[]) => Array.from({ length: width }, (_, i) => r[i] ?? '');
  return { headers: pad(rows[h]), rows: rows.slice(h + 1).filter((r) => r.some((c) => c)).map(pad) };
}

/** 열 이름으로 처음 고를 열을 짐작한다 — 담당자가 바꿀 수 있다 */
export function guessMapping(insurer: Insurer, headers: readonly string[]): NoticeMapping {
  const h = headers.map((x) => x.replace(/\s/g, ''));
  const find = (re: RegExp, not?: RegExp) => { const i = h.findIndex((x) => re.test(x) && !(not && not.test(x))); return i < 0 ? null : i; };
  const name = find(NAME);
  const employeeNo = find(/사번|사원번호/);
  if (insurer === 'NP') return { name, employeeNo, employee: find(/근로자|본인|기여금/, /사용자|사업주/), employer: find(/사용자|사업주|부담금/, /근로자/), extra: null };
  if (insurer === 'HI') return { name, employeeNo, employee: find(/^산출보험료|건강.*(근로자|본인)|^건강보험료/, /요양/), employer: find(/건강.*(사용자|사업주)/), extra: find(/요양/) }; // 건강 고지액은 장기요양을 더해서 본다
  return { name, employeeNo, employee: find(/근로자|본인|피보험자부담/, /사업주|사용자/), employer: find(/사업주|사용자/), extra: null };
}

const money = (s: string): number | null => {
  const t = s.replace(/[,\s원]/g, '');
  return /^-?\d{1,12}$/.test(t) ? Number(t) : null;
};

/** 고른 열로 줄마다 직원 · 금액을 맞춘다 */
export function matchNotice(sheet: NoticeSheet, m: NoticeMapping, people: readonly NoticePerson[]): NoticeMatch[] {
  const byNo = new Map(people.filter((p) => p.employeeNo).map((p) => [p.employeeNo!, p]));
  const byName = new Map<string, NoticePerson | null>();
  for (const p of people) byName.set(p.name, byName.has(p.name) ? null : p);
  const seen = new Set<string>();
  return sheet.rows.map((r, i) => {
    const no = m.employeeNo === null ? '' : r[m.employeeNo];
    const name = m.name === null ? '' : r[m.name].replace(/\s/g, '');
    const label = [no, name].filter(Boolean).join(' ') || (r.find((c) => c) ?? ''); // 합계 줄 등은 첫 칸 글자로 알아보게
    const base = m.employee === null ? null : money(r[m.employee]);
    const extra = m.extra === null ? 0 : (money(r[m.extra]) ?? 0);
    const employee = base === null ? null : base + extra;
    const employer = m.employer === null ? null : money(r[m.employer]);
    let p: NoticePerson | null | undefined = no ? byNo.get(no) : undefined;
    let problem: NoticeMatch['problem'] = null;
    if (!p && name) { p = byName.get(name); if (p === null) problem = 'same_name'; }
    if (!p && !problem) problem = 'no_person';
    if (!problem && employee === null) problem = 'no_amount';
    if (!problem && p && seen.has(p.id)) problem = 'duplicate';
    if (p && !problem) seen.add(p.id);
    return { row: i + 1, label, employeeId: p ? p.id : null, employee, employer, problem };
  });
}
