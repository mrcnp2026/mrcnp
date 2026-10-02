// 공지 고치기. 게시 뒤에는 mode: 'typo'(오타 수정 — 판 유지) | 'reshow'(내용 변경 — 판 +1, 모두 다시 확인). 기본은 reshow (요점 15)
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { parseNoticeInput } from '@/lib/notice-input';
import { getNotice, saveNotice } from '@/lib/notices';

export const POST = api<{ params: Promise<{ id: string }> }>('admin.notices.update', async (req, ctx) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const { id } = await ctx.params;
  if (!(await getNotice(id))) throw new ApiError(404, 'not_found');
  const b = await readJson(req);
  await saveNotice(id, parseNoticeInput(b), me.id, b.mode === 'typo' ? 'typo' : 'reshow');
  return { id };
});
