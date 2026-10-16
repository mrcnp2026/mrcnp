// 출퇴근 폰 알림 — 직원 본인 미출근 · 미퇴근 · 어제 빠진 기록, 관리자 미출근 · 어제 미기록 묶음 (판정 lib/punch-alerts.ts, 보내기 lib/push-events.ts notifyPunchAlerts).
// vercel.json의 crons — Vercel 무료 요금제는 하루 한 번씩만 돼서 지금은 아침 09시대 · 밤 21시대(한국 시간) 두 번. Pro로 바꾸면 10분마다(*/10 * * * *) 하나로 바꾼다(2026-10-16).
// 같은 알림은 한 번만. 연습 모드에서는 보내지 않는다.
import { timingSafeEqual } from 'node:crypto';
import { notifyPunchAlerts } from '@/lib/push-events';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: 'cron_not_configured' }, { status: 503 });
  const got = Buffer.from(req.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${secret}`);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return Response.json({ error: 'forbidden' }, { status: 403 });
  try {
    return Response.json(await notifyPunchAlerts());
  } catch (e) {
    console.error(JSON.stringify({ route: 'cron.absent-watch', code: 'unhandled', detail: String((e as Error)?.message ?? e).slice(0, 200) }));
    return Response.json({ error: 'generic' }, { status: 500 });
  }
}
