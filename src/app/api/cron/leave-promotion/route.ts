// 매일 아침 — 연차 사용 촉진 자동 알림 (2026-10-29 의뢰인: 「손으로가 아니라 자동으로 앱 푸시 · 메일」).
// 1차 통지 기간이 되면 만들어 둔 촉진을 자동으로 보내고, 계획을 안 낸 직원 · 2차 통지를 보낼 관리자에게 폰 알림 · 메일 (lib/leave-promotion-notify.ts).
// vercel.json: 0 0 * * * (UTC) = 한국 09:00 — 밤에 울리지 않게 아침에. 같은 알림은 한 번만.
import { timingSafeEqual } from 'node:crypto';
import { runPromotionAutomation } from '@/lib/leave-promotion-notify';
import { toKstDate } from '@/lib/time';

export const maxDuration = 300; // 직원 · 기록이 늘어도 시간 제한에 조용히 끊기지 않게 (2026-11-04, Fluid는 실제 계산 시간만 과금)
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: 'cron_not_configured' }, { status: 503 });
  const got = Buffer.from(req.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${secret}`);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return Response.json({ error: 'forbidden' }, { status: 403 });
  try {
    return Response.json(await runPromotionAutomation(toKstDate(new Date())));
  } catch (e) {
    console.error(JSON.stringify({ route: 'cron.leave-promotion', code: 'unhandled', detail: String((e as Error)?.message ?? e).slice(0, 200) }));
    return Response.json({ error: 'generic' }, { status: 500 });
  }
}
