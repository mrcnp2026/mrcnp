// 자료 백업(표별 줄 단위) — 2026-10-25 의뢰인: 잘못된 수정을 백업으로 바로 되돌릴 수 있게.
// 한 파일 = gzip으로 묶은 줄(JSON Lines). 첫 줄은 안내(manifest), 그다음은 표마다 「표 시작」 줄과 행 줄들, 마지막에 「끝」 줄.
//   {"k":"manifest", ...}  {"k":"table","t":"public.profiles","n":27}  {"k":"row","t":"public.profiles","r":{...}} … {"k":"end","rows":N}
// 행은 DB의 to_jsonb 모양 그대로라서, 되살릴 때 jsonb_populate_recordset로 같은 표에 그대로 넣을 수 있다(표 모양은 supabase/migrations가 만든다).
// 왜 pg_dump가 아닌가: 표 하나만 · 기간만 골라 되살리려면 줄 단위가 훨씬 쉽고, 서버(Vercel)에서도 돌아간다.
import { createGunzip, createGzip } from 'node:zlib';
import { createReadStream, createWriteStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import type { Client } from 'pg';

/** 백업에 넣는 표: public 전체 + 로그인 정보 두 표 */
export async function backupTables(c: Pick<Client, 'query'>): Promise<string[]> {
  const { rows } = await c.query(`select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by table_name`);
  return [...rows.map((r: { table_name: string }) => `public.${r.table_name}`), 'auth.users', 'auth.identities'];
}

const SAFE = /^(public|auth)\.[a-z_][a-z0-9_]*$/;
export const isBackupTable = (t: string) => SAFE.test(t);

export type Manifest = { k: 'manifest'; v: 1; createdAt: string; source: string; tables: { t: string; n: number }[] };

/** DB의 자료를 gzip 줄 파일로 쓴다. 쓴 표 · 행 수를 돌려준다 */
export async function dumpLogical(c: Pick<Client, 'query'>, outPath: string, source: string): Promise<{ tables: { t: string; n: number }[]; rows: number }> {
  const names = await backupTables(c);
  const counts: { t: string; n: number }[] = [];
  for (const t of names) counts.push({ t, n: Number((await c.query(`select count(*)::bigint n from ${t}`)).rows[0].n) });
  const gz = createGzip({ level: 9 });
  const out = createWriteStream(outPath);
  gz.pipe(out);
  const put = async (o: unknown) => { if (!gz.write(JSON.stringify(o) + '\n')) await once(gz, 'drain'); };
  const manifest: Manifest = { k: 'manifest', v: 1, createdAt: new Date().toISOString(), source, tables: counts };
  await put(manifest);
  let rows = 0;
  for (const { t, n } of counts) {
    await put({ k: 'table', t, n });
    const PAGE = 2000;
    // 한 번에 다 읽지 않고 쪽으로 나눠 읽는다(큰 표가 메모리를 넘치지 않게). 순서는 고정하지 않아도 되지만 쪽이 겹치지 않게 ctid로 정렬한다
    for (let off = 0; off < n; off += PAGE) {
      const { rows: part } = await c.query(`select to_jsonb(x) j from (select * from ${t} order by ctid limit ${PAGE} offset ${off}) x`);
      for (const r of part) { await put({ k: 'row', t, r: r.j }); rows++; }
    }
  }
  await put({ k: 'end', rows });
  gz.end();
  await once(out, 'finish');
  return { tables: counts, rows };
}

/** 백업 파일을 줄 단위로 읽는다 */
export async function* readLogical(path: string): AsyncGenerator<Record<string, unknown>> {
  const rl = createInterface({ input: createReadStream(path).pipe(createGunzip()), crlfDelay: Infinity });
  for await (const line of rl) if (line.trim()) yield JSON.parse(line) as Record<string, unknown>;
}

/** 파일이 끝까지 온전한지 + 안내의 행 수와 실제 행 수가 같은지 */
export async function checkLogical(path: string): Promise<{ ok: boolean; manifest: Manifest | null; counts: Map<string, number>; reason?: string }> {
  const counts = new Map<string, number>();
  let manifest: Manifest | null = null;
  let end: number | null = null;
  for await (const o of readLogical(path)) {
    if (o.k === 'manifest') manifest = o as unknown as Manifest;
    else if (o.k === 'row') counts.set(o.t as string, (counts.get(o.t as string) ?? 0) + 1);
    else if (o.k === 'end') end = Number(o.rows);
  }
  if (!manifest) return { ok: false, manifest, counts, reason: '안내 줄이 없습니다' };
  if (end === null) return { ok: false, manifest, counts, reason: '끝 줄이 없습니다(파일이 중간에 끊겼습니다)' };
  for (const x of manifest.tables) if ((counts.get(x.t) ?? 0) !== x.n) return { ok: false, manifest, counts, reason: `${x.t}: 안내 ${x.n}행, 파일 ${counts.get(x.t) ?? 0}행` };
  return { ok: true, manifest, counts };
}
