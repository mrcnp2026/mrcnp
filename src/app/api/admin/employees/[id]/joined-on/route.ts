// 입사일 입력·수정 (관리자). 연차 자동 채움의 기준 (2026-10-02 의뢰인). 변경 기록(audit_row)에 남는다.
// 비우면(null) 입사일 없음 — 그 전 날짜 결근 판정은 계정 만든 날 기준으로 돌아간다 (7-8 요점 3).
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';

export const POST = api<{ params: Promise<{ id: string }> }>('admin.employees.joinedOn', async (req, ctx) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const { id } = await ctx.params;
  const b = await readJson(req);
  const joinedOn = b.joinedOn === null || b.joinedOn === '' ? null : typeof b.joinedOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.joinedOn) ? b.joinedOn : undefined;
  if (joinedOn === undefined) throw new ApiError(400, 'invalid_input');
  if (joinedOn && (joinedOn > toKstDate(new Date()) || joinedOn < '1970-01-01')) throw new ApiError(400, 'invalid_date');
  const { data, error } = await createAdminClient().from('profiles').update({ joined_on: joinedOn }).eq('id', id).select('id');
  if (error) throw new Error(`profiles.joined_on: ${error.code}`);
  if (!data?.length) throw new ApiError(404, 'not_found');
  return { ok: true };
});
