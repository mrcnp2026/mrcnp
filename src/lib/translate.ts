// 공지 번역 초안 (②-5 7-15 요점 9~10). 서버 전용. 키·모델 이름은 열쇠 파일에서만 읽는다 (코드에 박지 않는다).
// 실패해도 공지를 막지 않는다 — 실패를 돌려주면 화면이 "영어 직접 입력 / 한국어로만 게시"를 고르게 한다 (B-36).
import 'server-only';
import { LOCALE_NAMES, type Locale } from '@/i18n/locales';

export type TranslationDraft = { ok: true; title: string; body: string } | { ok: false; reason: 'no_key' | 'failed' | 'bad_shape' };

export async function translateNotice(src: { title: string; body: string }, locale: Exclude<Locale, 'ko'>): Promise<TranslationDraft> {
  const key = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_TRANSLATE_MODEL;
  if (!key || !model) return { ok: false, reason: 'no_key' };
  const prompt =
    `Translate this Korean workplace notice into ${LOCALE_NAMES[locale]} (${locale}). ` +
    'Keep the meaning exactly. Do not add or remove anything. Keep every number, date, time, amount and person name exactly as in the original. ' +
    'Keep line breaks. Return JSON {"title": string, "body": string}.\n\n' +
    JSON.stringify({ title: src.title, body: src.body });
  try {
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
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return { ok: false, reason: 'failed' };
    const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = j.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed = text ? (JSON.parse(text) as unknown) : null;
    // 모양 검사: { title, body } 문자열이 아니면 저장하지 않는다 (요점 9)
    if (!parsed || typeof parsed !== 'object') return { ok: false, reason: 'bad_shape' };
    const { title, body } = parsed as Record<string, unknown>;
    if (typeof title !== 'string' || typeof body !== 'string' || !title.trim() || !body.trim()) return { ok: false, reason: 'bad_shape' };
    return { ok: true, title: title.trim(), body: body.trim() };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
