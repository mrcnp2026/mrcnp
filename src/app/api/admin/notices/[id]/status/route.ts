// 게시 · 보관 · 되살리기. 삭제는 없다 (②-0 4-13).
// 2026-11-02: 번역 확인 검사는 없앴다(번역 단계를 없앰)
import { after } from 'next/server';
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { getNotice, setStatus } from '@/lib/notices';
import { notifyNoticePublished } from '@/lib/push-events';

export const POST = api<{ params: Promise<{ id: string }> }>('admin.notices.status', async (req, ctx) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const { id } = await ctx.params;
  const got = await getNotice(id);
  if (!got) throw new ApiError(404, 'not_found');
  const { action } = await readJson(req);
  if (action === 'publish') {
    // 2026-11-02 의뢰인: 번역을 없앴다 — 게시는 기다림 없이 바로 된다(예전에는 번역을 최대 45초 기다렸고, 법적 · 급여 공지는 번역 확인 전에는 막혔다).
    // 영어로 보는 직원에게는 한국어 원문이 보인다. 예전에 만든 번역은 그대로 보인다
    await setStatus(id, 'published', me.id);
    after(() => notifyNoticePublished(id)); // 직원 폰에 제목만 (2026-10-21 의뢰인). 되살리기는 보내지 않는다 — 같은 공지는 한 번만
  } else if (action === 'archive') {
    await setStatus(id, 'archived', me.id);
  } else if (action === 'restore') {
    await setStatus(id, 'published', me.id);
  } else {
    throw new ApiError(400, 'invalid_input');
  }
  return { ok: true };
});
