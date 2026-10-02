// 번역 초안 만들기 (Gemini). 실패해도 공지는 막지 않는다 — 결과를 언어별로 돌려준다 (요점 10)
import { api, ApiError } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { draftTranslations, getNotice } from '@/lib/notices';

// Gemini 과부하 때 재시도·대체 모델까지 기다린다 (translate.ts 예산 45초)
export const maxDuration = 60;

export const POST = api<{ params: Promise<{ id: string }> }>('admin.notices.translate', async (_req, ctx) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const { id } = await ctx.params;
  if (!(await getNotice(id))) throw new ApiError(404, 'not_found');
  return { results: await draftTranslations(id) };
});
