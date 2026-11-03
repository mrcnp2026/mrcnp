// 직원: 퇴근할 때 「저녁 휴게를 못 쉬고 일했어요」 (2026-11-04 의뢰인). 본인 것만 · 오늘 · 어제까지. 대기로 남고 관리자가 근태 점검에서 승인한다.
import { addDays } from '@/lib/calendar';
import { api, ApiError, readJson } from '@/lib/api';
import { getMe } from '@/lib/auth';
import { askBreakSkip } from '@/lib/break-skip';
import { toKstDate } from '@/lib/time';

export const POST = api('punch.breakSkip', async (req) => {
  const me = await getMe();
  if (!me || !me.active) throw new ApiError(401, 'unauthorized');
  const b = await readJson(req);
  const date = typeof b.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : null;
  const today = toKstDate(new Date());
  if (!date || date > today || date < addDays(today, -1)) throw new ApiError(400, 'invalid_input');
  return { result: await askBreakSkip(me.id, date) };
});
