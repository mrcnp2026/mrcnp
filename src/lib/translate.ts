// 공지 번역 초안 (②-5 7-15 요점 9~10). 서버 전용. 키·모델 이름은 열쇠 파일에서만 읽는다 (코드에 박지 않는다).
// 실패해도 공지를 막지 않는다 — 실패를 돌려주면 화면이 "영어 직접 입력 / 한국어로만 게시"를 고르게 한다 (B-36).
// 과부하(503)는 흔하다 → 재시도 후 GEMINI_TRANSLATE_FALLBACK_MODELS(쉼표 목록)로 넘어간다 (gemini-retry.ts).
import 'server-only';
import { LOCALE_NAMES, type Locale } from '@/i18n/locales';
import { callWithFallback, modelList } from '@/lib/gemini-retry';

export type TranslationDraft = { ok: true; title: string; body: string } | { ok: false; reason: 'no_key' | 'failed' | 'bad_shape' };

const BAD_SHAPE = 'error' as const; // 200인데 모양이 틀림 — 다시 해볼 만하다

export async function translateNotice(src: { title: string; body: string }, locale: Exclude<Locale, 'ko'>): Promise<TranslationDraft> {
  const key = process.env.GEMINI_API_KEY;
  const models = modelList(process.env.GEMINI_TRANSLATE_MODEL, process.env.GEMINI_TRANSLATE_FALLBACK_MODELS);
  if (!key || models.length === 0) return { ok: false, reason: 'no_key' };
  const prompt =
    `Translate this Korean workplace notice into ${LOCALE_NAMES[locale]} (${locale}). ` +
    'Keep the meaning exactly. Do not add or remove anything. Keep every number, date, time, amount and person name exactly as in the original. ' +
    'Keep line breaks. Return JSON {"title": string, "body": string}.\n\n' +
    JSON.stringify({ title: src.title, body: src.body });
  let sawBadShape = false;

  const r = await callWithFallback<{ title: string; body: string }>(models, async (model) => {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: { type: 'OBJECT', properties: { title: { type: 'STRING' }, body: { type: 'STRING' } }, required: ['title', 'body'] },
          temperature: 0,
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { ok: false, status: res.status };
    const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const parsed = parseDraft(j.candidates?.[0]?.content?.parts?.[0]?.text);
    if (!parsed) {
      sawBadShape = true;
      return { ok: false, status: BAD_SHAPE };
    }
    return { ok: true, value: parsed };
  });

  if (r.ok) {
    if (r.attempts.length) console.warn(JSON.stringify({ route: 'notices.translate', code: 'TRANSLATION_RETRIED', model: r.model, attempts: r.attempts }));
    return { ok: true, ...r.value };
  }
  console.error(JSON.stringify({ route: 'notices.translate', code: 'TRANSLATION_GAVE_UP', attempts: r.attempts })); // 본문은 남기지 않는다
  return { ok: false, reason: sawBadShape && r.attempts.every((a) => a.status === 'error') ? 'bad_shape' : 'failed' };
}

/** 모양 검사: { title, body } 비지 않은 문자열이 아니면 저장하지 않는다 (요점 9) */
function parseDraft(text: string | undefined): { title: string; body: string } | null {
  if (!text) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const { title, body } = parsed as Record<string, unknown>;
  if (typeof title !== 'string' || typeof body !== 'string' || !title.trim() || !body.trim()) return null;
  return { title: title.trim(), body: body.trim() };
}
