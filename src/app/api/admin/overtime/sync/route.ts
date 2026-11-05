// 연장근로 확인을 기간 전체로 맞추기 — 관리자만. 엑셀로 기록을 갱신한 뒤(scripts/import-followup.mts ①)에 부른다 (2026-10-19).
// 예전에는 달 집계 화면을 열어서 맞췄다. { from, to } — 최대 92일
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { addDays } from '@/lib/calendar';
import { OFFICE } from '@/config/office';
import { syncOvertimeRange } from '@/lib/period-data';
import { createAdminClient } from '@/lib/supabase/admin';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const maxDuration = 300; // 직원 · 기록이 늘어도 시간 제한에 조용히 끊기지 않게 (2026-11-04, Fluid는 실제 계산 시간만 과금)

export const POST = api('admin.overtime.sync', async (req) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const b = await readJson(req);
  if (typeof b.from !== 'string' || typeof b.to !== 'string' || !DAY.test(b.from) || !DAY.test(b.to) || b.from > b.to || addDays(b.from, 92) < b.to) throw new ApiError(400, 'invalid_input');
  // recheck: 이관 기준일 전 날짜도 지금 규칙으로 다시 계산한다(새벽 정기 작업은 건너뜀) — 계산 규칙을 바로잡은 뒤 지난 달을 맞출 때 (2026-11-05 의뢰인: 10월을 새 계산으로)
  let only: Set<string> | undefined;
  if (b.recheck === true) {
    const { data, error } = await createAdminClient().from('profiles').select('id');
    if (error) throw new Error(`overtime.sync.people: ${error.code}`);
    only = new Set((data ?? []).map((p) => p.id as string));
  }
  return { changed: await syncOvertimeRange(b.from, b.to, OFFICE.practiceMode, only) };
});
