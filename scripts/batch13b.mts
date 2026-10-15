// 묶음 13 추가 정리 (의뢰인 2026-10-16: 「시험 직원」 계정 삭제 · 검사가 만든 설정 삭제 — 「지워」)
//   npx tsx scripts/batch13b.mts --dry | --apply
// 씨앗: 「시험 직원」(employee_no test) · 이름이 e2e-로 시작하는 장소 · 사무실 주소 · 조직 · 근무일정 템플릿 · 직무 · 계약 종류 · 휴가 정책 그룹 · 휴가 종류 · 「[점검]」 공지.
// 외래키를 따라 딸린 기록을 모은다. 남기는 계정(profiles)은 지우지 않고, 지우는 설정을 가리키는 칸만 비운다.
// 지운 계정이 「누가」로 남은 기록은 그 칸만 시스템관리자로 바꾼다. 백업 → 한 번에 지우기 → 끊어진 연결 0 확인 → 확정.
import { config } from 'dotenv';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';

config({ path: path.join(import.meta.dirname, '..', '.env.local'), quiet: true });
const mode = process.argv[2];
if (mode !== '--dry' && mode !== '--apply') {
  console.log('사용법: --dry | --apply');
  process.exit(2);
}
const SEEDS: [string, string][] = [
  ['office_locations', `label like 'e2e%'`], ['office_networks', `label like 'e2e%'`], ['org_groups', `name like 'e2e%'`],
  ['shift_templates', `name like 'e2e%'`], ['jobs', `name like 'e2e%'`], ['pay_contract_types', `name like 'e2e%'`],
  ['leave_policy_groups', `name like 'e2e%'`], ['notices', `title like '[점검]%'`],
];
const OWNER_COLS = new Set(['id', 'employee_id', 'target_id', 'profile_id', 'manager_id', 'admin_id', 'sender_id', 'author_id']);

const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const q = async <T = Record<string, unknown>>(sql: string, args: unknown[] = []) => (await c.query(sql, args)).rows as T[];
let ok = false;
try {
  await q('begin');
  const fks = await q<{ child: string; col: string; parent: string; pcol: string }>(`
    select c.conrelid::regclass::text child, a.attname col, c.confrelid::regclass::text parent, pa.attname pcol
      from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
      join pg_attribute pa on pa.attrelid=c.confrelid and pa.attnum=c.confkey[1]
     where c.contype='f' and c.connamespace='public'::regnamespace and array_length(c.conkey,1)=1`);
  const hasId = new Set((await q<{ t: string }>(`select table_name t from information_schema.columns where table_schema='public' and column_name='id'`)).map((r) => r.t));
  const kill = new Map<string, Set<string>>();
  const add = (t: string, ids: string[]) => {
    const s = kill.get(t) ?? new Set<string>();
    let n = 0;
    for (const id of ids) if (!s.has(id)) { s.add(id); n++; }
    kill.set(t, s);
    return n;
  };
  const gone = (await q<{ id: string }>(`select id::text from public.profiles where employee_no = 'test'`)).map((r) => r.id);
  add('profiles', gone);
  for (const [t, where] of SEEDS) add(t, (await q<{ id: string }>(`select id::text from public.${t} where ${where}`)).map((r) => r.id));
  // 휴가 종류는 번호 대신 코드로 이어진다
  const codes = (await q<{ code: string }>(`select code from public.leave_types where name like 'e2e%'`)).map((r) => r.code);
  for (const f of fks.filter((x) => x.parent === 'leave_types')) add(f.child, (await q<{ id: string }>(`select id::text from public.${f.child} where ${f.col} = any($1::text[])`, [codes])).map((r) => r.id));
  const sysadmin = (await q<{ id: string }>(`select id::text from public.profiles where employee_no='admin'`))[0].id;

  const actorFix: { child: string; col: string }[] = [];
  const nullFix: { child: string; col: string; parent: string }[] = [];
  const noIdDeletes: { child: string; col: string; parent: string }[] = [];
  for (let changed = true; changed; ) {
    changed = false;
    for (const fk of fks.filter((x) => x.pcol === 'id')) {
      const ids = [...(kill.get(fk.parent) ?? [])];
      if (ids.length === 0) continue;
      if (fk.parent === 'profiles' && !OWNER_COLS.has(fk.col)) {
        if (!actorFix.some((a) => a.child === fk.child && a.col === fk.col)) actorFix.push(fk);
        continue;
      }
      if (fk.child === 'profiles') { // 남기는 계정은 지우지 않고 칸만 비운다
        if (!nullFix.some((a) => a.col === fk.col)) nullFix.push(fk);
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
  const allIds = [...kill.values()].flatMap((s) => [...s]);
  add('decision_log', (await q<{ id: string }>(`select id::text from public.decision_log where subject_id::text = any($1::text[])`, [allIds])).map((r) => r.id));

  console.log('지울 기록 (표: 건수)');
  for (const [t, s] of [...kill.entries()].filter(([, s]) => s.size > 0).sort()) console.log(`  ${t}: ${s.size}`);
  for (const d of noIdDeletes) {
    const n = (await q<{ n: string }>(`select count(*) n from public.${d.child} where ${d.col}::text = any($1::text[])`, [[...(kill.get(d.parent) ?? [])]]))[0].n;
    if (n !== '0') console.log(`  ${d.child}(${d.col}): ${n}`);
  }
  console.log(`  leave_types(code): ${codes.length}`);
  for (const nf of nullFix) {
    const r = await q<{ name: string }>(`select name from public.profiles where ${nf.col}::text = any($1::text[]) and not (id::text = any($2::text[]))`, [[...(kill.get(nf.parent) ?? [])], gone]);
    if (r.length) console.log(`  남기는 계정의 ${nf.col} 비움: ${r.map((x) => x.name).join(', ')}`);
  }
  const keepNames = (await q<{ n: string }>(`select string_agg(label, ', ') n from public.office_locations where not (id::text = any($1::text[]))`, [[...(kill.get('office_locations') ?? [])]]))[0].n;
  console.log(`남는 장소: ${keepNames}`);
  console.log(`남는 조직: ${(await q<{ n: string }>(`select string_agg(name, ', ') n from public.org_groups where not (id::text = any($1::text[]))`, [[...(kill.get('org_groups') ?? [])]]))[0].n}`);
  console.log(`남는 공지: ${(await q<{ n: string }>(`select string_agg(status, ', ') n from public.notices where not (id::text = any($1::text[]))`, [[...(kill.get('notices') ?? [])]]))[0].n}`);

  if (mode === '--apply') {
    const backup: Record<string, unknown> = { at: new Date().toISOString(), profilesBefore: await q(`select * from public.profiles`), leaveTypes: await q(`select * from public.leave_types where code = any($1::text[])`, [codes]) };
    for (const [t, s] of kill) if (s.size) backup[t] = await q(`select * from public.${t} where id::text = any($1::text[])`, [[...s]]);
    for (const d of noIdDeletes) backup[`${d.child}(${d.col})`] = await q(`select * from public.${d.child} where ${d.col}::text = any($1::text[])`, [[...(kill.get(d.parent) ?? [])]]);
    for (const a of actorFix) backup[`actor:${a.child}.${a.col}`] = hasId.has(a.child) ? await q(`select id, ${a.col} from public.${a.child} where ${a.col}::text = any($1::text[])`, [gone]) : [];
    const dir = path.join(import.meta.dirname, '..', '..', '..', '백업');
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `묶음13-추가정리-백업-${backup.at as string}.json`.replaceAll(':', '-'));
    writeFileSync(file, JSON.stringify(backup));
    console.log(`\n백업 파일: ${path.basename(file)}`);
  }

  await q(`set local session_replication_role = replica`);
  for (const a of actorFix) {
    const keep = [...(kill.get(a.child) ?? [])];
    await q(`update public.${a.child} set ${a.col} = '${sysadmin}'::uuid where ${a.col}::text = any($1::text[])${hasId.has(a.child) ? ' and not (id::text = any($2::text[]))' : ''}`, hasId.has(a.child) ? [gone, keep] : [gone]);
  }
  for (const nf of nullFix) await q(`update public.profiles set ${nf.col} = null where ${nf.col}::text = any($1::text[])`, [[...(kill.get(nf.parent) ?? [])]]);
  for (const d of noIdDeletes) await q(`delete from public.${d.child} where ${d.col}::text = any($1::text[])`, [[...(kill.get(d.parent) ?? [])]]);
  for (const [t, s] of kill) if (s.size) await q(`delete from public.${t} where id::text = any($1::text[])`, [[...s]]);
  await q(`delete from public.leave_types where code = any($1::text[])`, [codes]);
  await q(`set local session_replication_role = origin`);

  let bad = 0;
  for (const fk of fks) {
    const n = Number((await q<{ n: string }>(`select count(*) n from public.${fk.child} x where x.${fk.col} is not null and not exists (select 1 from ${fk.parent.includes('.') ? fk.parent : `public.${fk.parent}`} p where p.${fk.pcol} = x.${fk.col})`))[0].n);
    if (n) { console.log(`❌ 끊어진 연결 ${fk.child}.${fk.col} → ${fk.parent}: ${n}`); bad++; }
  }
  for (const [t, where] of SEEDS) {
    const n = Number((await q<{ n: string }>(`select count(*) n from public.${t} where ${where}`))[0].n);
    if (n) { console.log(`❌ 남음 ${t}: ${n}`); bad++; }
  }
  console.log(`\n남은 계정: ${(await q<{ n: string }>(`select string_agg(name || '(' || employee_no || ')', ', ' order by created_at) n from public.profiles`))[0].n}`);
  if (bad) throw new Error(`검사 실패 ${bad}건`);
  if (mode === '--dry') {
    await q('rollback');
    console.log('\n시험 실행 성공 — 되돌렸습니다(아무것도 바뀌지 않음)');
  } else {
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
