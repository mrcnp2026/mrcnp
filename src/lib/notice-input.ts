// 공지 입력 검사 (관리자 API 공통). 시각은 KST로 받고 UTC로 저장한다 (요점 13, ① 4-5)
import 'server-only';
import { ApiError } from '@/lib/api';
import type { NoticeInput } from '@/lib/notices';
import { cleanText } from '@/lib/text';
import { kstDateTime } from '@/lib/time';

/** 'YYYY-MM-DDTHH:MM' (사무실 시각) → Date */
function kst(v: unknown): Date | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  const [d, t] = v.split('T');
  return kstDateTime(d, t);
}

export function parseNoticeInput(b: Record<string, unknown>): NoticeInput {
  const title = cleanText(b.title);
  // 본문은 줄바꿈을 살린다 (cleanText는 \n을 남긴다). 일반 텍스트 — HTML로 해석하지 않는다 (B-32)
  const body = cleanText(b.body);
  if (title.length < 1 || title.length > 120) throw new ApiError(400, 'notice_title');
  if (body.length < 1 || body.length > 4000) throw new ApiError(400, 'notice_body');
  const startsAt = kst(b.startsAt) ?? new Date();
  const endsAt = b.endsAt ? kst(b.endsAt) : null;
  if (b.endsAt && !endsAt) throw new ApiError(400, 'invalid_input');
  if (endsAt && endsAt <= startsAt) throw new ApiError(400, 'notice_period');
  const audience = b.audience === 'selected' ? 'selected' : 'all';
  const targets = Array.isArray(b.targets) ? b.targets.filter((x): x is string => typeof x === 'string').slice(0, 500) : [];
  if (audience === 'selected' && targets.length === 0) throw new ApiError(400, 'notice_targets');
  return { title, body, important: b.important === true, legal: b.legal === true, audience, targets, startsAt, endsAt };
}
