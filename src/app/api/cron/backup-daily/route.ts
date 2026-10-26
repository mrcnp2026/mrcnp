// 매일 새벽 2시(한국) 자동 백업 (vercel.json의 crons, 2026-10-25 의뢰인). 다른 크론과 같은 방식으로 CRON_SECRET이 맞아야 돈다.
import { timingSafeEqual } from 'node:crypto';
import { backupReady, runBackup } from '@/lib/backup/run';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: 'cron_not_configured' }, { status: 503 });
  const got = Buffer.from(req.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${secret}`);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return Response.json({ error: 'forbidden' }, { status: 403 });
  if (!backupReady()) return Response.json({ error: 'backup_not_configured' }, { status: 503 });
  try {
    const r = await runBackup();
    console.log(JSON.stringify({ route: 'cron.backup-daily', ...r }));
    return Response.json({ ok: true, ...r });
  } catch (e) {
    console.error(JSON.stringify({ route: 'cron.backup-daily', code: 'failed', detail: String((e as Error)?.message ?? e).slice(0, 300) }));
    return Response.json({ error: 'backup_failed' }, { status: 500 });
  }
}
