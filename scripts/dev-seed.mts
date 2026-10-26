// 개발용 DB(출퇴근관리-개발)를 운영과 같은 모양으로 만들고 자료를 복사한다 — `npx tsx scripts/dev-seed.mts <단계>`
//   schema : supabase/migrations를 순서대로 개발 DB에 적용한다
//   data   : 운영 DB의 자료(public 전체 + 로그인 정보)를 개발 DB로 복사한다 (개발 DB의 기존 자료는 지우고 다시 채운다)
//   verify : 두 DB의 표별 행 수를 견준다
// 읽기만 하는 쪽은 운영(.env.local의 SUPABASE_DB_URL), 쓰는 쪽은 개발(.env.dev의 DEV_SUPABASE_DB_URL)뿐이다.
// 안전장치: 쓰기 주소의 프로젝트 번호가 운영 번호와 같으면 멈춘다.
import { config } from 'dotenv';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';

config({ path: path.join(import.meta.dirname, '..', '.env.local'), quiet: true });
const PROD = process.env.SUPABASE_DB_URL!;
config({ path: path.join(import.meta.dirname, '..', '.env.dev'), quiet: true, override: false });
const DEV = process.env.DEV_SUPABASE_DB_URL!;
const stage = process.argv[2];
if (!PROD || !DEV || /\[YOUR-PASSWORD\]/.test(DEV)) throw new Error('접속 값이 비어 있습니다 (.env.local · .env.dev)');
const refOf = (u: string) => /postgres\.([a-z0-9]+):/.exec(u)?.[1] ?? '';
if (refOf(PROD) === refOf(DEV)) throw new Error('개발 주소가 운영 주소와 같습니다 — 멈춥니다');

const open = async (url: string) => {
  const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await c.connect();
  return c;
};

async function schema() {
  const dev = await open(DEV);
  const dir = path.join(import.meta.dirname, '..', 'supabase', 'migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const { rows } = await dev.query(`select count(*)::int n from information_schema.tables where table_schema='public'`);
  if (rows[0].n > 0) throw new Error(`개발 DB에 이미 표가 ${rows[0].n}개 있습니다 — 비어 있어야 합니다`);
  for (const f of files) {
    const sql = readFileSync(path.join(dir, f), 'utf8');
    try {
      await dev.query('begin');
      await dev.query(sql);
      await dev.query('commit');
      console.log('적용', f);
    } catch (e) {
      await dev.query('rollback').catch(() => {});
      console.log('실패', f, (e as Error).message);
      await dev.end();
      process.exit(1);
    }
  }
  console.log('끝 — 파일', files.length, '개');
  await dev.end();
}

const SKIP_PUBLIC = new Set<string>();
// 복사할 표: public 전체 + auth.users · auth.identities (로그인 정보)
async function tablesOf(c: pg.Client): Promise<string[]> {
  const { rows } = await c.query(`select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by table_name`);
  return [...rows.map((r) => `public.${r.table_name}`).filter((t) => !SKIP_PUBLIC.has(t)), 'auth.users', 'auth.identities'];
}
const colsOf = async (c: pg.Client, t: string) => {
  const [s, n] = t.split('.');
  const { rows } = await c.query(`select column_name from information_schema.columns where table_schema=$1 and table_name=$2 and is_generated='NEVER' and (generation_expression is null) order by ordinal_position`, [s, n]);
  return rows.map((r) => r.column_name as string);
};

async function data() {
  const prod = await open(PROD);
  const dev = await open(DEV);
  await dev.query(`set session_replication_role = replica`); // 트리거 · 외래키를 잠시 끄고 그대로 옮긴다 (이 연결에서만)
  const tables = await tablesOf(prod);
  // 먼저 한꺼번에 비운다(하나씩 비우면 cascade가 앞서 채운 표까지 지운다)
  const present: string[] = [];
  for (const t of tables) if ((await colsOf(dev, t)).length > 0) present.push(t);
  await dev.query(`truncate table ${present.join(', ')} cascade`);
  for (const t of tables) {
    const cols = await colsOf(prod, t);
    const devCols = new Set(await colsOf(dev, t));
    const use = cols.filter((x) => devCols.has(x));
    if (use.length === 0) { console.log('건너뜀(개발에 없음)', t); continue; }
    const list = use.map((x) => `"${x}"`).join(', ');
    // 서버에서 JSON으로 받는다 — pg 드라이버가 date를 내 PC 시간대의 날짜로 바꿔 하루씩 어긋나던 것을 막는다 (2026-10-26)
    const rows = (await prod.query(`select to_jsonb(x) j from (select ${list} from ${t}) x`)).rows.map((r) => r.j);
    const BATCH = 400;
    for (let i = 0; i < rows.length; i += BATCH) {
      const part = rows.slice(i, i + BATCH);
      await dev.query(`insert into ${t} (${list}) select ${list} from jsonb_populate_recordset(null::${t}, $1::jsonb)`, [JSON.stringify(part)]);
    }
    console.log('복사', t, rows.length);
  }
  // 번호표(시퀀스) 맞추기
  const seq = await dev.query(`select s.schemaname, s.sequencename, t.relname as tbl, a.attname as col from pg_sequences s join pg_class c on c.relname = s.sequencename join pg_depend d on d.objid = c.oid and d.deptype in ('a','i') join pg_class t on t.oid = d.refobjid join pg_attribute a on a.attrelid = t.oid and a.attnum = d.refobjsubid where s.schemaname = 'public'`);
  for (const s of seq.rows) await dev.query(`select setval('${s.schemaname}.${s.sequencename}', coalesce((select max("${s.col}") from public."${s.tbl}"), 1))`);
  console.log('번호표', seq.rows.length, '개 맞춤');
  await prod.end();
  await dev.end();
}

// 행 수가 아니라 내용까지 견준다(2026-10-26: 날짜가 하루씩 어긋난 채 「행 수가 같다」고만 확인해 지나간 일이 있었다).
// 값이 같고 표기만 다른 것(2.00 / 2)은 같게 본다. 운영 자료는 계속 바뀌므로 복사 뒤에 생긴 차이는 몇 건 있을 수 있어, 표마다 차이 개수를 보여 준다.
const canon = (v: unknown): string => (Array.isArray(v) ? `[${v.map(canon).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(',')}}` : JSON.stringify(v));
async function verify(): Promise<number> {
  const prod = await open(PROD);
  const dev = await open(DEV);
  let bad = 0;
  for (const t of await tablesOf(prod)) {
    let a: string[], b: string[];
    try {
      a = (await prod.query(`select to_jsonb(x)::text j from ${t} x`)).rows.map((r) => canon(JSON.parse(r.j)));
      b = (await dev.query(`select to_jsonb(x)::text j from ${t} x`)).rows.map((r) => canon(JSON.parse(r.j)));
    } catch { console.log('개발에 없음(건너뜀)', t); continue; }
    const cnt = (xs: string[]) => xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>());
    const A = cnt(a), B = cnt(b);
    let onlyProd = 0, onlyDev = 0;
    for (const [k, n] of A) onlyProd += Math.max(0, n - (B.get(k) ?? 0));
    for (const [k, n] of B) onlyDev += Math.max(0, n - (A.get(k) ?? 0));
    if (onlyProd || onlyDev) { bad++; console.log('다름', t, `운영 ${a.length} 개발 ${b.length} | 운영에만 ${onlyProd} 개발에만 ${onlyDev}`); }
  }
  console.log(bad === 0 ? '모든 표의 내용이 같습니다' : `내용이 다른 표 ${bad}개`);
  await prod.end();
  await dev.end();
  return bad;
}

if (stage === 'schema') await schema();
else if (stage === 'data') { await data(); if ((await verify()) > 0) process.exitCode = 1; }
else if (stage === 'verify') { if ((await verify()) > 0) process.exitCode = 1; }
else console.log('사용법: npx tsx scripts/dev-seed.mts schema | data | verify');
