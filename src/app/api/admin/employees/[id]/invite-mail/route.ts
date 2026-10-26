// 초대 링크 · 코드를 직원 이메일로 보낸다 (2026-10-26 의뢰인). 관리자만. 초대는 먼저 만들어 둔 것(invite 경로)을 쓴다.
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { sendInviteMail } from '@/lib/invite-mail';

export const POST = api<{ params: Promise<{ id: string }> }>('admin.employees.inviteMail', async (req, ctx) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const { id } = await ctx.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new ApiError(400, 'invalid_input');
  const b = await readJson(req);
  return sendInviteMail({ employeeId: id, code: b.code });
});
