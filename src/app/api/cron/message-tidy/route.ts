// 매일 09시 20분(한국) — 7일 지난 요청 처리 결과 글(「○○가 승인되었습니다」)을 전달함에서 숨긴다 (2026-11-03 의뢰인). 지우지 않는다(0085).
// vercel.json: 20 0 * * * (UTC 0시 20분 = 한국 9시 20분). 판단은 lib/work-messages.ts hideOldDecisionMessages.
import { timingSafeEqual } from 'node:crypto';
import { hideOldDecisionMessages } from '@/lib/work-messages';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: 'cron_not_configured' }, { status: 503 });
  const got = Buffer.from(req.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${secret}`);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return Response.json({ error: 'forbidden' }, { status: 403 });
  try {
    return Response.json({ hidden: await hideOldDecisionMessages() });
  } catch (e) {
    console.error(JSON.stringify({ route: 'cron.message-tidy', code: 'unhandled', detail: String((e as Error)?.message ?? e).slice(0, 200) }));
    return Response.json({ error: 'generic' }, { status: 500 });
  }
}
