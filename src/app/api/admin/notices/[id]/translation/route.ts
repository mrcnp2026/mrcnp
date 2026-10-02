// 번역 직접 입력·고치기·「확인했음」. 관리자가 고치면 source='human' (요점 12)
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { getNotice, saveTranslation, translationLocales } from '@/lib/notices';
import { cleanText } from '@/lib/text';

export const POST = api<{ params: Promise<{ id: string }> }>('admin.notices.translation', async (req, ctx) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const { id } = await ctx.params;
  const got = await getNotice(id);
  if (!got) throw new ApiError(404, 'not_found');
  const b = await readJson(req);
  const locale = String(b.locale);
  if (!(translationLocales() as string[]).includes(locale)) throw new ApiError(400, 'invalid_input');
  const title = cleanText(b.title);
  const body = cleanText(b.body);
  if (!title || !body) throw new ApiError(400, 'invalid_input');
  const prev = got.translations.find((t) => t.locale === locale);
  const edited = !prev || prev.title !== title || prev.body !== body;
  await saveTranslation(id, locale, { title, body, reviewed: b.reviewed === true, source: edited ? 'human' : prev.source }, got.notice.version, {
    title: got.notice.title,
    body: got.notice.body,
  });
  return { ok: true };
});
