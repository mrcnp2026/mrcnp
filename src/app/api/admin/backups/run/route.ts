// 「지금 백업」 (통합설정 › 데이터 보관 › 데이터베이스 백업, 2026-10-25 의뢰인). 시스템관리자가 숫자 4자리로 열었을 때만.
import { api, ApiError } from '@/lib/api';
import { canDownloadBackup } from '@/lib/backup/github';
import { backupReady, runBackup } from '@/lib/backup/run';
import { requireConsole } from '@/lib/console-pin';

export const maxDuration = 300;

export const POST = api('admin.backups.run', async () => {
  const me = await requireConsole();
  if (!canDownloadBackup(me)) throw new ApiError(403, 'forbidden');
  if (!backupReady()) throw new ApiError(503, 'backup_not_configured');
  const r = await runBackup();
  console.log(JSON.stringify({ route: 'admin.backups.run', by: me.id, name: r.name, rows: r.rows }));
  return r;
});
