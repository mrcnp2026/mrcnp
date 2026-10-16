// 이 기기에서 폰 알림 받기 켜기 · 끄기 · 시험 보내기 (2026-10-16). 관리자 · 지점관리자만 — 지금 알림은 승인할 사람에게만 간다.
//   POST   { endpoint, keys: { p256dh, auth }, device? }  → 켜기 (같은 주소면 주인 · 열쇠를 새로)
//   DELETE { endpoint }                                    → 끄기 (자기 것만)
//   PUT                                                    → 내 기기 전부에 시험 알림
import { api, ApiError, readJson } from '@/lib/api';
import { getMe } from '@/lib/auth';
import { pushConfigured, sendPush } from '@/lib/push';
import { createAdminClient } from '@/lib/supabase/admin';

async function approver() {
  const me = await getMe();
  if (!me) throw new ApiError(401, 'not_signed_in');
  if (me.role !== 'admin' && me.role !== 'manager') throw new ApiError(403, 'forbidden');
  if (!pushConfigured()) throw new ApiError(503, 'push_not_configured');
  return me;
}

const str = (v: unknown, max: number) => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null);

export const POST = api('push.subscribe', async (req) => {
  const me = await approver();
  const b = await readJson(req);
  const keys = (b.keys ?? {}) as Record<string, unknown>;
  const endpoint = str(b.endpoint, 1000);
  const p256dh = str(keys.p256dh, 200);
  const auth = str(keys.auth, 100);
  if (!endpoint || !endpoint.startsWith('https://') || !p256dh || !auth) throw new ApiError(400, 'invalid_input');
  const { error } = await createAdminClient()
    .from('push_subscriptions')
    .upsert({ user_id: me.id, endpoint, p256dh, auth, device: str(b.device, 200), fail_count: 0 }, { onConflict: 'endpoint' });
  if (error?.code === '42P01' || error?.code === 'PGRST205') throw new ApiError(503, 'db_update_required');
  if (error) throw new Error(`push.subscribe: ${error.code}`);
  return { ok: true };
});

export const DELETE = api('push.unsubscribe', async (req) => {
  const me = await getMe();
  if (!me) throw new ApiError(401, 'not_signed_in');
  const endpoint = str((await readJson(req)).endpoint, 1000);
  if (!endpoint) throw new ApiError(400, 'invalid_input');
  const { error } = await createAdminClient().from('push_subscriptions').delete().eq('endpoint', endpoint).eq('user_id', me.id);
  if (error && error.code !== '42P01' && error.code !== 'PGRST205') throw new Error(`push.unsubscribe: ${error.code}`);
  return { ok: true };
});

export const PUT = api('push.test', async () => {
  const me = await approver();
  const sent = await sendPush([me.id], { title: '폰 알림 시험', body: '이 알림이 보이면 휴가 신청 · 정정 요청 · 미출근 알림을 받을 수 있습니다.', url: '/admin', tag: 'push-test' });
  return { sent };
});
