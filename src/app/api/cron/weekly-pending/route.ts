// 매주 월요일 09시(한국) — 처리하지 않은 요청이 남아 있으면 승인할 관리자에게 한 번 더 폰 알림 (2026-10-19 의뢰인). 판단 · 보내기는 lib/push-events.ts notifyWeeklyPending.
// vercel.json: 0 0 * * 1 (UTC 월요일 0시 = 한국 9시). 같은 알림은 그날 한 번만.
import { timingSafeEqual } from 'node:crypto';
import { notifyWeeklyPending } from '@/lib/push-events';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: 'cron_not_configured' }, { status: 503 });
  const got = Buffer.from(req.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${secret}`);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return Response.json({ error: 'forbidden' }, { status: 403 });
  try {
    return Response.json(await notifyWeeklyPending());
  } catch (e) {
    console.error(JSON.stringify({ route: 'cron.weekly-pending', code: 'unhandled', detail: String((e as Error)?.message ?? e).slice(0, 200) }));
    return Response.json({ error: 'generic' }, { status: 500 });
  }
}
