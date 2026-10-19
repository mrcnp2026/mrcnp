// 매일 새벽 — 입사일 · 회계연도 기준 연차를 자동으로 만들고 바로 지급한다 (2026-10-19 의뢰인: 「자동 생성 + 자동 승인」). 일은 lib/leave-ledger-data.ts autoAccrue.
// vercel.json: 10 18 * * * (UTC) = 한국 03:10. 같은 발생은 한 번만(지급 건 열쇠).
import { timingSafeEqual } from 'node:crypto';
import { autoAccrue } from '@/lib/leave-ledger-data';
import { toKstDate } from '@/lib/time';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: 'cron_not_configured' }, { status: 503 });
  const got = Buffer.from(req.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${secret}`);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return Response.json({ error: 'forbidden' }, { status: 403 });
  try {
    return Response.json(await autoAccrue(toKstDate(new Date())));
  } catch (e) {
    console.error(JSON.stringify({ route: 'cron.leave-accrual', code: 'unhandled', detail: String((e as Error)?.message ?? e).slice(0, 200) }));
    return Response.json({ error: 'generic' }, { status: 500 });
  }
}
