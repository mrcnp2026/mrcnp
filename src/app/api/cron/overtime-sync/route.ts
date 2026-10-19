// 새벽 정기 작업 — 연장근로 확인을 지난달 1일부터 오늘까지 전체로 맞춘다 (2026-10-19 의뢰인: 화면을 열 때마다 하던 계산을 옮김).
// 기록이 바뀔 때는 그 사람 그날만 바로 맞추고(syncOvertimeFor), 여기서 빠진 것(근무규칙 변경 · 여러 날 한꺼번에 바뀐 것)을 다음 날 아침 전에 채운다.
// vercel.json: 매일 18:00 UTC = 한국 03:00.
import { timingSafeEqual } from 'node:crypto';
import { addDays } from '@/lib/calendar';
import { syncOvertimeRange } from '@/lib/period-data';
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
    const today = toKstDate(new Date());
    const from = `${addDays(`${today.slice(0, 7)}-01`, -1).slice(0, 7)}-01`; // 지난달 1일 — 달이 바뀐 직후에도 지난달 끝 주가 맞춰지게
    const changed = await syncOvertimeRange(from, today);
    return Response.json({ from, to: today, changed });
  } catch (e) {
    console.error(JSON.stringify({ route: 'cron.overtime-sync', code: 'unhandled', detail: String((e as Error)?.message ?? e).slice(0, 200) }));
    return Response.json({ error: 'generic' }, { status: 500 });
  }
}
