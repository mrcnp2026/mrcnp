// 내 알림 숫자 — 종 아이콘 · 요청 배지가 화면을 옮길 때마다 · 1분마다 다시 읽는다 (2026-10-14 의뢰인: 숫자가 바로 반영되어야 한다)
// 공지(아직 확인 안 함) · 업무 메시지(안 읽음) · 처리할 요청(관리자 · 지점관리자만, 검사 계정 것은 실제 관리자에게 세지 않음)
import { getLocale } from 'next-intl/server';
import { getMe } from '@/lib/auth';
import { visibleNoticesNow } from '@/lib/notices';
import { pendingCounts } from '@/lib/period-data';
import { switchOn } from '@/lib/switches';
import { unreadCount } from '@/lib/work-messages';

export async function GET(): Promise<Response> {
  const me = await getMe();
  if (!me) return Response.json({ error: 'not_signed_in' }, { status: 401 });
  const approver = (me.role === 'admin' || me.role === 'manager') && (await switchOn('notify.request')); // 「요청 알림」 스위치 (2026-10-19)
  const [notices, messages, requests] = await Promise.all([
    visibleNoticesNow(me.id, await getLocale()).then((n) => n.filter((x) => !x.confirmed).length),
    unreadCount(me.id),
    approver ? pendingCounts().then((c) => c.total) : Promise.resolve(0),
  ]);
  return Response.json({ notices, messages, requests }, { headers: { 'cache-control': 'no-store' } });
}
