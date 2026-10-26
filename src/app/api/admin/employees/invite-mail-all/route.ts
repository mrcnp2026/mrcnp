// 미가입 직원 모두에게 가입 안내를 이메일로 한꺼번에 보낸다 (2026-10-26 의뢰인). 최고관리자만.
import { api, ApiError } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { sendInviteMailAll } from '@/lib/invite-mail';

export const maxDuration = 60;

export const POST = api('admin.employees.inviteMailAll', async () => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  return sendInviteMailAll({ me });
});
