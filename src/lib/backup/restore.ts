// 백업으로 되살리기 (2026-10-25 의뢰인: 잘못된 수정은 백업 파일로 바로 되돌릴 수 있게).
// 1) planRestore: 백업과 지금을 표별로 견준다 — 지워진 행 · 바뀐 행 · 그 뒤에 새로 생긴 행 개수. 아무것도 바꾸지 않는다.
// 2) executeRestore: 고른 표를 한 번의 트랜잭션으로 되돌린다. 중간에 하나라도 실패하면 전부 취소된다.
//    방식(mode):
//      missing  = 지워진 행만 되살린다(바뀐 행 · 새 행은 그대로)
//      revert   = 지워진 행을 되살리고, 바뀐 행은 백업 때 값으로 되돌린다(그 뒤에 생긴 행은 그대로)
//      replace  = 그 표를 백업과 똑같이 만든다(그 뒤에 생긴 행도 지운다)
// 이 앱의 표 대부분은 지우기 · 고치기를 막는 장치(트리거)가 있다. 되살리기는 이 연결에서만 그 장치를 잠시 끈다(session_replication_role = replica).
// 외래키 검사도 함께 꺼지므로, 서로 이어진 표는 같이 고르도록 안내하고 끝난 뒤 이어짐을 다시 검사한다.
import type { Client } from 'pg';
import { isBackupTable, readLogical } from './logical';

export type RestoreMode = 'missing' | 'revert' | 'replace';
export type TablePlan = { t: string; inBackup: number; now: number; deleted: number; changed: number; added: number; pk: string[] };

async function pkOf(c: Pick<Client, 'query'>, t: string): Promise<string[]> {
  const [s, n] = t.split('.');
  const { rows } = await c.query(
    `select a.attname from pg_index i join pg_class cl on cl.oid = i.indrelid join pg_namespace ns on ns.oid = cl.relnamespace join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
      where i.indisprimary and ns.nspname = $1 and cl.relname = $2 order by array_position(i.indkey::int2[], a.attnum)`, [s, n]);
  return rows.map((r: { attname: string }) => r.attname);
}
const keyOf = (r: Record<string, unknown>, pk: string[]) => pk.map((k) => String(r[k])).join('\u0001');
const sameRow = (a: Record<string, unknown>, b: Record<string, unknown>) => JSON.stringify(Object.keys(a).sort().map((k) => [k, a[k]])) === JSON.stringify(Object.keys(b).sort().map((k) => [k, b[k]]));

/** 백업 파일에서 고른 표의 행만 모은다 */
async function rowsOf(file: string, tables: Set<string>): Promise<Map<string, Record<string, unknown>[]>> {
  const out = new Map<string, Record<string, unknown>[]>([...tables].map((t) => [t, []]));
  for await (const o of readLogical(file)) if (o.k === 'row' && tables.has(o.t as string)) out.get(o.t as string)!.push(o.r as Record<string, unknown>);
  return out;
}

export async function planRestore(c: Pick<Client, 'query'>, file: string, tables: string[]): Promise<TablePlan[]> {
  for (const t of tables) if (!isBackupTable(t)) throw new Error(`되살릴 수 없는 표: ${t}`);
  const backup = await rowsOf(file, new Set(tables));
  const plan: TablePlan[] = [];
  for (const t of tables) {
    const pk = await pkOf(c, t);
    if (pk.length === 0) throw new Error(`${t}: 기본키가 없어 견줄 수 없습니다`);
    const now = new Map<string, Record<string, unknown>>();
    const { rows } = await c.query(`select to_jsonb(x) j from ${t} x`);
    for (const r of rows) now.set(keyOf(r.j, pk), r.j);
    const was = backup.get(t) ?? [];
    let deleted = 0, changed = 0;
    const seen = new Set<string>();
    for (const r of was) {
      const k = keyOf(r, pk);
      seen.add(k);
      const cur = now.get(k);
      if (!cur) deleted++;
      else if (!sameRow(r, cur)) changed++;
    }
    let added = 0;
    for (const k of now.keys()) if (!seen.has(k)) added++;
    plan.push({ t, inBackup: was.length, now: now.size, deleted, changed, added, pk });
  }
  return plan;
}

export async function executeRestore(c: Pick<Client, 'query'>, file: string, tables: string[], mode: RestoreMode): Promise<{ t: string; inserted: number; updated: number; removed: number }[]> {
  for (const t of tables) if (!isBackupTable(t)) throw new Error(`되살릴 수 없는 표: ${t}`);
  const backup = await rowsOf(file, new Set(tables));
  const done: { t: string; inserted: number; updated: number; removed: number }[] = [];
  await c.query('begin');
  try {
    await c.query('set local session_replication_role = replica');
    for (const t of tables) {
      const pk = await pkOf(c, t);
      if (pk.length === 0) throw new Error(`${t}: 기본키가 없습니다`);
      const was = backup.get(t) ?? [];
      const before = Number((await c.query(`select count(*)::int n from ${t}`)).rows[0].n);
      let removed = 0;
      if (mode === 'replace') {
        removed = (await c.query(`delete from ${t}`)).rowCount ?? 0;
      }
      const cols = (await c.query(`select column_name from information_schema.columns where table_schema = $1 and table_name = $2 and is_generated = 'NEVER' order by ordinal_position`, t.split('.'))).rows.map((r: { column_name: string }) => `"${r.column_name}"`);
      const pkq = pk.map((k) => `"${k}"`).join(', ');
      const setList = cols.filter((x: string) => !pk.includes(x.slice(1, -1))).map((x: string) => `${x} = excluded.${x}`).join(', ');
      const conflict = mode === 'missing' || !setList ? 'do nothing' : `(${pkq}) do update set ${setList}`;
      const target = mode === 'missing' || !setList ? `on conflict (${pkq}) do nothing` : `on conflict ${conflict}`;
      for (let i = 0; i < was.length; i += 400) {
        await c.query(`insert into ${t} (${cols.join(', ')}) select ${cols.join(', ')} from jsonb_populate_recordset(null::${t}, $1::jsonb) ${target}`, [JSON.stringify(was.slice(i, i + 400))]);
      }
      const after = Number((await c.query(`select count(*)::int n from ${t}`)).rows[0].n);
      const inserted = Math.max(0, after - (before - removed));
      done.push({ t, inserted, updated: mode === 'revert' || mode === 'replace' ? Math.max(0, was.length - inserted) : 0, removed });
    }
    // 번호표(시퀀스) 맞추기
    const seq = await c.query(`select s.schemaname, s.sequencename, t.relname as tbl, a.attname as col from pg_sequences s join pg_class c on c.relname = s.sequencename join pg_depend d on d.objid = c.oid and d.deptype in ('a','i') join pg_class t on t.oid = d.refobjid join pg_attribute a on a.attrelid = t.oid and a.attnum = d.refobjsubid where s.schemaname = 'public'`);
    for (const s of seq.rows) await c.query(`select setval('${s.schemaname}.${s.sequencename}', greatest(1, coalesce((select max("${s.col}") from public."${s.tbl}"), 1)))`);
    await c.query('commit');
  } catch (e) {
    await c.query('rollback');
    throw e;
  }
  return done;
}

/** 끝난 뒤 이어짐 검사 — 외래키가 가리키는 행이 없는 것을 센다(되살리기 중에는 이 검사가 꺼져 있었다) */
export async function orphanCheck(c: Pick<Client, 'query'>): Promise<{ table: string; fk: string; orphans: number }[]> {
  const { rows } = await c.query(`select conrelid::regclass::text tbl, conname, pg_get_constraintdef(oid) def, conrelid, confrelid, conkey, confkey from pg_constraint where contype = 'f' and connamespace = 'public'::regnamespace`);
  const bad: { table: string; fk: string; orphans: number }[] = [];
  for (const f of rows) {
    const child = await c.query(`select attname from pg_attribute where attrelid = $1 and attnum = any($2::int2[]) order by array_position($2::int2[], attnum)`, [f.conrelid, f.conkey]);
    const parent = await c.query(`select attname from pg_attribute where attrelid = $1 and attnum = any($2::int2[]) order by array_position($2::int2[], attnum)`, [f.confrelid, f.confkey]);
    const pt = (await c.query(`select $1::oid::regclass::text t`, [f.confrelid])).rows[0].t;
    const on = child.rows.map((r: { attname: string }, i: number) => `p."${parent.rows[i].attname}" = c."${r.attname}"`).join(' and ');
    const notNull = child.rows.map((r: { attname: string }) => `c."${r.attname}" is not null`).join(' and ');
    const n = Number((await c.query(`select count(*)::int n from ${f.tbl} c where ${notNull} and not exists (select 1 from ${pt} p where ${on})`)).rows[0].n);
    if (n > 0) bad.push({ table: f.tbl, fk: f.conname, orphans: n });
  }
  return bad;
}
