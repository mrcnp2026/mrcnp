// 묶음 13 적용 — 등급 두 가지 · 요청 위치 칸 · 연습 기록 + 검사 계정 + 검사가 남긴 먼 미래 설정 삭제 · 근무 규칙 시작일 당기기 (승인 2026-10-16).
//   npx tsx scripts/batch13.mts --dry     ← 한 트랜잭션에서 전부 해 보고 되돌린다(숫자만 보여 줌)
//   npx tsx scripts/batch13.mts --apply   ← 백업 파일을 먼저 쓰고 적용한다
// 지우는 방법: 씨앗(연습 표시 · 검사 계정 · 2069년 이후 설정) → 외래키를 따라 딸린 기록을 모두 모은다 → 백업 → 보호 장치를 잠시 끄고 한 번에 지운다
//   → 보호 장치를 다시 켜고, 끊어진 연결이 0인지 · 연습 기록이 0인지 검사한다. 하나라도 어긋나면 전부 되돌린다.
// 검사 계정이 「한 사람」으로 남아 있는 실제 기록(누가 만들었나 · 누가 승인했나 칸)은 지우지 않고 그 칸만 시스템관리자로 바꾼다(원래 값은 백업).
import { config } from 'dotenv';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';

config({ path: path.join(import.meta.dirname, '..', '.env.local'), quiet: true });
const mode = process.argv[2];
if (mode !== '--dry' && mode !== '--apply') {
  console.log('사용법: --dry | --apply');
  process.exit(2);
}
const MIG = path.join(import.meta.dirname, '..', 'supabase', 'migrations');
const FILES = ['20261011000032_punch_request_location.sql', '20261016000046_two_grades.sql'];
const FAR = '2069-01-01'; // 이 날 이후의 설정은 자동 검사가 남긴 것(실제 자료 없음 — 2026-10-16 확인)
const FAR_SEEDS: [string, string][] = [
  ['work_rules', 'effective_from'], ['app_settings', 'effective_from'], ['pay_rule_sets', 'effective_from'],
  ['payroll_company_setting_versions', 'valid_from'], ['payroll_reference_versions', 'valid_from'], ['shifts', 'work_date'],
];
const OWNER_COLS = new Set(['id', 'employee_id', 'target_id', 'profile_id', 'manager_id', 'admin_id', 'sender_id', 'author_id']);
const RULE_FROM = '2026-08-01';

const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const q = async <T = Record<string, unknown>>(sql: string, args: unknown[] = []) => (await c.query(sql, args)).rows as T[];
let ok = false;
try {
  await q('begin');
  // 1 · 2: 마이그레이션
  for (const f of FILES) {
    await c.query(readFileSync(path.join(MIG, f), 'utf8'));
    console.log(`실행됨: ${f}`);
  }

  // 3 · 4 · 5: 지울 기록 모으기
  const fks = await q<{ child: string; col: string; parent: string; pcol: string; nullable: boolean }>(`
    select c.conrelid::regclass::text child, a.attname col, c.confrelid::regclass::text parent, pa.attname pcol, not a.attnotnull nullable
      from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
      join pg_attribute pa on pa.attrelid=c.confrelid and pa.attnum=c.confkey[1]
     where c.contype='f' and c.connamespace='public'::regnamespace and array_length(c.conkey,1)=1 and pa.attname='id'`);
  const hasId = new Set((await q<{ t: string }>(`select table_name t from information_schema.columns where table_schema='public' and column_name='id'`)).map((r) => r.t));
  const kill = new Map<string, Set<string>>();
  const add = (t: string, ids: string[]) => {
    const s = kill.get(t) ?? new Set<string>();
    let n = 0;
    for (const id of ids) if (!s.has(id)) { s.add(id); n++; }
    kill.set(t, s);
    return n;
  };
  for (const { t } of await q<{ t: string }>(`select table_name t from information_schema.columns where table_schema='public' and column_name='is_test'`))
    add(t, (await q<{ id: string }>(`select id::text from public.${t} where is_test`)).map((r) => r.id));
  const e2e = (await q<{ id: string }>(`select id::text from public.profiles where employee_no in ('e2e-audit','e2e-audit2','e2e-audit3')`)).map((r) => r.id);
  add('profiles', e2e);
  for (const [t, col] of FAR_SEEDS) add(t, (await q<{ id: string }>(`select id::text from public.${t} where ${col} >= $1`, [FAR])).map((r) => r.id));
  const sysadmin = (await q<{ id: string }>(`select id::text from public.profiles where employee_no='admin'`))[0].id;

  const actorFix: { child: string; col: string; nullable: boolean }[] = [];
  const noIdDeletes: { child: string; col: string; parent: string }[] = [];
  for (let changed = true; changed; ) {
    changed = false;
    for (const fk of fks) {
      const ids = [...(kill.get(fk.parent) ?? [])];
      if (ids.length === 0) continue;
      if (fk.parent === 'profiles' && !OWNER_COLS.has(fk.col)) {
        if (!actorFix.some((a) => a.child === fk.child && a.col === fk.col)) actorFix.push(fk);
        continue;
      }
      if (!hasId.has(fk.child)) {
        if (!noIdDeletes.some((a) => a.child === fk.child && a.col === fk.col)) noIdDeletes.push(fk);
        continue;
      }
      const found = (await q<{ id: string }>(`select id::text from public.${fk.child} where ${fk.col}::text = any($1::text[])`, [ids])).map((r) => r.id);
      if (add(fk.child, found) > 0) changed = true;
    }
  }
  // 「누가」 칸만 검사 계정을 가리키는 남는 기록
  const actorRows: { table: string; col: string; id: string | null; old: string }[] = [];
  for (const a of actorFix) {
    const rows = hasId.has(a.child)
      ? await q<{ id: string; v: string }>(`select id::text, ${a.col}::text v from public.${a.child} where ${a.col}::text = any($1::text[]) and not (id::text = any($2::text[]))`, [e2e, [...(kill.get(a.child) ?? [])]])
      : await q<{ id: string; v: string }>(`select null as id, ${a.col}::text v from public.${a.child} where ${a.col}::text = any($1::text[])`, [e2e]);
    for (const r of rows) actorRows.push({ table: a.child, col: a.col, id: r.id, old: r.v });
  }
  // 결정 기록(외래키 없음)에서 지우는 기록을 가리키는 줄
  const allIds = [...kill.values()].flatMap((s) => [...s]);
  const decisionIds = (await q<{ id: string }>(`select id::text from public.decision_log where subject_id::text = any($1::text[])`, [allIds])).map((r) => r.id);
  add('decision_log', decisionIds);

  console.log('\n지울 기록 (표: 건수)');
  for (const [t, s] of [...kill.entries()].filter(([, s]) => s.size > 0).sort()) console.log(`  ${t}: ${s.size}`);
  for (const d of noIdDeletes) {
    const n = (await q<{ n: string }>(`select count(*) n from public.${d.child} where ${d.col}::text = any($1::text[])`, [[...(kill.get(d.parent) ?? [])]]))[0].n;
    if (n !== '0') console.log(`  ${d.child}(${d.col}): ${n}`);
  }
  console.log(`\n남기고 「누가」 칸만 바꾸는 기록: ${actorRows.length}건`, [...new Set(actorRows.map((r) => `${r.table}.${r.col}`))].join(', '));

  // 백업
  if (mode === '--apply') {
    const backup: Record<string, unknown> = { at: new Date().toISOString(), actorRows, profilesBefore: await q(`select * from public.profiles`), workRulesBefore: await q(`select * from public.work_rules`) };
    for (const [t, s] of kill) if (s.size) backup[t] = await q(`select * from public.${t} where id::text = any($1::text[])`, [[...s]]);
    for (const d of noIdDeletes) backup[`${d.child}(${d.col})`] = await q(`select * from public.${d.child} where ${d.col}::text = any($1::text[])`, [[...(kill.get(d.parent) ?? [])]]);
    const dir = path.join(import.meta.dirname, '..', '..', '..', '백업');
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `묶음13-백업-${backup.at as string}.json`.replaceAll(':', '-'));
    writeFileSync(file, JSON.stringify(backup));
    console.log(`\n백업 파일: ${path.relative(path.join(import.meta.dirname, '..', '..', '..'), file)}`);
  }

  // 지우기 — 보호 장치(트리거 · 외래키 검사)를 이 트랜잭션 안에서만 끈다
  await q(`set local session_replication_role = replica`);
  for (const a of actorFix) {
    const keep = [...(kill.get(a.child) ?? [])];
    const set = `'${sysadmin}'::uuid`; // 비우면 다른 규칙(결정자 필수 등)에 걸린다 — 원래 값은 백업 파일에
    await q(`update public.${a.child} set ${a.col} = ${set} where ${a.col}::text = any($1::text[])${hasId.has(a.child) ? ' and not (id::text = any($2::text[]))' : ''}`, hasId.has(a.child) ? [e2e, keep] : [e2e]);
  }
  for (const d of noIdDeletes) await q(`delete from public.${d.child} where ${d.col}::text = any($1::text[])`, [[...(kill.get(d.parent) ?? [])]]);
  for (const [t, s] of kill) if (s.size) await q(`delete from public.${t} where id::text = any($1::text[])`, [[...s]]);
  // 등급: 테스트 관리자(총괄관리자) → 일반직원 (2026-10-15 의뢰인: 등급 두 가지)
  await q(`update public.profiles set role = 'employee', admin_level = null, can_view_payroll = false where admin_level = 'general'`);
  // 근무 규칙 시작일 당기기 — 8 · 9월 자료를 넣으려면 그날 규칙이 있어야 한다
  const rules = await q<{ id: string }>(`select id::text from public.work_rules where active order by effective_from`);
  if (rules.length !== 1) throw new Error(`쓰는 근무 규칙이 1개가 아님: ${rules.length}`);
  await q(`update public.work_rules set effective_from = $1 where id = $2`, [RULE_FROM, rules[0].id]);
  await q(`set local session_replication_role = origin`);

  // 검사
  let bad = 0;
  for (const fk of await q<{ child: string; col: string; parent: string; pcol: string }>(`
    select c.conrelid::regclass::text child, a.attname col, c.confrelid::regclass::text parent, pa.attname pcol
      from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
      join pg_attribute pa on pa.attrelid=c.confrelid and pa.attnum=c.confkey[1]
     where c.contype='f' and c.connamespace='public'::regnamespace`)) {
    const n = Number((await q<{ n: string }>(`select count(*) n from public.${fk.child} x where x.${fk.col} is not null and not exists (select 1 from ${fk.parent.includes('.') ? fk.parent : `public.${fk.parent}`} p where p.${fk.pcol} = x.${fk.col})`))[0].n);
    if (n) { console.log(`❌ 끊어진 연결 ${fk.child}.${fk.col} → ${fk.parent}: ${n}`); bad++; }
  }
  for (const { t } of await q<{ t: string }>(`select table_name t from information_schema.columns where table_schema='public' and column_name='is_test'`)) {
    const n = Number((await q<{ n: string }>(`select count(*) n from public.${t} where is_test`))[0].n);
    if (n) { console.log(`❌ 연습 기록 남음 ${t}: ${n}`); bad++; }
  }
  const tops = await q<{ name: string; admin_level: string }>(`select name, admin_level from public.profiles where admin_level is not null`);
  console.log(`\n관리자 구분: ${tops.map((t) => `${t.name}=${t.admin_level}`).join(', ')}`);
  console.log(`근무 규칙 시작일: ${(await q<{ d: string }>(`select effective_from::text d from public.work_rules where active`)).map((r) => r.d).join(', ')}`);
  console.log(`남은 계정: ${(await q<{ n: string }>(`select string_agg(name, ', ' order by created_at) n from public.profiles`))[0].n}`);
  if (bad) throw new Error(`검사 실패 ${bad}건`);

  if (mode === '--dry') {
    await q('rollback');
    console.log('\n시험 실행 성공 — 되돌렸습니다(아무것도 바뀌지 않음)');
  } else {
    await q(`insert into supabase_migrations.schema_migrations (version, name) values ('20261011000032', 'punch_request_location'), ('20261016000046', 'two_grades') on conflict do nothing`);
    await q('commit');
    console.log('\n적용 완료');
  }
  ok = true;
} catch (e) {
  await c.query('rollback').catch(() => {});
  const err = e as { message?: string; code?: string };
  console.log(`실패 — 전부 되돌렸습니다: [${err.code ?? ''}] ${err.message ?? e}`);
} finally {
  await c.end();
}
process.exit(ok ? 0 : 1);
