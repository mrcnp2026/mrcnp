// 게시 · 보관 · 되살리기. 삭제는 없다 (②-0 4-13).
// 게시 전 검사 (요점 9·11): 숫자 확인 필요 번역은 「확인했음」 필요, 법적·급여 관련이면 켜진 언어 번역이 전부 확인돼야 한다
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { publishBlockers } from '@/lib/notice-logic';
import { draftTranslations, getNotice, setStatus, translationLocales } from '@/lib/notices';

// 게시할 때 번역까지 기다린다 (translate.ts 예산 45초)
export const maxDuration = 60;

export const POST = api<{ params: Promise<{ id: string }> }>('admin.notices.status', async (req, ctx) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const { id } = await ctx.params;
  let got = await getNotice(id);
  if (!got) throw new ApiError(404, 'not_found');
  const { action } = await readJson(req);
  if (action === 'publish') {
    // 게시하면 번역은 자동으로 (2026-10-06 의뢰인: 「번역 초안 만들기」를 따로 누르게 하지 말 것 — 언어를 바꾸면 번역된 공지가 보여야 한다).
    // 켜진 언어 중 번역이 없거나 본문이 바뀌어 낡은 것이 있을 때만 다시 번역한다 (전부 최신이면 사람이 고쳐 확인한 번역을 그대로 둔다).
    // 번역이 실패해도 게시는 막지 않는다 — 그 언어는 한국어 원문으로 보인다 (요점 10)
    const stale = translationLocales().some((loc) => {
      const t = got!.translations.find((x) => x.locale === loc);
      return !t || t.basedOnVersion < got!.notice.version;
    });
    if (stale) {
      await draftTranslations(id);
      got = (await getNotice(id))!;
    }
    // 기계 번역의 숫자 대조는 게시를 막지 않는다 — "10월 7일"→"October 7"처럼 달 이름만 바뀌어도 걸려서, 자동 번역 흐름에서는 일반 공지가 번번이 막혔다 (2026-10-06).
    // 사람이 고친 번역의 숫자가 원문과 다르면 지금처럼 막는다(「확인했음」 필요). 법적·급여 공지도 지금처럼 사람이 확인해야 게시된다.
    // 편집 화면의 「숫자 확인 필요」 표시와 직원 화면의 「참고용 번역」 안내는 그대로 둔다
    const machine = new Set(got.translations.filter((x) => x.source === 'machine').map((x) => x.locale));
    const blockers = publishBlockers(got.notice, got.translations, translationLocales()).filter((b) => !(b.startsWith('numbers:') && machine.has(b.slice(8))));
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
