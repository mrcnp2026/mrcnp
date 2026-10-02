// 게시 · 보관 · 되살리기. 삭제는 없다 (②-0 4-13).
// 게시 전 검사 (요점 9·11): 숫자 확인 필요 번역은 「확인했음」 필요, 법적·급여 관련이면 켜진 언어 번역이 전부 확인돼야 한다
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { publishBlockers } from '@/lib/notice-logic';
import { getNotice, setStatus, translationLocales } from '@/lib/notices';

export const POST = api<{ params: Promise<{ id: string }> }>('admin.notices.status', async (req, ctx) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const { id } = await ctx.params;
  const got = await getNotice(id);
  if (!got) throw new ApiError(404, 'not_found');
  const { action } = await readJson(req);
  if (action === 'publish') {
    const blockers = publishBlockers(got.notice, got.translations, translationLocales());
    if (blockers.length) throw new ApiError(409, blockers[0].startsWith('legal') ? 'notice_legal_review' : 'notice_numbers_review');
    await setStatus(id, 'published', me.id);
  } else if (action === 'archive') {
    await setStatus(id, 'archived', me.id);
  } else if (action === 'restore') {
    await setStatus(id, 'published', me.id);
  } else {
    throw new ApiError(400, 'invalid_input');
  }
  return { ok: true };
});
