// 휴가 종류 만들기 (의뢰인 2026-10-10: "10시 반차 · 11시 반차 · 4시간 반차 등 상세히 구분"). 관리자만.
// 차감 일수는 서버가 시간 ÷ 8로 정한다. 코드는 서버가 짓는다 (기본 종류의 코드와 겹치지 않게 c_ 로 시작).
import { randomBytes } from 'node:crypto';
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { validateLeaveType } from '@/lib/leave';
import { createAdminClient } from '@/lib/supabase/admin';

export const POST = api('admin.leaveTypes.create', async (req) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const v = validateLeaveType(await readJson(req));
  if (!v.ok) throw new ApiError(400, v.code);
  const t = v.value;
  const db = createAdminClient();
  const { data: same } = await db.from('leave_types').select('code').eq('active', true).ilike('name', t.name.replace(/[%_\\]/g, '\\$&'));
  if (same?.length) throw new ApiError(409, 'duplicate_type');
  const code = `c_${randomBytes(5).toString('hex')}`;
  const { error } = await db.from('leave_types').insert({
    code, name: t.name, is_paid: t.isPaid, deducts_balance: t.deductsBalance, day_unit: t.dayUnit, hours: t.hours,
    start_time: t.startTime, end_time: t.endTime, group_name: t.groupName, sort: 100, builtin: false, updated_by: me.id,
  });
  if (error) throw new Error(`leaveTypes.create: ${error.code}`);
  return { code };
});
