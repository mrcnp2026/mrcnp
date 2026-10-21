// 폰 알림 (웹 푸시, 2026-10-16 의뢰인 결정: 무료 웹 푸시 — 휴가 신청 · 미출근자 · 정정 요청). 서버 전용.
// 받는 사람: 그 직원의 요청을 승인할 수 있는 관리자 · 지점관리자 — 그중 최고관리자는 알림-9 규칙으로 거른다 (lib/push-recipients.ts, 2026-10-21).
// 받는 주소는 push_subscriptions (묶음 15). 표가 없거나 열쇠(VAPID)가 없으면 조용히 건너뛴다 — 알림 때문에 요청 저장이 실패하면 안 된다.
import 'server-only';
import webpush from 'web-push';
import { OFFICE } from '@/config/office';
import { staffPushFilter } from '@/lib/push-recipients';
import { approverIdsFor } from '@/lib/scope';
import { createAdminClient } from '@/lib/supabase/admin';

export type PushPayload = { title: string; body: string; url: string; tag?: string };

export function pushConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

let ready = false;
function setup(): boolean {
  if (!pushConfigured()) return false;
  if (!ready) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? 'mailto:admin@example.com', process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
    ready = true;
  }
  return true;
}

function log(code: string, detail: unknown) {
  console.error(JSON.stringify({ route: 'push', code, detail: String((detail as Error)?.message ?? detail).slice(0, 200) }));
}

/** 그 사람들의 폰 · PC 전부로 보낸다. 보낸 기기 수를 돌려준다. 실패해도 던지지 않는다 */
export async function sendPush(userIds: string[], payload: PushPayload): Promise<number> {
  if (userIds.length === 0 || !setup()) return 0;
  const db = createAdminClient();
  const { data, error } = await db.from('push_subscriptions').select('id, endpoint, p256dh, auth, fail_count').in('user_id', userIds);
  if (error) {
    log('load_failed', error.code);
    return 0;
  }
  const title = OFFICE.practiceMode ? `[연습] ${payload.title}` : payload.title;
  const body = JSON.stringify({ ...payload, title });
  let sent = 0;
  await Promise.all(
    (data ?? []).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 6 * 3600, urgency: 'high' });
        sent++;
        await db.from('push_subscriptions').update({ last_sent_at: new Date().toISOString(), fail_count: 0 }).eq('id', s.id);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        // 404 · 410 = 그 기기에서 알림을 끄거나 앱을 지움 → 주소를 지운다. 다른 실패는 5번 연속이면 지운다
        if (status === 404 || status === 410 || s.fail_count >= 4) await db.from('push_subscriptions').delete().eq('id', s.id);
        else await db.from('push_subscriptions').update({ fail_count: s.fail_count + 1 }).eq('id', s.id);
        if (status !== 404 && status !== 410) log('send_failed', `${status ?? ''} ${(e as Error)?.message ?? e}`);
      }
    }),
  );
  return sent;
}

/** 관리자에게 가는 알림 — 꺼진 최고관리자(대표자 · 켜지 않은 사람)는 뺀다 (알림-9). 본인 알림은 sendPush를 그대로 쓴다 */
export async function sendStaffPush(userIds: string[], payload: PushPayload): Promise<number> {
  if (userIds.length === 0 || !setup()) return 0;
  return sendPush(await staffPushFilter(userIds), payload);
}

/** 같은 알림을 한 번만 — 처음이면 true (push_sent에 표시를 남긴다) */
export async function firstTime(key: string): Promise<boolean> {
  const { error } = await createAdminClient().from('push_sent').insert({ key });
  if (!error) return true;
  if (error.code !== '23505') log('dedupe_failed', error.code);
  return false;
}

/** 직원의 요청을 승인할 수 있는 사람들에게. 검사 계정(e2e-)의 요청은 보내지 않는다 */
export async function notifyApprovers(employeeId: string, payload: PushPayload): Promise<void> {
  if (!pushConfigured()) return;
  try {
    const { data } = await createAdminClient().from('profiles').select('employee_no').eq('id', employeeId).maybeSingle();
    if (data?.employee_no?.startsWith('e2e-')) return;
    await sendStaffPush(await approverIdsFor(employeeId), payload);
  } catch (e) {
    log('notify_failed', e);
  }
}
