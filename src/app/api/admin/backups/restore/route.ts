// 백업으로 되살리기 (2026-10-25 의뢰인). 시스템관리자 + 숫자 4자리 + 확인 문구 「되돌리기」를 직접 입력해야 한다.
// 먼저 지금 상태를 백업하고(실패하면 되살리지 않는다), 고른 표를 한 번의 처리로 되돌린 뒤 이어짐을 검사한다.
import { api, ApiError, readJson } from '@/lib/api';
import { canDownloadBackup } from '@/lib/backup/github';
import { isBackupTable } from '@/lib/backup/logical';
import { backupReady, restoreFromBackup } from '@/lib/backup/run';
import { requireConsole } from '@/lib/console-pin';

export const maxDuration = 300;
const MODES = ['missing', 'revert', 'replace'] as const;

export const POST = api('admin.backups.restore', async (req) => {
  const me = await requireConsole();
  if (!canDownloadBackup(me)) throw new ApiError(403, 'forbidden');
  if (!backupReady()) throw new ApiError(503, 'backup_not_configured');
  const b = await readJson(req);
  const mode = MODES.find((m) => m === b.mode);
  if (typeof b.name !== 'string' || !mode || !Array.isArray(b.tables) || b.tables.length === 0 || b.tables.length > 200 || b.tables.some((t) => typeof t !== 'string' || !isBackupTable(t))) throw new ApiError(400, 'invalid_input');
  if (b.confirm !== '되돌리기') throw new ApiError(400, 'restore_confirm_required');
  try {
    const r = await restoreFromBackup(b.name, b.tables as string[], mode);
    console.log(JSON.stringify({ route: 'admin.backups.restore', by: me.id, from: b.name, mode, tables: b.tables, before: r.before.name, orphans: r.orphans.length }));
    return r;
  } catch (e) {
    if (String((e as Error).message).startsWith('invalid_backup_name')) throw new ApiError(400, 'invalid_input');
    throw e;
  }
});
