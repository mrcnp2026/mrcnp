// 백업 하나에 어떤 표가 얼마나 들어 있는지 (되살리기 고르기 화면용). 보기만 한다.
import { api, ApiError, readJson } from '@/lib/api';
import { canDownloadBackup } from '@/lib/backup/github';
import { backupContents, backupReady } from '@/lib/backup/run';
import { requireConsole } from '@/lib/console-pin';

export const maxDuration = 120;

export const POST = api('admin.backups.contents', async (req) => {
  const me = await requireConsole();
  if (!canDownloadBackup(me)) throw new ApiError(403, 'forbidden');
  if (!backupReady()) throw new ApiError(503, 'backup_not_configured');
  const b = await readJson(req);
  if (typeof b.name !== 'string') throw new ApiError(400, 'invalid_input');
  try {
    return await backupContents(b.name);
  } catch (e) {
    if (String((e as Error).message).startsWith('invalid_backup_name')) throw new ApiError(400, 'invalid_input');
    throw e;
  }
});
