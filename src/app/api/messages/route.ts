// 사내게시판 — 관리자만 글을 올린다. 직원 글쓰기 · 답글은 없다(2026-10-16 의뢰인, 결정 알림-8). 로그인한 사람만.
// 누가 볼 수 있는지는 work-messages.ts가 메시지마다 다시 확인한다(받는 사람 본인 · 보낸 사람 · 관리자).
import { api, ApiError, readJson } from '@/lib/api';
import { getMe } from '@/lib/auth';
import { sendNotice, type Audience } from '@/lib/work-messages';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
    return sendNotice({ me, title: b.title, body: b.body, bodyHtml: b.bodyHtml, needsReply: false, audience });
  }
  // 예전의 직원 문의 · 회신 · 답하기는 막는다(옛 화면이 열려 있어도 서버에서 거절)
  if (b.action === 'inquiry' || b.action === 'reply' || b.action === 'answer') throw new ApiError(403, 'board_admin_only');
  throw new ApiError(400, 'invalid_input');
});
