// 휴가 신청에 증빙 파일 붙이기 (묶음 9, 2026-10-19). 대기 중인 신청만 — 본인 또는 처리할 수 있는 관리자. 검사는 lib/leave-evidence.ts
import { api, ApiError } from '@/lib/api';
import { getMe } from '@/lib/auth';
import { addLeaveFile } from '@/lib/leave-evidence';

export const maxDuration = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST = api<{ params: Promise<{ id: string }> }>('leave.files.add', async (req, ctx) => {
  const me = await getMe();
  if (!me) throw new ApiError(401, 'not_signed_in');
  const { id } = await ctx.params;
  if (!UUID.test(id)) throw new ApiError(404, 'not_found');
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) throw new ApiError(400, 'invalid_input');
  return addLeaveFile({ me, requestId: id, file });
});
