// 한 달 집계 만들기 — 기록 탭 화면과 급여용 CSV가 같은 함수를 쓴다. 서버 전용.
import 'server-only';
import { OFFICE } from '@/config/office';
import { addDays } from '@/lib/calendar';
import { loadConfirms } from '@/lib/confirm-data';
import { summarizeMonth, type MonthSummary } from '@/lib/monthly';
import { daysFor, leaveDaysFor, loadPeriod, syncOvertimeRequests, workDaysFor, type PeriodData, type Person } from '@/lib/period-data';
import { toKstDate } from '@/lib/time';

export function monthRange(ym: string): { from: string; to: string } {
  const [y, m] = ym.split('-').map(Number);
  const from = `${ym}-01`;
  const to = addDays(`${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`, -1);
  return { from, to };
}

export function isYearMonth(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

/** confirmedOnly: 급여용 — 확정된 날의 기록만 센다 (의뢰인 2026-10-11). 출퇴근기록 화면의 월 집계는 넘기지 않는다 */
export async function buildMonth(ym: string, practice: boolean, opts: { confirmedOnly?: boolean } = {}): Promise<{ data: PeriodData; rows: { person: Person; summary: MonthSummary }[] }> {
  const { from, to } = monthRange(ym);
  const now = new Date();
  const today = toKstDate(now);
  const data = await loadPeriod(from, to, practice);
  // 이 달의 확인 대상 연장 요청을 먼저 맞춘다 (열 때 계산 — 예약 작업 없음)
  if (await syncOvertimeRequests(data, today < to ? today : to)) {
    Object.assign(data, await loadPeriod(from, to, practice));
  }
  const confirms = opts.confirmedOnly ? await loadConfirms(from, to, practice) : null;
  const rows: { person: Person; summary: MonthSummary }[] = [];
  if (!data.rule) return { data, rows };
  for (const p of data.people) {
    // 기록 = 찍은 원본 또는 승인된 '빠진 기록 추가'(대리 등록 포함) — 원본 없이 정정만 있는 달도 빠지지 않게
    const hasRecords =
      data.events.some((e) => e.employeeId === p.id && e.workDate >= from && e.workDate <= to) ||
      data.corrections.some((c) => c.employeeId === p.id && c.status === 'approved' && c.correctionType === 'add_missing' && c.workDate >= from && c.workDate <= to);
    if (!p.active && !hasRecords) continue; // 퇴사자는 그 달 기록이 있을 때만
    if (!p.active && p.employeeNo?.startsWith('e2e-audit')) continue; // 검사 전용 계정은 꺼져 있으면 보이지 않게 (직원 탭과 같은 규칙)
    const upTo = today < to ? today : to;
    if (upTo < from) continue;
    const days = daysFor(data, p.id, from, upTo);
    const summary = summarizeMonth({
      employeeNo: p.employeeNo,
      name: p.name,
      yearMonth: ym,
      days,
      requests: data.overtime.filter((o) => o.employeeId === p.id).map((o) => ({ ...o })),
      pendingCorrections: data.corrections.filter((c) => c.employeeId === p.id && c.status === 'pending' && c.workDate >= from && c.workDate <= to).length,
      rule: data.ruleFor(p.id, to) ?? data.rule,
      ruleAt: (d) => data.ruleFor(p.id, d),
      joinedOn: p.startsOn,
      now,
      today,
      thresholdMinutes: OFFICE.overtimeReviewThresholdMin,
      leave: leaveDaysFor(data, p.id),
      work: workDaysFor(data, p.id),
      confirmed: confirms ? new Set([...confirms.values()].filter((c) => c.employeeId === p.id).map((c) => c.workDate)) : undefined,
    });
    rows.push({ person: p, summary });
  }
  return { data, rows };
}
