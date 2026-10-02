// 한 달 집계 만들기 — 기록 탭 화면과 급여용 CSV가 같은 함수를 쓴다. 서버 전용.
import 'server-only';
import { OFFICE } from '@/config/office';
import { addDays } from '@/lib/calendar';
import { summarizeMonth, type MonthSummary } from '@/lib/monthly';
import { daysFor, loadPeriod, syncOvertimeRequests, type PeriodData, type Person } from '@/lib/period-data';
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

export async function buildMonth(ym: string, practice: boolean): Promise<{ data: PeriodData; rows: { person: Person; summary: MonthSummary }[] }> {
  const { from, to } = monthRange(ym);
  const now = new Date();
  const today = toKstDate(now);
  const data = await loadPeriod(from, to, practice);
  // 이 달의 확인 대상 연장 요청을 먼저 맞춘다 (열 때 계산 — 예약 작업 없음)
  if (await syncOvertimeRequests(data, today < to ? today : to)) {
    Object.assign(data, await loadPeriod(from, to, practice));
  }
  const rows: { person: Person; summary: MonthSummary }[] = [];
  if (!data.rule) return { data, rows };
  for (const p of data.people) {
    const hasRecords = data.events.some((e) => e.employeeId === p.id && e.workDate >= from && e.workDate <= to);
    if (!p.active && !hasRecords) continue; // 퇴사자는 그 달 기록이 있을 때만
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
      rule: data.rule,
      joinedOn: p.startsOn,
      now,
      today,
      thresholdMinutes: OFFICE.overtimeReviewThresholdMin,
    });
    rows.push({ person: p, summary });
  }
  return { data, rows };
}
