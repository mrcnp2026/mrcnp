// 지난 달 근태 리포트는 10분 동안 보관해 두고 다시 쓴다 (2026-10-28 속도: 연간 리포트 12초 · 근태 리포트 6개월 추이가 늦었다 —
// 열 때마다 지난 달까지 처음부터 다시 셌다). 지난 달은 거의 바뀌지 않는다. 이번 달은 늘 새로 센다.
// · 보는 사람의 권한 범위(지점관리자면 맡은 직원)를 보관 이름에 넣는다 — 사람마다 다른 범위가 섞이지 않게
// · 보관 · 새로 고침이 실패하면(로그인 정보를 못 읽는 등) 그 자리에서 새로 센다 — 값이 비는 일이 없게
import { unstable_cache } from 'next/cache';
import { buildAttendanceDeptReport, type AttReport } from '@/lib/report-attendance';
import { viewerScope } from '@/lib/scope';
import { toKstDate } from '@/lib/time';

type Args = { ym: string; practice: boolean; groupId: string | null; basis: 'at_month_end' | 'current'; withDays?: boolean; employeeId?: string };

const cached = unstable_cache(
  async (ym: string, practice: boolean, groupId: string | null, basis: Args['basis'], withDays: boolean, employeeId: string | null, scopeKey: string): Promise<AttReport> => {
    void scopeKey; // 보관 이름에만 쓴다
    return buildAttendanceDeptReport({ ym, practice, groupId, basis, withDays, employeeId: employeeId ?? undefined });
  },
  ['att-month-report-v1'],
  { revalidate: 600 },
);

export async function monthReport(args: Args): Promise<AttReport> {
  if (args.ym >= toKstDate(new Date()).slice(0, 7)) return buildAttendanceDeptReport(args);
  const scope = await viewerScope();
  const scopeKey = scope ? [...scope].sort().join(',') : 'all';
  return cached(args.ym, args.practice, args.groupId, args.basis, !!args.withDays, args.employeeId ?? null, scopeKey).catch(() => buildAttendanceDeptReport(args));
}
