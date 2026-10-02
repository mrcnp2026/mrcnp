// 근무노트 쓰기 (부록 R-10-2). 판정에 쓰이지 않는다. 덧붙이기만 — 고치면 새 행 + supersedes.
// 작성자·근무일·시각은 서버가 정한다 (요청 본문 무시). 노트 내용은 로그·오류 기록에 남기지 않는다 (R-5의 7).
import { OFFICE } from '@/config/office';
import { api, ApiError, readJson } from '@/lib/api';
import { currentWorkDate } from '@/lib/attendance-data';
import { getMe } from '@/lib/auth';
import { isPeriodLocked } from '@/lib/punch';
import { createAdminClient } from '@/lib/supabase/admin';

export const POST = api('notes', async (req) => {
  const me = await getMe();
  if (!me) throw new ApiError(401, 'not_signed_in');
  const { body } = await readJson(req);
  // 일반 텍스트만: 줄바꿈은 허용, 제어 문자는 뺀다. 화면은 텍스트로만 그린다 (HTML·링크 비활성)
  const text = typeof body === 'string' ? body.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '').trim() : '';
  if (text.length < 1 || text.length > 200) throw new ApiError(400, 'note_length');

  const now = new Date();
  const workDate = await currentWorkDate(me.id, now);
  if (await isPeriodLocked(me.id, workDate)) throw new ApiError(409, 'period_locked');

  const db = createAdminClient();
  const { data: prev } = await db
    .from('work_notes').select('id')
    .eq('employee_id', me.id).eq('work_date', workDate).eq('is_test', OFFICE.practiceMode)
    .order('created_at', { ascending: false }).limit(1);
  const { data, error } = await db
    .from('work_notes')
    .insert({ employee_id: me.id, work_date: workDate, body: text, supersedes: prev?.[0]?.id ?? null, is_test: OFFICE.practiceMode })
    .select('id, body')
    .single();
  if (error) throw new Error(`notes.insert: ${error.code}`); // 메시지에 본문이 섞이지 않게 코드만
  return { note: data };
});
