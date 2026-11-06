// 지난 달 근태 리포트는 10분 동안 보관해 두고 다시 쓴다 (2026-10-28 속도: 연간 리포트 12초 · 근태 리포트 6개월 추이가 늦었다 —
// 열 때마다 지난 달까지 처음부터 다시 셌다). 지난 달은 거의 바뀌지 않는다. 이번 달은 늘 새로 센다.
// · 보는 사람(id)을 보관 이름에 넣는다 — 권한 범위(지점관리자면 맡은 직원) · 검사 계정 보기가 사람마다 달라 섞이지 않게
// · 실패하면 보관하지 않고 그 자리에서 새로 센다 — 값이 비는 일이 없게
// 2026-11-06: 예전 unstable_cache는 안에서 로그인 정보(cookies)를 읽어 매번 실패 → 늘 새로 셌다(보관이 한 번도 안 됨). 서버 메모리 보관으로 바꿈
// shortcut: 서버 한 대의 메모리에만 보관(Vercel 인스턴스가 바뀌면 처음부터 다시 센다), 여러 대에 나눠 쓸 만큼 붐비면 DB 보관으로
import { getMe } from '@/lib/auth';
import { buildAttendanceDeptReport, type AttReport } from '@/lib/report-attendance';
import { toKstDate } from '@/lib/time';

type Args = { ym: string; practice: boolean; groupId: string | null; basis: 'at_month_end' | 'current'; withDays?: boolean; employeeId?: string };

const KEEP_MS = 600_000;
const kept = new Map<string, { at: number; report: Promise<AttReport> }>();

export async function monthReport(args: Args): Promise<AttReport> {
  if (args.ym >= toKstDate(new Date()).slice(0, 7)) return buildAttendanceDeptReport(args);
  const me = await getMe();
  const key = JSON.stringify([me?.id ?? null, args.ym, args.practice, args.groupId, args.basis, !!args.withDays, args.employeeId ?? null]);
  const hit = kept.get(key);
  if (hit && Date.now() - hit.at < KEEP_MS) return hit.report;
  const report = buildAttendanceDeptReport(args);
  if (kept.size > 200) kept.clear(); // 메모리가 끝없이 늘지 않게
  kept.set(key, { at: Date.now(), report });
  report.catch(() => kept.delete(key));
  return report;
}
