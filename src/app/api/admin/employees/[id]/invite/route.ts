// 새 초대(링크·8자리 코드·QR). 이전에 쓰지 않은 초대는 취소된다. 직원은 이 초대로 비밀번호를 만든다 — 이미 가입한 사람에게 다시 보내면 비밀번호 재설정이 된다
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
