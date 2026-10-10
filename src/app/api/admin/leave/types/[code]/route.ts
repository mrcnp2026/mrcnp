// 휴가 종류 고치기 · 끄기/켜기. 지우지 않는다 (4-6) — 꺼 두면 새 신청에서만 빠지고 지난 신청은 그대로 보인다.
// 기본 종류(연차·반차 등)는 이름과 시간을 바꿀 수 없다 — 이미 쌓인 신청의 뜻이 달라지지 않게. 묶음·시각·유급·차감 여부만 바꾼다.
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { validateLeaveType } from '@/lib/leave';
import { createAdminClient } from '@/lib/supabase/admin';

export const POST = api<{ params: Promise<{ code: string }> }>('admin.leaveTypes.update', async (req, ctx) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const { code } = await ctx.params;
  if (!/^[a-z0-9_]{1,40}$/.test(code)) throw new ApiError(404, 'not_found');
  const b = await readJson(req);
  const db = createAdminClient();
  const { data: cur } = await db.from('leave_types').select('code, name, hours, builtin, active').eq('code', code).maybeSingle();
  if (!cur) throw new ApiError(404, 'not_found');

  if (b.active !== undefined) {
    if (typeof b.active !== 'boolean') throw new ApiError(400, 'invalid_input');
    if (b.active) {
      const { data: same } = await db.from('leave_types').select('code').eq('active', true).neq('code', code).ilike('name', cur.name.replace(/[%_\\]/g, '\\$&'));
      if (same?.length) throw new ApiError(409, 'duplicate_type');
    }
    const { error } = await db.from('leave_types').update({ active: b.active, updated_by: me.id }).eq('code', code);
    if (error) throw new Error(`leaveTypes.toggle: ${error.code}`);
    return { ok: true };
  }

  const v = validateLeaveType(cur.builtin ? { ...b, name: cur.name, hours: Number(cur.hours) } : b);
  if (!v.ok) throw new ApiError(400, v.code);
  const t = v.value;
  if (!cur.builtin && cur.active) {
    const { data: same } = await db.from('leave_types').select('code').eq('active', true).neq('code', code).ilike('name', t.name.replace(/[%_\\]/g, '\\$&'));
    if (same?.length) throw new ApiError(409, 'duplicate_type');
  }
  const { error } = await db
    .from('leave_types')
    .update({
      ...(cur.builtin ? {} : { name: t.name, hours: t.hours, day_unit: t.dayUnit }),
      start_time: t.startTime, end_time: t.endTime, group_name: t.groupName, is_paid: t.isPaid, deducts_balance: t.deductsBalance, updated_by: me.id,
    })
    .eq('code', code);
  if (error) throw new Error(`leaveTypes.update: ${error.code}`);
  return { ok: true };
});
