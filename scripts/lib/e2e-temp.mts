// 검사용 임시 계정 — 만들고(동의 · 공지 확인 · 초대 링크까지), 끝나면 그 계정과 계정을 가리키는 기록을 모두 지운다 (2026-10-16: 운영 DB에 검사 자료를 남기지 않는다).
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import pg from 'pg';

config({ path: path.join(import.meta.dirname, '..', '..', '.env.local'), quiet: true });
export const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

export async function tempAccount(no: string, name: string, role: 'admin' | 'employee', extra: Record<string, unknown> = {}): Promise<{ id: string; token: string }> {
  const { CONSENT } = await import('../../src/config/consent.ts');
  const { data: u, error } = await db.auth.admin.createUser({ email: `${no}@staff.invalid`, email_confirm: true });
  if (error) throw new Error(`createUser ${no}: ${error.message}`);
  const id = u.user!.id;
  await db.from('profiles').insert({ id, name, employee_no: no, role, locale: 'ko', active: true, ...extra });
  await db.from('consents').insert({ employee_id: id, kind: CONSENT.kind, version: CONSENT.version, locale: 'ko' });
  const token = randomBytes(32).toString('base64url');
  await db.from('invites').insert({ employee_id: id, token_hash: createHash('sha256').update(token).digest('hex'), issued_via: 'emergency', expires_at: new Date(Date.now() + 3600e3).toISOString() });
  return { id, token };
}

/** 임시 계정과 그 계정을 가리키는 기록을 지운다 — 외래키를 따라, 보호 장치는 이 트랜잭션에서만 끈다 */
export async function dropAccounts(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    await c.query('begin');
    await c.query('set local session_replication_role = replica');
    const fks = (await c.query(`select c.conrelid::regclass::text child, a.attname col from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1] where c.contype='f' and c.confrelid='public.profiles'::regclass and c.conrelid <> 'public.profiles'::regclass`)).rows as { child: string; col: string }[];
    for (const f of fks) await c.query(`delete from public.${f.child} where ${f.col}::text = any($1::text[])`, [ids]);
    await c.query(`delete from public.decision_log where decided_by::text = any($1::text[])`, [ids]);
    await c.query(`delete from public.profiles where id::text = any($1::text[])`, [ids]);
    await c.query('commit');
    for (const id of ids) await db.auth.admin.deleteUser(id);
    console.log(`정리: 임시 계정 ${ids.length}개와 자료 삭제`);
  } catch (e) {
    await c.query('rollback');
    throw e;
  } finally {
    await c.end();
  }
}
