// 미출근 폰 알림 (vercel.json의 crons — Vercel 무료 요금제는 하루 한 번만 돼서 지금은 매일 09:00 한국 시간. Pro로 바꾸면 10분마다(*/10 * * * *)로 되돌린다, 2026-10-16) — 근무 시작 + 30분이 지나도 출근 기록이 없는 직원을 승인할 관리자에게 알린다.
// 한 사람에 하루 한 번. 연습 모드에서는 보내지 않는다. 판정은 lib/push-events.ts notifyAbsentToday.
import { timingSafeEqual } from 'node:crypto';
import { notifyAbsentToday } from '@/lib/push-events';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: 'cron_not_configured' }, { status: 503 });
  const got = Buffer.from(req.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${secret}`);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return Response.json({ error: 'forbidden' }, { status: 403 });
  try {
    return Response.json(await notifyAbsentToday());
  } catch (e) {
    console.error(JSON.stringify({ route: 'cron.absent-watch', code: 'unhandled', detail: String((e as Error)?.message ?? e).slice(0, 200) }));
    return Response.json({ error: 'generic' }, { status: 500 });
  }
}
