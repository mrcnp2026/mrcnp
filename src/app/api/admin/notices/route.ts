// 공지 새로 만들기 (임시 저장). 관리자만.
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { parseNoticeInput } from '@/lib/notice-input';
import { saveNotice } from '@/lib/notices';

export const POST = api('admin.notices.create', async (req) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const id = await saveNotice(null, parseNoticeInput(await readJson(req)), me.id);
  return { id };
});
