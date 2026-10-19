// 요청 목록에서 지우기 · 되살리기 (2026-10-19 의뢰인) — 요청 기록은 그대로, 내 목록에서만 뺀다.
//   POST   { keys: string[] }  → 지우기 (처리가 끝난 것만, 내가 볼 수 있는 것만)
//   DELETE { keys: string[] }  → 되살리기
import type { NextRequest } from 'next/server';
import { api, ApiError, readJson } from '@/lib/api';
import { getMe } from '@/lib/auth';
import { loadRequests } from '@/lib/request-data';
import { createAdminClient } from '@/lib/supabase/admin';

const KEY = /^[a-zA-Z]+:[0-9a-f-]{36}$/;

async function keysOf(req: NextRequest) {
  const me = await getMe();
  if (!me) throw new ApiError(401, 'not_signed_in');
  const raw = (await readJson(req)).keys;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 200 || !raw.every((k) => typeof k === 'string' && KEY.test(k))) throw new ApiError(400, 'invalid_input');
  return { me, keys: [...new Set(raw as string[])] };
}

const dbError = (code: string | undefined, where: string) => {
  if (code === '42P01' || code === 'PGRST205') throw new ApiError(503, 'db_update_required');
  throw new Error(`${where}: ${code}`);
};

export const POST = api('requests.hide', async (req) => {
  const { me, keys } = await keysOf(req);
  // 관리자는 전 직원 요청, 직원은 자기 요청만 — 목록에 보이는 처리 끝난 것만 지운다
  const mine = await loadRequests(me.role === 'admin' ? {} : { employeeId: me.id });
  const done = new Set(mine.filter((r) => r.status !== 'pending').map((r) => r.key));
  const ok = keys.filter((k) => done.has(k));
  if (ok.length === 0) throw new ApiError(400, 'invalid_input');
  const { error } = await createAdminClient().from('request_hides').upsert(ok.map((k) => ({ viewer_id: me.id, item_key: k })), { onConflict: 'viewer_id,item_key' });
  if (error) dbError(error.code, 'requests.hide');
  return { hidden: ok.length };
});

export const DELETE = api('requests.unhide', async (req) => {
  const { me, keys } = await keysOf(req);
  const { error } = await createAdminClient().from('request_hides').delete().eq('viewer_id', me.id).in('item_key', keys);
  if (error) dbError(error.code, 'requests.unhide');
  return { ok: true };
});
