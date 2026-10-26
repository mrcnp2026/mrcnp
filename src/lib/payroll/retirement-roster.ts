// 퇴직급여 › 직원별 예상 퇴직금 (2026-10-25 의뢰인: 직원이 스스로 조회하지 않고, 관리자가 직원 목록에서 눌러 본다). 서버 전용.
// 「오늘 그만둔다면」의 참고값이다 — 저장하지 않고 열 때마다 다시 계산한다(퇴직 정산 · 중간정산 기록과 다르다).
// 3개월 임금의 출처 두 가지:
//   ① 실제 급여 — 지난 석 달(이번 달 제외)을 확정한 급여대장에서 읽는다 (퇴직 정산 기록을 만들 때와 같은 자료).
//   ② 계약 기준 참고 — 확정한 급여가 석 달 다 없으면 지금 계약으로 참고로 계산한다(월급 × 3, 연봉은 ÷ 나누는 수 × 3). 시급제는 참고하지 않는다.
//   ②는 실제 지급액과 다를 수 있다(연장 · 상여 등이 빠진다) — 화면에 「참고」으로 따로 표시하고, 기록을 만들 때는 실제 값으로 다시 확인한다.
import 'server-only';
import { calcRetirement, type RetirementInput, type RetirementResult } from './retirement';
import { suggestInput } from './retirement-data';
import { loadStaffPayBoard, type StaffPayLine } from './staff-data';
import { addDays } from '@/lib/calendar';

export type EstimateBasis = 'actual' | 'contract' | 'none';
export type RosterEstimate = {
  employeeId: string; name: string; employeeNo: string | null; groupId: string | null; active: boolean;
  periodFrom: string | null; basis: EstimateBasis; input: RetirementInput; result: RetirementResult; months: string[];
};

/** 이번 달 1일의 전날 = 지난달 마지막 날 */
const prevMonthEnd = (today: string) => addDays(`${today.slice(0, 7)}-01`, -1);

/** 계약으로 참고로 계산한 3개월 임금. 월급 · 연봉만 — 시급제 · 계약 없음은 null */
export function contractWage3m(c: Pick<NonNullable<StaffPayLine['contract']>, 'payType' | 'amount' | 'annualDivisor'> | null): number | null {
  if (!c) return null;
  if (c.payType === 'MONTHLY') return c.amount * 3;
  if (c.payType === 'ANNUAL' && c.annualDivisor) return Math.round((c.amount / c.annualDivisor) * 3);
  return null;
}

async function one(line: StaffPayLine, today: string, practice: boolean): Promise<RosterEstimate> {
  const s = await suggestInput({ employeeId: line.employeeId, lastDay: prevMonthEnd(today), practice });
  let input: RetirementInput = { ...s.input, periodTo: today }; // 석 달은 지난달 말까지, 근속은 오늘까지
  let basis: EstimateBasis = s.sources.wageComplete ? 'actual' : 'none';
  if (!s.sources.wageComplete) {
    const wage = contractWage3m(line.contract);
    if (wage !== null) {
      input = { ...input, wage3m: wage };
      basis = 'contract';
    }
  }
  return { employeeId: line.employeeId, name: line.name, employeeNo: line.employeeNo, groupId: line.groupId, active: line.active, periodFrom: input.periodFrom, basis, input, result: calcRetirement(input), months: s.sources.wageMonths };
}

/** 켜져 있는 직원 전원(또는 퇴사자까지)의 예상 퇴직금 */
export async function rosterEstimates(today: string, practice: boolean, includeInactive = false): Promise<RosterEstimate[]> {
  const lines = (await loadStaffPayBoard(today)).filter((l) => includeInactive || l.active);
  return Promise.all(lines.map((l) => one(l, today, practice)));
}

export async function estimateOf(employeeId: string, today: string, practice: boolean): Promise<RosterEstimate | null> {
  const line = (await loadStaffPayBoard(today)).find((l) => l.employeeId === employeeId);
  return line ? one(line, today, practice) : null;
}
