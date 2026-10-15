// 운영 DB에 마이그레이션 파일을 적용한다 — MCP 연결이 없을 때 쓰는 길 (2026-10-15).
//   npx tsx scripts/apply-migration.mts --dry <파일...>   ← 한 트랜잭션 안에서 실행한 뒤 되돌린다(문법 · 함수 생성 확인만, 아무것도 남지 않음)
//   npx tsx scripts/apply-migration.mts --apply <파일...> ← 실제 적용 (파일 전체가 한 트랜잭션 — 중간에 실패하면 전부 되돌린다)
// 연결 주소는 .env.local의 SUPABASE_DB_URL. 주소 · 비밀번호는 화면에 찍지 않는다.
import { config } from 'dotenv';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';

config({ path: path.join(import.meta.dirname, '..', '.env.local'), quiet: true });
const mode = process.argv[2];
const files = process.argv.slice(3);
if ((mode !== '--dry' && mode !== '--apply') || files.length === 0) {
  console.log('사용법: --dry | --apply <파일...>');
  process.exit(2);
}
const url = process.env.SUPABASE_DB_URL;
if (!url) throw new Error('SUPABASE_DB_URL 없음');
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
let failed = false;
try {
  await client.query('begin');
  for (const f of files) {
    const sql = readFileSync(f, 'utf8');
    await client.query(sql);
    console.log(`실행됨: ${path.basename(f)}`);
  }
  if (mode === '--dry') {
    await client.query('rollback');
    console.log('시험 실행 성공 — 되돌렸습니다(아무것도 남지 않음)');
  } else {
    await client.query('commit');
    console.log('적용 완료');
  }
} catch (e) {
  failed = true;
  await client.query('rollback').catch(() => {});
  const err = e as { message?: string; position?: string; code?: string };
  console.log(`실패 — 전부 되돌렸습니다: [${err.code ?? ''}] ${err.message ?? e}${err.position ? ` (위치 ${err.position})` : ''}`);
} finally {
  await client.end();
}
process.exit(failed ? 1 : 0);
