// 공식자료 정기 수집 (매월 1일 · 16일, vercel.json의 crons) — 「지금 업데이트」와 같은 길을 쓴다 (PRD v1.3 31장).
// 사람의 로그인 대신 서버 전용 비밀값(CRON_SECRET)으로만 불린다. 비밀값이 없으면 돌지 않는다 — 밖에서 아무나 부를 수 없게.
// 정기 실행도 「검토 대기」 후보까지만 만든다. 승인 · 반영은 하지 않는다.
import { timingSafeEqual } from 'node:crypto';
import { ApiError } from '@/lib/api';
import { runCollector } from '@/lib/payroll/collector/run';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: 'cron_not_configured' }, { status: 503 });
  const got = Buffer.from(req.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${secret}`);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return Response.json({ error: 'forbidden' }, { status: 403 });
  try {
    const r = await runCollector(null, 'scheduled');
    return Response.json({ runId: r.runId, status: r.status, failed: r.results.filter((x) => !x.ok).map((x) => x.source) });
  } catch (e) {
    if (e instanceof ApiError) return Response.json({ error: e.code }, { status: e.status });
    console.error(JSON.stringify({ route: 'cron.payroll-refresh', code: 'unhandled', detail: String((e as Error)?.message ?? e).slice(0, 200) }));
    return Response.json({ error: 'generic' }, { status: 500 });
  }
}
