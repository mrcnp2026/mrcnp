// 권한 회귀 검사 (부록 R-12-6) — tests/rls-regression.sql을 실제 DB에서 돌린다.
// SQL은 마지막에 일부러 오류를 내서 시험 데이터를 전부 되돌리고, 결과를 오류 메시지에 담아 돌려준다.
// SUPABASE_DB_URL이 없으면 건너뛴다 (계정 없이 돌리는 `npm run verify`용). `npm run verify:rls`는 없으면 실패한다.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import { describe, expect, it } from 'vitest';

const EXPECTED_CHECKS = 30;
const dbUrl = process.env.SUPABASE_DB_URL;
const required = process.env.RLS_REQUIRED === '1';

describe('권한 회귀 검사 (R-12-6)', () => {
  it.runIf(required)('SUPABASE_DB_URL이 code/.env.local에 있다', () => {
    expect(dbUrl, 'code/.env.local에 SUPABASE_DB_URL을 넣으세요 (.env.sample 참고)').toBeTruthy();
  });

  it.skipIf(!dbUrl)('직원·관리자·비로그인·서버 권한으로 기록 표 직접 쓰기가 전부 거부된다', async () => {
    const sql = readFileSync(path.join(__dirname, 'rls-regression.sql'), 'utf8');
    const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    await client.connect();
    let message = '';
    try {
      await client.query(sql);
    } catch (e) {
      message = (e as Error).message;
    } finally {
      await client.end();
    }
    const m = message.match(/RLS_RESULTS_BEGIN([\s\S]*)RLS_RESULTS_END/);
    expect(m, `SQL이 결과 없이 실패했습니다: ${message}`).toBeTruthy();
    const lines = m![1].split('\n').filter(Boolean);
    const failures = lines.filter((l) => l.startsWith('FAIL'));
    expect(failures, failures.join('\n')).toEqual([]);
    expect(lines.length).toBe(EXPECTED_CHECKS);
  }, 30_000);
});
