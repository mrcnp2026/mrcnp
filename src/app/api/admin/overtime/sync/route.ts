// 연장근로 확인을 기간 전체로 맞추기 — 관리자만. 엑셀로 기록을 갱신한 뒤(scripts/import-followup.mts ①)에 부른다 (2026-10-19).
// 예전에는 달 집계 화면을 열어서 맞췄다. { from, to } — 최대 92일
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { addDays } from '@/lib/calendar';
import { syncOvertimeRange } from '@/lib/period-data';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const maxDuration = 60;

export const POST = api('admin.overtime.sync', async (req) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const b = await readJson(req);
  if (typeof b.from !== 'string' || typeof b.to !== 'string' || !DAY.test(b.from) || !DAY.test(b.to) || b.from > b.to || addDays(b.from, 92) < b.to) throw new ApiError(400, 'invalid_input');
  return { changed: await syncOvertimeRange(b.from, b.to) };
});
