// 백업 파일 열기 — 암호화된 백업(.sql.gz.enc)을 풀어 .sql 파일로 만든다.
// 사용: npx tsx scripts/backup-open.mts <받은 파일.sql.gz.enc>
// 비밀번호는 BACKUP_PASSWORD (.env.local 또는 실행할 때 환경변수로)
// 되살리기는 사람이 확인하며 한다: 새 Supabase 프로젝트에 psql로 넣는다 (파일 앞부분이 로그인 정보, 뒷부분이 앱 표 · 자료).
import { createReadStream, createWriteStream, rmSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import { config } from 'dotenv';
import { decryptFile } from '../src/lib/backup/crypto.ts';

config({ path: '.env.local', quiet: true });
const src = process.argv[2];
const password = process.env.BACKUP_PASSWORD;
if (!src || !src.endsWith('.sql.gz.enc')) {
  console.error('사용: npx tsx scripts/backup-open.mts <파일.sql.gz.enc>');
  process.exit(1);
}
if (!password) {
  console.error('BACKUP_PASSWORD가 없습니다');
  process.exit(1);
}
const gz = src.replace(/\.enc$/, '');
const sql = gz.replace(/\.gz$/, '');
try {
  await decryptFile(src, gz, password);
  await pipeline(createReadStream(gz), createGunzip(), createWriteStream(sql));
  console.log(`풀었습니다: ${sql}\n이 파일에는 개인정보가 그대로 들어 있습니다. 다 쓰면 지워 주세요.`);
} catch (e) {
  console.error('풀지 못했습니다 — 비밀번호가 틀렸거나 파일이 상했습니다.', String((e as Error)?.message ?? e));
  process.exitCode = 1;
} finally {
  rmSync(gz, { force: true });
}
