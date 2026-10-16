// 게시판 글 올리기 — 로그인한 직원 누구나 (2026-10-16)
import { api, ApiError, readJson } from '@/lib/api';
import { getMe } from '@/lib/auth';
import { createBoardPost } from '@/lib/board';

export const POST = api('board.create', async (req) => {
  const me = await getMe();
  if (!me) throw new ApiError(401, 'not_signed_in');
  return { id: await createBoardPost(me, await readJson(req)) };
});
