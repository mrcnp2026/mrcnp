// 백업 실행 · 되살리기 (서버 전용) — 매일 새벽 자동 · 「지금 백업」 단추 · 되살리기 직전 자동에서 같은 함수를 쓴다 (2026-10-25 의뢰인).
// 흐름: 한 순간의 모습으로 받기 → 파일 검사 → 암호화 → 암호 풀어 다시 검사 → 다른 프로젝트의 비공개 보관소에 올리기 → 보관 규칙에 따라 오래된 것 지우기.
// 개발 서버(미리보기)는 개발 DB를 받아 dev/ 에, 운영은 prod/ 에 둔다 — 서로 섞이지 않는다.
import 'server-only';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { decryptFile, encryptFile } from './crypto';
import { checkLogical, dumpLogical } from './logical';
import { executeRestore, orphanCheck, planRestore, type RestoreMode, type TablePlan } from './restore';
import { downloadStored, keepRule, listStored, nameFor, removeStored, storeConfigured, uploadBackup, type StoredBackup } from './store';

export const backupPrefix = () => (process.env.VERCEL_ENV === 'preview' ? 'dev' : 'prod');
export const backupReady = () => storeConfigured() && Boolean(process.env.SUPABASE_DB_URL);
const NAME_OK = /^(prod|dev)\/db-\d{8}-\d{4,6}\.jsonl\.gz\.enc$/;

const client = async () => {
  const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 120_000 });
  await c.connect();
  return c;
};
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

export type BackupResult = { name: string; tables: number; rows: number; size: number; pruned: number };

export async function runBackup(): Promise<BackupResult> {
  if (!backupReady()) throw new Error('backup_not_configured');
  const password = process.env.BACKUP_PASSWORD!;
  const dir = await mkdtemp(path.join(tmpdir(), 'backup-'));
  const c = await client();
  try {
    const plain = path.join(dir, 'a.jsonl.gz'), enc = path.join(dir, 'a.enc'), back = path.join(dir, 'b.jsonl.gz');
    await c.query('begin isolation level repeatable read read only');
    const r = await dumpLogical(c, plain, backupPrefix());
    await c.query('commit');
    const first = await checkLogical(plain);
    if (!first.ok) throw new Error(`backup_check_failed: ${first.reason}`);
    await encryptFile(plain, enc, password);
    await decryptFile(enc, back, password);
    const second = await checkLogical(back);
    if (!second.ok) throw new Error(`backup_decrypt_check_failed: ${second.reason}`);
    const name = nameFor(new Date(), backupPrefix());
    await uploadBackup(name, enc);
    const size = (await stat(enc)).size;
    // 오래된 것 정리 — 방금 올린 것과 가장 최근 3개는 어떤 경우에도 지우지 않는다
    const all = await listStored(backupPrefix());
    const keep = keepRule(all.map((x) => ({ name: x.name, date: x.date })), kstToday());
    const newest3 = new Set([...all].sort((a, b) => b.name.localeCompare(a.name)).slice(0, 3).map((x) => x.name));
    const doomed = all.filter((x) => { const k = keep.get(x.name); return !!k && !k.recent && !k.monthly && !k.yearly && !newest3.has(x.name) && x.name !== name; }).map((x) => x.name);
    await removeStored(doomed);
    return { name, tables: r.tables.length, rows: r.rows, size, pruned: doomed.length };
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    await c.end().catch(() => {});
    await rm(dir, { recursive: true, force: true });
  }
}

export async function listBackups(): Promise<StoredBackup[]> {
  return (await listStored(backupPrefix())).sort((a, b) => b.name.localeCompare(a.name));
}

/** 보관소에서 받아 암호를 풀고 임시 파일 경로를 돌려준다. 끝나면 cleanup()을 부른다 */
async function open(name: string): Promise<{ file: string; cleanup: () => Promise<void> }> {
  if (!NAME_OK.test(name) || !name.startsWith(backupPrefix() + '/')) throw new Error('invalid_backup_name');
  const dir = await mkdtemp(path.join(tmpdir(), 'restore-'));
  const enc = path.join(dir, 'a.enc'), file = path.join(dir, 'a.jsonl.gz');
  await writeFile(enc, await downloadStored(name));
  await decryptFile(enc, file, process.env.BACKUP_PASSWORD!);
  const ok = await checkLogical(file);
  if (!ok.ok) { await rm(dir, { recursive: true, force: true }); throw new Error(`backup_corrupt: ${ok.reason}`); }
  return { file, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

/** 백업에 들어 있는 표와 행 수 (고르기 화면용) */
export async function backupContents(name: string): Promise<{ createdAt: string; tables: { t: string; n: number }[] }> {
  const { file, cleanup } = await open(name);
  try {
    const ok = await checkLogical(file);
    return { createdAt: ok.manifest!.createdAt, tables: ok.manifest!.tables };
  } finally { await cleanup(); }
}

export async function planFromBackup(name: string, tables: string[]): Promise<TablePlan[]> {
  const { file, cleanup } = await open(name);
  const c = await client();
  try { return await planRestore(c, file, tables); } finally { await c.end().catch(() => {}); await cleanup(); }
}

export type RestoreOutcome = { before: BackupResult; done: { t: string; inserted: number; updated: number; removed: number }[]; orphans: { table: string; fk: string; orphans: number }[] };

/** 되살리기: 먼저 지금 상태를 백업하고(되돌리기 직전 백업), 고른 표를 한 트랜잭션으로 되돌린 뒤 이어짐을 검사한다 */
export async function restoreFromBackup(name: string, tables: string[], mode: RestoreMode): Promise<RestoreOutcome> {
  const { file, cleanup } = await open(name);
  try {
    const before = await runBackup(); // 안전장치: 되살리기 직전 상태를 먼저 저장 — 이것이 실패하면 되살리지 않는다
    const c = await client();
    try {
      const done = await executeRestore(c, file, tables, mode);
      const orphans = await orphanCheck(c);
      return { before, done, orphans };
    } finally { await c.end().catch(() => {}); }
  } finally { await cleanup(); }
}
