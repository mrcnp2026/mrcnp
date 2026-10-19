// 통합설정 스위치 켜기 · 끄기 (2026-10-19 의뢰인) — 숫자 4자리로 연 최고관리자만. { key, on }
import { api, ApiError, readJson } from '@/lib/api';
import { requireConsole } from '@/lib/console-pin';
import { isSwitchKey, putSwitch } from '@/lib/switches';

export const POST = api('admin.switches', async (req) => {
  const me = await requireConsole();
  const b = await readJson(req);
  if (!isSwitchKey(b.key) || typeof b.on !== 'boolean') throw new ApiError(400, 'invalid_input');
  await putSwitch(b.key, b.on, me.id);
  return { ok: true };
});
