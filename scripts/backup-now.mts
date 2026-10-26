// 지금 바로 백업 — `npx tsx scripts/backup-now.mts [--dev]` (2026-10-25 의뢰인)
// 운영 DB(기본) 또는 개발 DB(--dev)의 자료를 표별 줄 파일로 받아 압축 · 암호화하고, 암호를 풀어 행 수가 같은지 확인한 뒤
// 내 PC의 근태관리/backups 폴더에 저장한다. 읽기만 한다 — DB를 바꾸지 않는다.
// 암호는 .env.local의 BACKUP_PASSWORD(없으면 새로 만들어 넣고, 근태관리/백업 비밀번호.txt에도 적는다 — 종이에 따로 적어 두세요).
import { config } from 'dotenv';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import pg from 'pg';
import { checkLogical, dumpLogical } from '../src/lib/backup/logical.ts';
import { decryptFile, encryptFile } from '../src/lib/backup/crypto.ts';
import { nameFor, uploadBackup } from '../src/lib/backup/store.ts';

const root = path.join(import.meta.dirname, '..');
config({ path: path.join(root, '.env.local'), quiet: true });
config({ path: path.join(root, '.env.dev'), quiet: true });
const dev = process.argv.includes('--dev');
const url = dev ? process.env.DEV_SUPABASE_DB_URL : process.env.SUPABASE_DB_URL;
if (!url || /\[YOUR-PASSWORD\]/.test(url)) throw new Error('DB 주소가 없습니다');

let password = process.env.BACKUP_PASSWORD;
if (!password) {
  password = randomBytes(18).toString('base64url');
  appendFileSync(path.join(root, '.env.local'), `\n# 백업 파일 암호 (2026-10-25) — 잃어버리면 백업을 열 수 없습니다. 근태관리/백업 비밀번호.txt에도 적어 둠\nBACKUP_PASSWORD=${password}\n`);
  writeFileSync(path.join(root, '..', '..', '백업 비밀번호.txt'), `백업 파일 암호 (이 암호가 없으면 백업을 열 수 없습니다. 종이에 적어 따로 보관하세요)\n\n${password}\n`);
  console.log('백업 암호를 새로 만들었습니다 → 근태관리/백업 비밀번호.txt');
}

const stamp = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace(/[-:T]/g, '').replace(/^(\d{8})(\d{4})$/, '$1-$2');
const dir = path.join(root, '..', '..', 'backups', dev ? 'dev' : 'prod');
mkdirSync(dir, { recursive: true });
const plain = path.join(dir, `db-${stamp}.jsonl.gz`);
const enc = `${plain}.enc`;
const check = path.join(dir, `.check-${stamp}.jsonl.gz`);

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
try {
  await c.query('begin isolation level repeatable read read only'); // 한 순간의 모습으로 받는다(받는 동안 바뀌어도 표들이 서로 맞는다)
  const r = await dumpLogical(c, plain, dev ? 'dev' : 'prod');
  await c.query('commit');
  const ok1 = await checkLogical(plain);
  if (!ok1.ok) throw new Error('받은 파일 검사 실패: ' + ok1.reason);
  await encryptFile(plain, enc, password);
  await decryptFile(enc, check, password);
  const ok2 = await checkLogical(check);
  if (!ok2.ok) throw new Error('암호를 풀어 본 파일 검사 실패: ' + ok2.reason);
  rmSync(plain); rmSync(check);
  const mb = (statSync(enc).size / 1024 / 1024).toFixed(2);
  console.log(`백업 완료: ${enc}\n  표 ${r.tables.length}개 · 행 ${r.rows}개 · ${mb}MB · 암호 풀어 행 수 대조 통과`);
  if (process.argv.includes('--upload')) {
    // 운영 DB와 다른 프로젝트(개발)의 비공개 보관소에도 올린다
    process.env.BACKUP_STORE_URL ??= process.env.DEV_SUPABASE_URL;
    process.env.BACKUP_STORE_KEY ??= process.env.DEV_SUPABASE_SERVICE_ROLE_KEY;
    const name = nameFor(new Date(), dev ? 'dev' : 'prod');
    await uploadBackup(name, enc);
    console.log('  보관소에도 올림:', name);
  }
  // 가장 큰 표 몇 개
  console.log('  큰 표:', r.tables.sort((a, b) => b.n - a.n).slice(0, 5).map((x) => `${x.t.replace('public.', '')} ${x.n}`).join(', '));
} catch (e) {
  await c.query('rollback').catch(() => {});
  for (const f of [plain, check]) if (existsSync(f)) rmSync(f);
  console.error('백업 실패:', (e as Error).message);
  process.exitCode = 1;
} finally {
  await c.end();
}
void readFileSync;
