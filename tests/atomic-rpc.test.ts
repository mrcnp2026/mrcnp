import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const db = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => db }));
vi.mock('@/lib/api', () => ({ ApiError: class ApiError extends Error { constructor(public status: number, public code: string) { super(code); } } }));
import { atomicRpc } from '@/lib/atomic-rpc';
beforeEach(() => vi.clearAllMocks());
it('DB 함수가 없을 때 분할 쓰기로 되돌아가지 않는다', async () => {
  db.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'missing function' } });
  await expect(atomicRpc('decide_staff_role_atomic', {})).rejects.toMatchObject({ status: 503, code: 'db_update_required' });
  expect(db.from).not.toHaveBeenCalled();
});
it('잠금 안에서 요청자 자격이 사라졌으면 권한 오류를 돌려준다', async () => {
  db.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'rank' } });
  await expect(atomicRpc('decide_staff_role_atomic', {})).rejects.toMatchObject({ status: 403, code: 'rank' });
});
it('다른 담당자가 먼저 저장한 버전과 충돌하면 재시도 안내를 돌려준다', async () => {
  db.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'payroll_version_conflict' } });
  await expect(atomicRpc('append_payroll_version_atomic', {})).rejects.toMatchObject({ status: 409, code: 'payroll_version_conflict' });
});
it('SQL 오류 원문은 사용자 오류로 노출하지 않는다', async () => {
  db.rpc.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'private SQL details' } });
  await expect(atomicRpc('replace_payroll_override_atomic', {})).rejects.toThrow('replace_payroll_override_atomic: XX000');
});
