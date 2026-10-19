// 휴가 증빙 파일 떼기 — 대기 중인 신청만, 본인 또는 처리할 수 있는 관리자. 기록에 뗀 때 · 사람이 남고 파일은 지운다.
import { api, ApiError } from '@/lib/api';
import { getMe } from '@/lib/auth';
import { removeLeaveFile } from '@/lib/leave-evidence';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST = api<{ params: Promise<{ fileId: string }> }>('leave.files.remove', async (_req, ctx) => {
  const me = await getMe();
  if (!me) throw new ApiError(401, 'not_signed_in');
  const { fileId } = await ctx.params;
  if (!UUID.test(fileId)) throw new ApiError(404, 'not_found');
  await removeLeaveFile({ me, fileId });
  return { ok: true };
});
