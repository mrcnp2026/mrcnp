// 문의 답변 (DB 묶음 37, 2026-10-26). 답할 수 있는 사람만: 시스템관리자는 모두, 최고관리자는 직원이 보낸 것. 자기 문의에는 답하지 않는다.
import { after } from 'next/server';
import { api, ApiError, readJson } from '@/lib/api';
import { getMe } from '@/lib/auth';
import { cleanAnswer } from '@/lib/inquiry';
import { answerInquiry } from '@/lib/inquiry-data';
import { notifyInquiryAnswer } from '@/lib/push-events';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST = api('admin.inquiry.answer', async (req) => {
  const me = await getMe();
  if (!me) throw new ApiError(401, 'not_signed_in');
  const b = await readJson(req);
  if (b.action !== 'answer' || typeof b.id !== 'string' || !UUID.test(b.id)) throw new ApiError(400, 'invalid_input');
  const answer = cleanAnswer(b.answer);
  if (!answer) throw new ApiError(400, 'answer_invalid');
  await answerInquiry({ id: b.id, answer, me });
  after(() => notifyInquiryAnswer(b.id as string)); // 보낸 사람에게 바로 폰 알림
  return { ok: true };
});
