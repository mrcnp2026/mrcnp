// 백업 감시 (매일 아침 9시, vercel.json의 crons) — 주간 백업이 아예 돌지 않은 경우를 잡는다.
// 백업이 실패하면 백업 프로그램이 직접 메일을 보내지만, GitHub Actions가 멈추면 그 메일도 오지 않는다.
// 마지막 백업이 8일보다 오래됐으면 최고관리자(BACKUP_ALERT_EMAIL)에게 메일을 보낸다. 고쳐질 때까지 매일 보낸다.
import { timingSafeEqual } from 'node:crypto';
import { listBackups } from '@/lib/backup/github';
import { sendBackupMail, mailConfigured, kstDate } from '@/lib/backup/mail';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const STALE_DAYS = 8;

export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: 'cron_not_configured' }, { status: 503 });
  const got = Buffer.from(req.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${secret}`);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return Response.json({ error: 'forbidden' }, { status: 403 });
  if (!mailConfigured() || !process.env.BACKUP_REPO || !process.env.BACKUP_GITHUB_TOKEN) {
    return Response.json({ error: 'backup_not_configured' }, { status: 503 });
  }
  const today = kstDate();
  let last: string | null = null;
  let problem: string | null = null;
  try {
    const all = await listBackups();
    last = all.at(-1)?.date ?? null;
    const days = last ? Math.round((Date.parse(today) - Date.parse(last)) / 86_400_000) : null;
    if (days === null) problem = '보관소에 백업이 하나도 없습니다.';
    else if (days > STALE_DAYS) problem = `마지막 백업이 ${days}일 전(${last})입니다. 매주 일요일에 돌아야 합니다.`;
  } catch (e) {
    problem = `백업 보관소를 확인하지 못했습니다 (${String((e as Error)?.message ?? e).slice(0, 200)}).`;
  }
  if (!problem) return Response.json({ ok: true, last });
  try {
    await sendBackupMail(`⚠ 백업이 멈춘 것 같습니다 (${today})`, [
      problem,
      '',
      '지금 서비스는 그대로 돌아가고 있고, 최근 7일치는 Supabase 자체 백업에 있습니다.',
      '할 일: 개발 담당에게 이 메일을 전달해 주세요. GitHub 저장소의 Actions 화면에서 「주간 백업」이 꺼져 있거나 실패했는지 확인합니다.',
      '고쳐질 때까지 이 메일은 매일 아침 옵니다.',
    ]);
  } catch (e) {
    console.error(JSON.stringify({ route: 'cron.backup-watch', code: 'mail_failed', detail: String((e as Error)?.message ?? e).slice(0, 200) }));
    return Response.json({ error: 'mail_failed' }, { status: 500 });
  }
  return Response.json({ ok: false, last, alerted: true });
}
