// 매일 09시 5분(한국) — 처리 기한이 지난 이상 기록을 담당자에게 폰 알림 (2026-10-19 의뢰인). 판단 · 보내기는 lib/anomaly-tasks.ts notifyOverdueAnomalies.
// vercel.json: 5 0 * * * (UTC 0시 5분 = 한국 9시 5분). 같은 건(직원 · 날짜 · 기한)은 한 번만.
import { timingSafeEqual } from 'node:crypto';
import { notifyOverdueAnomalies } from '@/lib/anomaly-tasks';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: 'cron_not_configured' }, { status: 503 });
  const got = Buffer.from(req.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${secret}`);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return Response.json({ error: 'forbidden' }, { status: 403 });
  try {
    return Response.json(await notifyOverdueAnomalies());
  } catch (e) {
    console.error(JSON.stringify({ route: 'cron.anomaly-overdue', code: 'unhandled', detail: String((e as Error)?.message ?? e).slice(0, 200) }));
    return Response.json({ error: 'generic' }, { status: 500 });
  }
}
