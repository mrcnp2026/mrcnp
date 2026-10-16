// 이메일 가입 신청 승인 · 거절 (관리자, 2026-10-16 의뢰인 권한-6). 승인하면 직원이 생긴다 — lib/signup.ts.
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { approveSignup, rejectSignup } from '@/lib/signup';

export const POST = api<{ params: Promise<{ id: string }> }>('admin.signups.decide', async (req, ctx) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const { id } = await ctx.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new ApiError(400, 'invalid_input');
  const b = await readJson(req);
  if (b.action === 'approve') return approveSignup({ id, actorId: me.id, employeeNo: b.employeeNo, groupId: b.groupId, joinedOn: b.joinedOn });
  if (b.action === 'reject') {
    await rejectSignup({ id, actorId: me.id, reason: b.reason });
    return { ok: true };
  }
  throw new ApiError(400, 'invalid_input');
});
