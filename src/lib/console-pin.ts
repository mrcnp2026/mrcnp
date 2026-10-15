// 통합설정 잠금 숫자 4자리 (2026-10-14 결정 사항 개발-29, DB 묶음 7). 서버 전용.
//   · 숫자는 저장하지 않는다 — scrypt(숫자, 사람마다 다른 소금)만 console_pins에 둔다
//   · 5번 연속 틀리면 15분 잠김 · 맞으면 30분짜리 열림 표(서명한 쿠키)를 준다 · 관리자 모드로 나가면 미들웨어가 지운다
//   · 잊으면 다른 관리자가 지운다(본인 것은 못 지운다) · 모든 시도는 console_pin_attempts에 남는다(숫자는 남기지 않음)
import 'server-only';
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { CONSOLE_COOKIE, CONSOLE_MINUTES } from '@/config/console-paths';
import { ApiError } from '@/lib/api';
import { assertStaffTarget } from '@/lib/staff-data';
import { getMe, type Me } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

const MAX_FAILS = 5;
const LOCK_MINUTES = 15;

/** 쉬운 숫자 — 같은 숫자 넷(0000) · 이어지는 숫자(1234 · 4321 · 0123 …) · 1212 같은 되풀이 */
export function weakPin(pin: string): boolean {
  if (!/^\d{4}$/.test(pin)) return true;
  const d = [...pin].map(Number);
  const up = d.every((x, i) => i === 0 || x === d[i - 1] + 1);
  const down = d.every((x, i) => i === 0 || x === d[i - 1] - 1);
  return new Set(d).size === 1 || up || down || (pin.slice(0, 2) === pin.slice(2));
}

const hashPin = (pin: string, salt = randomBytes(16).toString('hex')) => `scrypt$${salt}$${scryptSync(pin, salt, 32).toString('hex')}`;
function pinMatches(pin: string, stored: string): boolean {
  const [, salt, want] = stored.split('$');
  if (!salt || !want) return false;
  const got = scryptSync(pin, salt, 32);
  const w = Buffer.from(want, 'hex');
  return w.length === got.length && timingSafeEqual(w, got);
}

// 열림 표: 「직원 id . 끝나는 때 . 서명」 — 서명 열쇠는 서버 비밀(서비스 키)에서 만든다
const key = () => {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('console signing key missing');
  return createHmac('sha256', secret).update('console-pin-unlock').digest();
};
const sign = (body: string) => createHmac('sha256', key()).update(body).digest('base64url');
export function makeUnlock(employeeId: string, pinHash: string, now = Date.now()): string {
  const body = `${employeeId}.${now + CONSOLE_MINUTES * 60_000}`;
  return `${body}.${sign(`${body}.${pinHash}`)}`;
}
export function unlockValid(value: string | undefined, employeeId: string, pinHash: string, now = Date.now()): boolean {
  if (!value || !pinHash || !process.env.SUPABASE_SERVICE_ROLE_KEY) return false;
  const [id, exp, sig, extra] = value.split('.');
  if (id !== employeeId || !exp || !sig || extra !== undefined || !Number.isFinite(Number(exp)) || Number(exp) <= now) return false;
  const want = sign(`${id}.${exp}.${pinHash}`);
  return want.length === sig.length && timingSafeEqual(Buffer.from(want), Buffer.from(sig));
}

export async function isUnlocked(me: Me): Promise<boolean> {
  const { data, error } = await createAdminClient().from('console_pins').select('pin_hash').eq('employee_id', me.id).maybeSingle();
  if (error) throw new Error(`console_pins.read: ${error.code}`);
  return !!data && unlockValid((await cookies()).get(CONSOLE_COOKIE)?.value, me.id, data.pin_hash as string);
}

/** 통합설정의 저장 기능 앞에 — 관리자 + 열림 표가 있어야 한다 (주소를 직접 치거나 서버에 바로 요청해도 막힌다) */
export async function requireConsole(): Promise<Me> {
  const me = await getMe();
  if (!me || me.role !== 'admin') throw new ApiError(403, 'forbidden');
  if (!(await isUnlocked(me))) throw new ApiError(403, 'console_locked');
  return me;
}

export type PinState = { set: boolean; lockedUntil: string | null };
export async function pinState(employeeId: string): Promise<PinState> {
  const { data } = await createAdminClient().from('console_pins').select('locked_until').eq('employee_id', employeeId).maybeSingle();
  const locked = data?.locked_until && new Date(data.locked_until as string) > new Date() ? (data.locked_until as string) : null;
  return { set: !!data, lockedUntil: locked };
}

const note = (employeeId: string, ok: boolean, kind: 'open' | 'set' | 'reset', actorId: string) => createAdminClient().from('console_pin_attempts').insert({ employee_id: employeeId, ok, kind, actor_id: actorId });

/** 처음 정하기 — 이미 있으면 못 정한다(바꾸려면 다른 관리자가 지운 뒤) */
export async function setPin(me: Me, pin: string, again: string): Promise<void> {
  if (pin !== again) throw new ApiError(400, 'pin_mismatch');
  if (weakPin(pin)) throw new ApiError(400, 'pin_weak');
  const c = createAdminClient();
  const { error } = await c.from('console_pins').insert({ employee_id: me.id, pin_hash: hashPin(pin), set_by: me.id });
  if (error?.code === '23505') throw new ApiError(409, 'pin_exists');
  if (error) throw new Error(`console_pins.insert: ${error.code}`);
  await note(me.id, true, 'set', me.id);
}

/** 열기 — 맞으면 열림 표를 쿠키로 준다 */
export async function openConsole(me: Me, pin: string): Promise<{ ok: true } | { ok: false; left: number }> {
  const c = createAdminClient();
  // 비교 후 갱신: 동시에 틀린 PIN을 보내도 실패 횟수를 덮어쓰지 않는다.
  for (let attempt = 0; attempt < 10; attempt++) {
    const { data: row, error } = await c.from('console_pins').select('pin_hash, failed_count, locked_until, updated_at').eq('employee_id', me.id).maybeSingle();
    if (error) throw new Error(`console_pins.read: ${error.code}`);
    if (!row) throw new ApiError(409, 'pin_not_set');
    if (row.locked_until && new Date(row.locked_until as string) > new Date()) throw new ApiError(423, 'pin_locked');
    const ok = /^\d{4}$/.test(pin) && pinMatches(pin, row.pin_hash as string);
    const fails = (row.failed_count as number) + 1;
    const lock = !ok && fails >= MAX_FAILS;
    const { data: changed, error: updateError } = await c.from('console_pins').update({
      failed_count: ok || lock ? 0 : fails,
      locked_until: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq('employee_id', me.id).eq('pin_hash', row.pin_hash).eq('failed_count', row.failed_count).eq('updated_at', row.updated_at).select('employee_id');
    if (updateError) throw new Error(`console_pins.update: ${updateError.code}`);
    if (!changed?.length) continue;
    await note(me.id, ok, 'open', me.id);
    if (lock) throw new ApiError(423, 'pin_locked');
    if (!ok) return { ok: false, left: MAX_FAILS - fails };
    (await cookies()).set(CONSOLE_COOKIE, makeUnlock(me.id, row.pin_hash as string), { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: CONSOLE_MINUTES * 60 });
    return { ok: true };
  }
  throw new ApiError(409, 'pin_busy'); // 동시에 여러 번 눌러 갱신이 계속 엇갈린 경우 — 잠긴 것이 아니므로 다시 시도하게
}

/** 다른 관리자의 숫자를 지운다(잊었을 때). 본인 것은 지울 수 없다 */
export async function resetPin(me: Me, targetId: string): Promise<void> {
  if (targetId === me.id) throw new ApiError(400, 'pin_reset_self');
  await assertStaffTarget(me.id, targetId);
  const c = createAdminClient();
  const { data: t } = await c.from('profiles').select('role').eq('id', targetId).maybeSingle();
  if (t?.role !== 'admin') throw new ApiError(404, 'not_found');
  const { error } = await c.from('console_pins').delete().eq('employee_id', targetId);
  if (error) throw new Error(`console_pins.reset: ${error.code}`);
  await note(targetId, true, 'reset', me.id);
}

/** 지금 잠그기 */
export async function lockConsole(): Promise<void> {
  (await cookies()).delete(CONSOLE_COOKIE);
}
