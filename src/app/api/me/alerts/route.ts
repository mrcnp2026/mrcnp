// 내 알림 숫자 — 종 아이콘 · 요청 배지가 화면을 옮길 때마다 · 1분마다 다시 읽는다 (2026-10-14 의뢰인: 숫자가 바로 반영되어야 한다)
// 공지(아직 확인 안 함) · 업무 메시지(안 읽음) · 처리할 요청(관리자 · 지점관리자만, 검사 계정 것은 실제 관리자에게 세지 않음)
import { getLocale } from 'next-intl/server';
import { getMe } from '@/lib/auth';
import { visibleNoticesNow } from '@/lib/notices';
import { pendingCounts } from '@/lib/period-data';
import { pendingSignupCount } from '@/lib/signup';
import { switchOn } from '@/lib/switches';
import { myDecidedCount } from '@/lib/my-decided';
import { unreadCount } from '@/lib/work-messages';

export async function GET(): Promise<Response> {
  const me = await getMe();
  if (!me) return Response.json({ error: 'not_signed_in' }, { status: 401 });
  const approver = (me.role === 'admin' || me.role === 'manager') && (await switchOn('notify.request')); // 「요청 알림」 스위치 (2026-10-19)
  const [notices, messages, requests, decided] = await Promise.all([
    visibleNoticesNow(me.id, await getLocale()).then((n) => n.filter((x) => !x.confirmed).length),
    unreadCount(me.id),
    // 직원 가입 신청은 최고관리자만 승인한다 — 종 숫자에 같이 센다 (2026-10-26)
    approver ? Promise.all([pendingCounts().then((c) => c.total), me.role === 'admin' ? pendingSignupCount() : 0]).then(([a, b]) => a + b) : Promise.resolve(0),
    myDecidedCount(me.id), // 내 요청 중 처리된 것 — 「요청」 메뉴 숫자 (2026-10-19)
  ]);
  return Response.json({ notices, messages, requests, decided }, { headers: { 'cache-control': 'no-store' } });
}
