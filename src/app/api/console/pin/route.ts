// 통합설정 숫자 4자리 — 정하기(set) · 열기(open) · 다른 관리자 숫자 지우기(reset) · 지금 잠그기(lock). 관리자만 (2026-10-14 DB 묶음 7)
import { api, ApiError, readJson } from '@/lib/api';
import { getMe } from '@/lib/auth';
import { lockConsole, openConsole, requireConsole, resetPin, setPin } from '@/lib/console-pin';

export const POST = api('console.pin', async (req) => {
  const me = await getMe();
  if (!me || me.role !== 'admin') throw new ApiError(403, 'forbidden');
  const b = await readJson(req);
  const pin = typeof b.pin === 'string' ? b.pin : '';
  if (b.action === 'set') {
    await setPin(me, pin, typeof b.again === 'string' ? b.again : '');
    return { ok: true };
  }
  if (b.action === 'open') return openConsole(me, pin);
  if (b.action === 'reset') {
    await requireConsole(); // 지우는 사람도 통합설정을 연 상태여야 한다(권한 화면에서 누른다)
    if (typeof b.employeeId !== 'string' || !/^[0-9a-f-]{36}$/i.test(b.employeeId)) throw new ApiError(400, 'invalid_input');
    await resetPin(me, b.employeeId);
    return { ok: true };
  }
  if (b.action === 'lock') {
    await lockConsole();
    return { ok: true };
  }
  throw new ApiError(400, 'invalid_input');
});
