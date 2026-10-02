// 직원 「확인」 — 판 번호와 보여 준 언어를 남긴다 (요점 22). 본인 대상·게시 중인 공지만
import { api, ApiError, readJson } from '@/lib/api';
import { getMe } from '@/lib/auth';
import { confirmNotice, visibleNoticesFor } from '@/lib/notices';

export const POST = api<{ params: Promise<{ id: string }> }>('notices.confirm', async (req, ctx) => {
  const me = await getMe();
  if (!me) throw new ApiError(401, 'not_signed_in');
  const { id } = await ctx.params;
  const { locale } = await readJson(req);
  const mine = (await visibleNoticesFor(me.id, typeof locale === 'string' ? locale : 'ko', new Date())).find((n) => n.id === id);
  if (!mine) throw new ApiError(404, 'not_found');
  // 판 번호는 서버가 지금 판으로 정한다 (요청 본문의 판을 믿지 않는다)
  await confirmNotice(id, mine.version, mine.display.locale, me.id);
  return { ok: true };
});
