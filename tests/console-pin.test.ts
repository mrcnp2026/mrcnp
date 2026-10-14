// 통합설정 숫자 4자리 — 쉬운 숫자 막기 · 열림 표 서명(서버 ↔ 미들웨어가 같은 값) · 잠기는 주소 (2026-10-14 DB 묶음 7)
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));
vi.mock('@/lib/auth', () => ({ getMe: async () => null }));
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-secret';

const { makeUnlock, unlockValid, weakPin } = await import('@/lib/console-pin');
const { unlockValidEdge } = await import('@/lib/console-unlock-edge');
const { isConsolePath } = await import('@/config/console-paths');
const { ADMIN_APPS, CONSOLE_APPS, MY_APPS, appLeaves } = await import('@/config/nav');

describe('쉬운 숫자', () => {
  it('같은 숫자 넷 · 이어지는 숫자 · 되풀이 · 네 자리가 아닌 것은 막는다', () => {
    for (const p of ['0000', '7777', '1234', '0123', '6789', '4321', '9876', '1212', '5050', '123', '12345', 'abcd']) expect(weakPin(p)).toBe(true);
    for (const p of ['2580', '1357', '9024', '1123']) expect(weakPin(p)).toBe(false);
  });
});

describe('열림 표', () => {
  const id = '11111111-1111-1111-1111-111111111111';
  it('서버가 만든 표를 서버와 미들웨어(Web Crypto)가 똑같이 확인한다', async () => {
    const v = makeUnlock(id);
    expect(unlockValid(v, id)).toBe(true);
    expect(await unlockValidEdge(v, id)).toBe(true);
  });
  it('다른 사람 · 시간이 지난 표 · 고친 표는 안 된다', async () => {
    const v = makeUnlock(id, Date.now() - 31 * 60_000);
    expect(unlockValid(v, id)).toBe(false);
    expect(await unlockValidEdge(v, id)).toBe(false);
    const ok = makeUnlock(id);
    expect(unlockValid(ok, '22222222-2222-2222-2222-222222222222')).toBe(false);
    const [a, , s] = ok.split('.');
    const forged = `${a}.${Date.now() + 99 * 60_000}.${s}`;
    expect(unlockValid(forged, id)).toBe(false);
    expect(await unlockValidEdge(forged, id)).toBe(false);
  });
});

describe('잠기는 주소', () => {
  it('통합설정 항목은 전부 잠기고, 관리자 모드 · 직원 모드 항목은 잠기지 않는다', () => {
    const path = (h: string) => h.split('?')[0];
    expect(CONSOLE_APPS.flatMap(appLeaves).filter((l) => !isConsolePath(path(l.href))).map((l) => l.href)).toEqual([]);
    expect([...ADMIN_APPS, ...MY_APPS].flatMap(appLeaves).filter((l) => isConsolePath(path(l.href))).map((l) => l.href)).toEqual([]);
    expect(isConsolePath('/admin/console')).toBe(true);
    expect(isConsolePath('/admin/jobs/abc')).toBe(true);
    expect(isConsolePath('/admin/leave/types/annual')).toBe(true);
    expect(isConsolePath('/admin/leave')).toBe(false);
    expect(isConsolePath('/admin/console-lock')).toBe(false);
  });
});
