// 문의하기 — 보내기 · 내 답변을 봤다고 남기기 (DB 묶음 37, 2026-10-26). 로그인한 누구나. 받는 곳은 서버가 정한다(직원 → 관리자들, 관리자 → 시스템관리자).
import { after } from 'next/server';
import { OFFICE } from '@/config/office';
import { api, ApiError, readJson } from '@/lib/api';
import { getMe } from '@/lib/auth';
import { cleanInquiry } from '@/lib/inquiry';
import { createInquiry, markSeen } from '@/lib/inquiry-data';
import { notifyInquiry } from '@/lib/push-events';

export const POST = api('inquiry.save', async (req) => {
  const me = await getMe();
  if (!me) throw new ApiError(401, 'not_signed_in');
  const b = await readJson(req);
  if (b.action === 'seen') return { marked: await markSeen(me.id, OFFICE.practiceMode) };
  const c = cleanInquiry(b);
  if (!c.ok) throw new ApiError(400, c.code);
  const r = await createInquiry({ me, input: c.value, practice: OFFICE.practiceMode });
  after(() => notifyInquiry(r.id)); // 받는 쪽에 바로 폰 알림
  return { id: r.id };
});
