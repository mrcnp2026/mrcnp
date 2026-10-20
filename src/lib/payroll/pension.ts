// 퇴직연금 DC 부담금 (묶음 32, 2026-10-20 노프로 비교). 순수 함수.
// 근로자퇴직급여보장법 제20조: DC형은 연간 임금총액의 1/12 이상을 근로자 계좌에 넣는다 → 매달 「그 달 임금총액 ÷ 12」(원 단위 반올림)로 쌓는다.
// 임금총액 = 그 달 확정한 급여명세의 지급 합계(상여 대장 포함). 실비 변상(자가운전 등) 제외 여부는 노무 확인(검증 대기 기록).
// DB형은 회사가 운용하므로 매달 부담금을 쌓지 않는다(가입 기록만).

export type PensionMember = { id: string; employeeId: string; planKind: 'DC' | 'DB'; joinedOn: string; endedOn: string | null; institution: string | null; openingBalance: number | null; openingAsOf: string | null; note: string | null; active: boolean };
export type PensionContribution = { id: string; employeeId: string; month: string; wageTotal: number; amount: number; source: 'PAYROLL' | 'MANUAL'; runId: string | null; paidOn: string | null; note: string | null };

export const contributionOf = (wageTotal: number): number => Math.round(Math.max(0, wageTotal) / 12);

/** 그 달(YYYY-MM-01)에 DC 가입 중인가 — 가입일이 그 달 말일 이전, 끝난 날이 없거나 그 달 1일 이후 */
export function inDcPlan(m: Pick<PensionMember, 'planKind' | 'joinedOn' | 'endedOn' | 'active'>, month: string): boolean {
  if (m.planKind !== 'DC' || !m.active) return false;
  const last = lastDayOf(month);
  return m.joinedOn <= last && (m.endedOn === null || m.endedOn >= month);
}
export function lastDayOf(month: string): string {
  const [y, mo] = month.slice(0, 7).split('-').map(Number);
  return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
}

/** 사람마다 적립 누계 = 처음 적립금(그 기준일 뒤의 달만 더함) + 매달 부담금 */
export function balanceOf(m: Pick<PensionMember, 'openingBalance' | 'openingAsOf'>, rows: readonly Pick<PensionContribution, 'month' | 'amount'>[]): number {
  const after = m.openingAsOf ? rows.filter((r) => lastDayOf(r.month) > m.openingAsOf!) : rows;
  return (m.openingBalance ?? 0) + after.reduce((a, r) => a + r.amount, 0);
}

export type MemberInput = { planKind: 'DC' | 'DB'; joinedOn: string; endedOn: string | null; institution: string | null; openingBalance: number | null; openingAsOf: string | null; note: string | null };
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
const optDate = (v: unknown) => (v === null || v === undefined || v === '' ? null : isDate(v) ? v : undefined);
const optText = (v: unknown, max: number) => (v === null || v === undefined || v === '' ? null : typeof v === 'string' && v.trim().length <= max ? v.trim() : undefined);
const optWon = (v: unknown) => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/,/g, '').trim()) : NaN;
  return Number.isSafeInteger(n) && n >= 0 ? n : undefined;
};
export function cleanMember(b: Record<string, unknown>): MemberInput | { error: string } {
  if (b.planKind !== 'DC' && b.planKind !== 'DB') return { error: 'pension_plan' };
  if (!isDate(b.joinedOn)) return { error: 'pension_joined' };
  const endedOn = optDate(b.endedOn), openingAsOf = optDate(b.openingAsOf), institution = optText(b.institution, 60), note = optText(b.note, 300), openingBalance = optWon(b.openingBalance);
  if (endedOn === undefined || (endedOn && endedOn < b.joinedOn)) return { error: 'pension_ended' };
  if (openingAsOf === undefined || openingBalance === undefined || (openingBalance !== null && !openingAsOf)) return { error: 'pension_opening' };
  if (institution === undefined || note === undefined) return { error: 'invalid_input' };
  return { planKind: b.planKind, joinedOn: b.joinedOn, endedOn, institution, openingBalance, openingAsOf, note };
}
