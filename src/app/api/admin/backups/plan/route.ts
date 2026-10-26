// 백업과 지금을 표별로 견준다 — 지워진 행 · 바뀐 행 · 그 뒤에 새로 생긴 행. 아무것도 바꾸지 않는다.
import { api, ApiError, readJson } from '@/lib/api';
import { canDownloadBackup } from '@/lib/backup/github';
import { isBackupTable } from '@/lib/backup/logical';
import { backupReady, planFromBackup } from '@/lib/backup/run';
import { requireConsole } from '@/lib/console-pin';

export const maxDuration = 300;

export const POST = api('admin.backups.plan', async (req) => {
  const me = await requireConsole();
  if (!canDownloadBackup(me)) throw new ApiError(403, 'forbidden');
  if (!backupReady()) throw new ApiError(503, 'backup_not_configured');
  const b = await readJson(req);
  if (typeof b.name !== 'string' || !Array.isArray(b.tables) || b.tables.length === 0 || b.tables.length > 200 || b.tables.some((t) => typeof t !== 'string' || !isBackupTable(t))) throw new ApiError(400, 'invalid_input');
  try {
    return { plan: await planFromBackup(b.name, b.tables as string[]) };
  } catch (e) {
    if (String((e as Error).message).startsWith('invalid_backup_name')) throw new ApiError(400, 'invalid_input');
    throw e;
  }
});
