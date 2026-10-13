// 연차 사용 촉진 — 만들기 · 대상 빼기/넣기 · 안내 보내기 · 처리 · 닫기 (PRD v1.3 37.3). 관리자만.
// 프로그램은 통지 · 계획 · 처리의 사실과 시각만 남긴다. 법적 촉진 완료 여부를 정하지 않는다.
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { closeCampaign, createCampaign, decideTarget, sendCampaign, setTargetIncluded } from '@/lib/leave-promotion';

export const maxDuration = 60;
const UUID = /^[0-9a-f-]{36}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max + 1) : '');
const isDate = (v: unknown): v is string => typeof v === 'string' && DATE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

export const POST = api('admin.leave.promotion', async (req) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const b = await readJson(req);
  if (b.action === 'create') {
    const title = text(b.title, 80), body = text(b.noticeBody, 4000), note = text(b.policyNote, 1000);
    if (title.length < 1 || title.length > 80 || body.length < 1 || body.length > 4000 || note.length > 1000 || !isDate(b.basisOn) || !isDate(b.planDueOn) || b.planDueOn < b.basisOn) throw new ApiError(400, 'invalid_input');
    return createCampaign({ title, basisOn: b.basisOn, planDueOn: b.planDueOn, noticeBody: body, policyNote: note || null, me });
  }
  if (typeof b.campaignId !== 'string' || !UUID.test(b.campaignId)) throw new ApiError(400, 'invalid_input');
  if (b.action === 'send') return sendCampaign({ campaignId: b.campaignId, me, hrefOf: (id) => `/punch/leave/promotion/${id}` });
  if (b.action === 'close') {
    await closeCampaign({ campaignId: b.campaignId, me });
    return { ok: true };
  }
  if (typeof b.targetId !== 'string' || !UUID.test(b.targetId)) throw new ApiError(400, 'invalid_input');
  if (b.action === 'exclude' || b.action === 'include') {
    const reason = text(b.reason, 300);
    if (b.action === 'exclude' && (reason.length < 2 || reason.length > 300)) throw new ApiError(400, 'promotion_note_required');
    await setTargetIncluded({ campaignId: b.campaignId, targetId: b.targetId, include: b.action === 'include', reason: b.action === 'exclude' ? reason : null });
    return { ok: true };
  }
  if (b.action === 'decide') {
    const note = text(b.note, 500);
    if ((b.decision !== 'CONFIRMED' && b.decision !== 'EXCEPTION') || note.length > 500) throw new ApiError(400, 'invalid_input');
    await decideTarget({ campaignId: b.campaignId, targetId: b.targetId, decision: b.decision, note: note || null, me });
    return { ok: true };
  }
  throw new ApiError(400, 'invalid_input');
});
