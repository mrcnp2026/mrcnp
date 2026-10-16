// 게시판 글 고치기(쓴 사람만) · 지우기(쓴 사람 · 관리자) — 2026-10-16
import { api, ApiError, readJson } from '@/lib/api';
import { getMe } from '@/lib/auth';
import { deleteBoardPost, updateBoardPost } from '@/lib/board';

export const PUT = api<{ params: Promise<{ id: string }> }>('board.update', async (req, ctx) => {
  const me = await getMe();
  if (!me) throw new ApiError(401, 'not_signed_in');
  await updateBoardPost(me, (await ctx.params).id, await readJson(req));
  return { ok: true };
});

export const DELETE = api<{ params: Promise<{ id: string }> }>('board.delete', async (_req, ctx) => {
  const me = await getMe();
  if (!me) throw new ApiError(401, 'not_signed_in');
  await deleteBoardPost(me, (await ctx.params).id);
  return { ok: true };
});
