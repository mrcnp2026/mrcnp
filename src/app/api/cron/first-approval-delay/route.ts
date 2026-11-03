// 매일 09시 10분(한국) — 지점관리자가 하루(24시간) 넘게 1차 확인하지 않은 요청을 최고관리자에게 폰 알림 (권한-13, 2026-11-03 의뢰인).
// vercel.json: 10 0 * * * (UTC 0시 10분 = 한국 9시 10분). 같은 요청은 한 번만. 판단 · 보내기는 lib/first-approval.ts notifyFirstDelays.
import { timingSafeEqual } from 'node:crypto';
import { notifyFirstDelays } from '@/lib/first-approval';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: 'cron_not_configured' }, { status: 503 });
  const got = Buffer.from(req.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${secret}`);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return Response.json({ error: 'forbidden' }, { status: 403 });
  try {
    return Response.json({ sent: await notifyFirstDelays() });
  } catch (e) {
    console.error(JSON.stringify({ route: 'cron.first-approval-delay', code: 'unhandled', detail: String((e as Error)?.message ?? e).slice(0, 200) }));
    return Response.json({ error: 'generic' }, { status: 500 });
  }
}
