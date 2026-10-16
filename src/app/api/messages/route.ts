// 업무 메시지 — 통지 보내기(관리자) · 문의 보내기(직원) · 회신 · 그 직원에게만 답하기(관리자). 로그인한 사람만.
// 누가 볼 수 있는지는 work-messages.ts가 메시지마다 다시 확인한다(받는 사람 본인 · 보낸 사람 · 관리자).
import { api, ApiError, readJson } from '@/lib/api';
import { getMe } from '@/lib/auth';
import { answerTo, replyTo, sendInquiry, sendNotice, type Audience } from '@/lib/work-messages';

const UUID = /^[0-9a-f-]{36}$/i;
const ids = (v: unknown): string[] | null => (Array.isArray(v) && v.length > 0 && v.length <= 500 && v.every((x) => typeof x === 'string' && UUID.test(x)) ? [...new Set(v as string[])] : null);

export const POST = api('messages', async (req) => {
  const me = await getMe();
  if (!me) throw new ApiError(401, 'not_signed_in');
  const b = await readJson(req);
  if (b.action === 'send') {
    if (me.role !== 'admin') throw new ApiError(403, 'forbidden');
    let audience: Audience | null = null;
    if (b.to === 'all') audience = { all: true };
    else if (b.to === 'groups') { const g = ids(b.groupIds); if (g) audience = { groupIds: g }; }
    else if (b.to === 'people') { const e = ids(b.employeeIds); if (e) audience = { employeeIds: e }; }
    if (!audience) throw new ApiError(400, 'message_no_recipients');
    return sendNotice({ me, title: b.title, body: b.body, bodyHtml: b.bodyHtml, needsReply: b.needsReply === true, audience });
  }
  if (b.action === 'inquiry') return sendInquiry({ me, title: b.title, body: b.body, bodyHtml: b.bodyHtml });
  if (b.action === 'reply') {
    if (typeof b.id !== 'string' || !UUID.test(b.id)) throw new ApiError(400, 'invalid_input');
    await replyTo(b.id, me, b.body);
    return { ok: true };
  }
  if (b.action === 'answer') {
    if (me.role !== 'admin') throw new ApiError(403, 'forbidden');
    if (typeof b.id !== 'string' || !UUID.test(b.id) || typeof b.employeeId !== 'string' || !UUID.test(b.employeeId)) throw new ApiError(400, 'invalid_input');
    return answerTo({ id: b.id, employeeId: b.employeeId, me, body: b.body });
  }
  throw new ApiError(400, 'invalid_input');
});
