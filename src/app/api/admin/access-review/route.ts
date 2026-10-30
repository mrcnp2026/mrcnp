// 접속 기록 「이번 달 점검함」 (2026-10-29 남은 일 9-5) — 최고관리자가 접속 · 내려받기 · 변경 기록을 살펴봤다고 남긴다.
import { api, ApiError } from '@/lib/api';
import { getMe } from '@/lib/auth';
import { markAccessReviewed } from '@/lib/access-log';
import { canViewLogs } from '@/lib/log-access';

export const POST = api('admin.accessReview', async () => {
  const me = await getMe();
  if (!me || !(await canViewLogs(me))) throw new ApiError(403, 'forbidden');
  await markAccessReviewed(me.id);
  return { ok: true };
});
