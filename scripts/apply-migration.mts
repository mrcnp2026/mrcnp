// 마이그레이션 파일 하나를 한 트랜잭션으로 적용하고 supabase_migrations 기록에도 남긴다.
// 사용: npm run db:apply -- supabase/migrations/파일.sql   (적용 뒤 npm run verify:rls — R-12-6)
import { config } from 'dotenv'; import pg from 'pg'; import fs from 'node:fs';
config({ path: '.env.local', quiet: true });
const file = process.argv[2]; const sql = fs.readFileSync(file, 'utf8');
const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL }); await c.connect();
try { await c.query('begin'); await c.query(sql);
  const name = file.replace(/^.*\d{14}_/, '').replace('.sql', '');
  const ver = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  await c.query('insert into supabase_migrations.schema_migrations(version, name, statements) values ($1,$2,$3)', [ver, name, [sql]]);
  await c.query('commit'); console.log('applied', name, ver);
} catch (e) { await c.query('rollback'); console.error('FAILED', (e as Error).message); process.exitCode = 1; } finally { await c.end(); }
