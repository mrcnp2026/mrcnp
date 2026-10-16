// 근태 월 마감 · 다시 열기 (PRD v1.3 8 · 35.2장). 관리자만.
// 마감: 화면이 검토한 자료(해시)와 지금 자료가 같고 막는 것이 없을 때만. 다시 열기: 사유 필수.
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { OFFICE } from '@/config/office';
import { sendClosingNotice } from '@/lib/attendance-notify';
import { closeMonth, decideReopen, requestReopen } from '@/lib/close-data';
import { isMonth } from '@/lib/close-review';
import { toKstDate } from '@/lib/time';

export const maxDuration = 60;

export const POST = api('admin.closing', async (req) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const b = await readJson(req);
  if (b.action === 'notice') {
    // 근태 마감 공지 — 전 직원에게 「○월 근태를 ○일에 마감합니다」 (업무 메시지)
    if (!isMonth(b.month) || typeof b.due !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.due)) throw new ApiError(400, 'invalid_input');
    return sendClosingNotice({ me, month: b.month, due: b.due });
  }
  if (b.action === 'reopen') {
    const reason = typeof b.reason === 'string' ? b.reason.trim() : '';
    if (typeof b.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(b.id) || reason.length < 2 || reason.length > 500) throw new ApiError(400, 'invalid_input');
    // 다른 관리자가 있으면 요청으로 남고(그 관리자가 확인해야 열린다), 혼자면 바로 열린다
    return { reopen: await requestReopen(b.id, reason, me) };
  }
  if (b.action === 'reopenDecide') {
    if (typeof b.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(b.requestId) || (b.decision !== 'approved' && b.decision !== 'rejected' && b.decision !== 'cancelled')) throw new ApiError(400, 'invalid_input');
    await decideReopen({ requestId: b.requestId, decision: b.decision, me });
    return { ok: true };
  }
  if (b.action !== 'close' || !isMonth(b.month) || !Array.isArray(b.items) || b.items.length === 0 || b.items.length > 300) throw new ApiError(400, 'invalid_input');
  const items: { employeeId: string; hash: string }[] = [];
  for (const x of b.items as { employeeId?: unknown; hash?: unknown }[]) {
    if (typeof x?.employeeId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x.employeeId) || typeof x.hash !== 'string' || !/^[0-9a-f]{64}$/.test(x.hash)) throw new ApiError(400, 'invalid_input');
    if (!items.some((y) => y.employeeId === x.employeeId)) items.push({ employeeId: x.employeeId, hash: x.hash });
  }
  // 연습/운영은 서버가 정한다 (운영 중인 앱에서 live=1은 실제 기록)
  const practice = OFFICE.practiceMode && b.live !== true;
  return { results: await closeMonth({ ym: b.month, practice, items, today: toKstDate(new Date()), me }) };
});
