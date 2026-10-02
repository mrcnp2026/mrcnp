// 지금 띄울 공지 — 직원 화면이 30초마다·화면으로 돌아올 때 묻는다 (2026-10-02 의뢰인: 게시하자마자 바로 뜨게).
// 언어는 화면의 지금 언어(상단 언어 버튼). 대상·게시 중·현재 판 미확인 판단은 서버가 한다.
import { api, ApiError, readJson } from '@/lib/api';
import { getMe } from '@/lib/auth';
import { pendingNoticesFor } from '@/lib/notices';

export const POST = api('notices.pending', async (req) => {
  const me = await getMe();
  if (!me) throw new ApiError(401, 'not_signed_in');
  const { locale } = await readJson(req);
  const list = await pendingNoticesFor(me.id, typeof locale === 'string' ? locale : me.locale);
  return { items: list.map(({ id, version, important, display, original }) => ({ id, version, important, display, original })) };
});
