// 백업 보관소 — 운영 DB와 **다른 Supabase 프로젝트**(출퇴근관리-개발)의 비공개 저장공간(Storage)에 암호화한 백업을 둔다 (2026-10-25).
// 운영 프로젝트가 통째로 사라져도 백업은 남는다. 값: BACKUP_STORE_URL(그 프로젝트 주소) · BACKUP_STORE_KEY(그 프로젝트의 비밀 키).
// 파일 이름: prod/db-YYYYMMDD-HHMMSS.jsonl.gz.enc  (한국 시간. 처음 올린 몇 개는 초가 없는 HHMM)
import { readFile } from 'node:fs/promises';

export const BUCKET = 'db-backups';
export const storeConfigured = () => Boolean(process.env.BACKUP_STORE_URL && process.env.BACKUP_STORE_KEY && process.env.BACKUP_PASSWORD);

const base = () => (process.env.BACKUP_STORE_URL ?? '').replace(/\/$/, '') + '/storage/v1';
const auth = () => ({ Authorization: `Bearer ${process.env.BACKUP_STORE_KEY}`, apikey: process.env.BACKUP_STORE_KEY ?? '' });

export type StoredBackup = { name: string; date: string; time: string; stamp: string; size: number; createdAt: string };

/** 파일 이름에서 한국 시간 날짜 · 시각을 읽는다 */
export function parseName(name: string): { date: string; time: string; stamp: string } | null {
  const m = /db-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})?\.jsonl\.gz\.enc$/.exec(name);
  return m ? { date: `${m[1]}-${m[2]}-${m[3]}`, time: `${m[4]}:${m[5]}`, stamp: `${m[1]}${m[2]}${m[3]}-${m[4]}${m[5]}${m[6] ?? ''}` } : null;
}

export function nameFor(now = new Date(), prefix = 'prod'): string {
  const k = new Date(now.getTime() + 9 * 3600e3).toISOString(); // 한국 시간
  return `${prefix}/db-${k.slice(0, 10).replace(/-/g, '')}-${k.slice(11, 19).replace(/:/g, '')}.jsonl.gz.enc`; // 초까지 넣어 같은 분에 두 번 받아도 이름이 겹치지 않는다
}

async function ensureBucket(): Promise<void> {
  const r = await fetch(`${base()}/bucket/${BUCKET}`, { headers: auth() });
  if (r.ok) return;
  const c = await fetch(`${base()}/bucket`, { method: 'POST', headers: { ...auth(), 'content-type': 'application/json' }, body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }) });
  if (!c.ok && c.status !== 409) throw new Error(`보관소 만들기 실패 ${c.status}`);
}

export async function uploadBackup(name: string, file: string): Promise<void> {
  await ensureBucket();
  const body = await readFile(file);
  const r = await fetch(`${base()}/object/${BUCKET}/${name}`, { method: 'POST', headers: { ...auth(), 'content-type': 'application/octet-stream', 'x-upsert': 'false' }, body });
  if (!r.ok) throw new Error(`보관소에 올리기 실패 ${r.status} ${(await r.text()).slice(0, 120)}`);
}

export async function listStored(prefix = 'prod'): Promise<StoredBackup[]> {
  await ensureBucket();
  const r = await fetch(`${base()}/object/list/${BUCKET}`, { method: 'POST', headers: { ...auth(), 'content-type': 'application/json' }, body: JSON.stringify({ prefix, limit: 1000, offset: 0, sortBy: { column: 'name', order: 'asc' } }) });
  if (!r.ok) throw new Error(`보관소 목록 읽기 실패 ${r.status}`);
  const rows = (await r.json()) as { name: string; created_at: string; metadata?: { size?: number } }[];
  return rows
    .map((x) => ({ x, p: parseName(x.name) }))
    .filter((y): y is { x: (typeof rows)[number]; p: NonNullable<ReturnType<typeof parseName>> } => !!y.p)
    .map(({ x, p }) => ({ name: `${prefix}/${x.name}`, ...p, size: x.metadata?.size ?? 0, createdAt: x.created_at }));
}

export async function downloadStored(name: string): Promise<Buffer> {
  const r = await fetch(`${base()}/object/${BUCKET}/${name}`, { headers: auth() });
  if (!r.ok) throw new Error(`보관소에서 받기 실패 ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

export async function removeStored(names: string[]): Promise<void> {
  if (names.length === 0) return;
  const r = await fetch(`${base()}/object/${BUCKET}`, { method: 'DELETE', headers: { ...auth(), 'content-type': 'application/json' }, body: JSON.stringify({ prefixes: names }) });
  if (!r.ok) throw new Error(`보관소 파일 지우기 실패 ${r.status}`);
}

/** 보관 규칙: 최근 14일은 전부, 그 밖에는 달마다 첫 백업(최근 12개월), 해마다 첫 백업(영구). 같은 날 여러 개면 모두 최근 14일 안에서만 둔다 */
export const KEEP_DAYS = 14;
export const KEEP_MONTHS = 12;
export function keepRule(stamps: { name: string; date: string }[], today: string): Map<string, { recent: boolean; monthly: boolean; yearly: boolean }> {
  const res = new Map(stamps.map((s) => [s.name, { recent: false, monthly: false, yearly: false }]));
  const cutoff = new Date(Date.parse(today) - (KEEP_DAYS - 1) * 86_400_000).toISOString().slice(0, 10);
  const sorted = [...stamps].sort((a, b) => a.name.localeCompare(b.name));
  for (const s of sorted) if (s.date >= cutoff) res.get(s.name)!.recent = true;
  const firstM = new Map<string, string>(), firstY = new Map<string, string>();
  for (const s of sorted) {
    if (!firstM.has(s.date.slice(0, 7))) firstM.set(s.date.slice(0, 7), s.name);
    if (!firstY.has(s.date.slice(0, 4))) firstY.set(s.date.slice(0, 4), s.name);
  }
  for (const n of [...firstM.values()].slice(-KEEP_MONTHS)) res.get(n)!.monthly = true;
  for (const n of firstY.values()) res.get(n)!.yearly = true;
  return res;
}
