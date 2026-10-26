// 백업 감시 (매일 아침 9시, vercel.json의 crons) — 매일 백업이 돌지 않은 경우를 잡는다 (2026-10-25: 보관소가 GitHub에서 다른 프로젝트의 저장공간으로 바뀜).
// 마지막 백업이 2일보다 오래됐으면 문제로 본다. 메일 계정이 설정돼 있으면 최고관리자(BACKUP_ALERT_EMAIL)에게 보내고, 아니면 서버 기록에 남긴다
// (통합설정 › 데이터베이스 백업 화면에도 빨간 안내가 뜬다). 고쳐질 때까지 매일 확인한다.
import { timingSafeEqual } from 'node:crypto';
import { sendBackupMail, mailConfigured, kstDate } from '@/lib/backup/mail';
import { backupReady, listBackups } from '@/lib/backup/run';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const STALE_DAYS = 2;

export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: 'cron_not_configured' }, { status: 503 });
  const got = Buffer.from(req.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${secret}`);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return Response.json({ error: 'forbidden' }, { status: 403 });
  if (!backupReady()) return Response.json({ error: 'backup_not_configured' }, { status: 503 });
  const today = kstDate();
  let last: string | null = null;
  let problem: string | null = null;
  try {
    const all = await listBackups();
    last = all[0]?.date ?? null;
    const days = last ? Math.round((Date.parse(today) - Date.parse(last)) / 86_400_000) : null;
    if (days === null) problem = '보관소에 백업이 하나도 없습니다.';
    else if (days > STALE_DAYS) problem = `마지막 백업이 ${days}일 전(${last})입니다. 매일 새벽에 돌아야 합니다.`;
  } catch (e) {
    problem = `백업 보관소를 확인하지 못했습니다 (${String((e as Error)?.message ?? e).slice(0, 200)}).`;
  }
  if (!problem) return Response.json({ ok: true, last });
  console.error(JSON.stringify({ route: 'cron.backup-watch', code: 'stale', detail: problem }));
  if (!mailConfigured() || !process.env.BACKUP_ALERT_EMAIL) return Response.json({ ok: false, last, alerted: false });
  try {
    await sendBackupMail(`⚠ 백업이 멈춘 것 같습니다 (${today})`, [
      problem,
      '',
      '지금 서비스는 그대로 돌아가고 있습니다. 통합설정 › 데이터 보관 › 데이터베이스 백업에서 [지금 백업]을 눌러 직접 받을 수 있습니다.',
      '고쳐질 때까지 이 메일은 매일 아침 옵니다.',
    ]);
  } catch (e) {
    console.error(JSON.stringify({ route: 'cron.backup-watch', code: 'mail_failed', detail: String((e as Error)?.message ?? e).slice(0, 200) }));
    return Response.json({ error: 'mail_failed' }, { status: 500 });
  }
  return Response.json({ ok: false, last, alerted: true });
}
