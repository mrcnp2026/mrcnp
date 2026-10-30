// 통합설정 스위치 켜기 · 끄기 (2026-10-19 의뢰인) — 숫자 4자리로 연 최고관리자만. { key, on }
// { pushAdmin: 직원 id, on } — 그 최고관리자가 관리자 폰 알림을 받을지 (2026-10-21, 알림-9). 이상준 최고관리자(항상) · 대표자(안 받음)는 바꿀 수 없다
import { api, ApiError, readJson } from '@/lib/api';
import { requireConsole } from '@/lib/console-pin';
import { pushAdminRule, putPushAdmin, putPushAlways, savedPushAlways } from '@/lib/push-recipients';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSwitchKey, putSwitch } from '@/lib/switches';

export const POST = api('admin.switches', async (req) => {
  const me = await requireConsole();
  const b = await readJson(req);
  // 「항상 받는 사람」 고르기 (2026-10-29 9-2) — 재직 중인 최고관리자 한 명, 대표자는 안 된다. null이면 아무도 없음
  if ('pushAlways' in b) {
    if (b.pushAlways !== null && typeof b.pushAlways !== 'string') throw new ApiError(400, 'invalid_input');
    if (b.pushAlways) {
      const { data: p } = await createAdminClient().from('profiles').select('id, role, admin_level, active').eq('id', b.pushAlways).maybeSingle();
      if (!p || !p.active || p.role !== 'admin' || p.admin_level === 'ceo') throw new ApiError(400, 'invalid_input');
    }
    await putPushAlways(b.pushAlways ?? null, me.id);
    return { ok: true };
  }
  if (typeof b.pushAdmin === 'string') {
    if (typeof b.on !== 'boolean') throw new ApiError(400, 'invalid_input');
    const { data: p } = await createAdminClient().from('profiles').select('id, role, admin_level, employee_no, active').eq('id', b.pushAdmin).maybeSingle();
    if (!p || !p.active || pushAdminRule(p, await savedPushAlways()) !== 'choice') throw new ApiError(400, 'invalid_input');
    await putPushAdmin(p.id, b.on, me.id);
    return { ok: true };
  }
  if (!isSwitchKey(b.key) || typeof b.on !== 'boolean') throw new ApiError(400, 'invalid_input');
  await putSwitch(b.key, b.on, me.id);
  return { ok: true };
});
