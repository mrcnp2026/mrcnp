// 새 초대 QR. 이전에 쓰지 않은 QR은 취소된다. 활성 폰이 있으면 등록 화면에서 막힌다 (해제는 ②-3)
import { api, ApiError } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { issueInvite } from '@/lib/invite';
import { createAdminClient } from '@/lib/supabase/admin';

export const POST = api<{ params: Promise<{ id: string }> }>('admin.employees.invite', async (_req, ctx) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const { id } = await ctx.params;
  const { data: p } = await createAdminClient().from('profiles').select('id, name, active').eq('id', id).maybeSingle();
  if (!p || !p.active) throw new ApiError(404, 'employee_inactive');
  const invite = await issueInvite({ employeeId: p.id, issuedBy: me.id, via: 'admin' });
  return { employeeId: p.id, name: p.name, invite };
});
