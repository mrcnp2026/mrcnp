// 백업 파일 보관소 — 비공개 GitHub 저장소(BACKUP_REPO, 예: mrcnp2026/mrcnp-backup)의 「릴리스」에 파일을 붙여 둔다.
// 릴리스 하나 = 백업 하나, 이름(태그)은 backup-YYYY-MM-DD (한국 날짜).
// 토큰 BACKUP_GITHUB_TOKEN은 그 저장소 하나에만 Contents 읽기·쓰기 권한을 준 것을 쓴다.
import { createReadStream, statSync } from 'node:fs';
import { Readable } from 'node:stream';

export type BackupRelease = { id: number; tag: string; date: string; size: number; createdAt: string };

function env() {
  const repo = process.env.BACKUP_REPO;
  const token = process.env.BACKUP_GITHUB_TOKEN;
  if (!repo || !token) throw new Error('backup_repo_not_configured');
  return { repo, token };
}

async function gh(path: string, init: RequestInit = {}, base = 'https://api.github.com'): Promise<Response> {
  const { token } = env();
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', ...(init.headers ?? {}) },
  });
  if (!res.ok && res.status !== 404 && !(res.status >= 300 && res.status < 400)) throw new Error(`github_${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res;
}

export async function listBackups(): Promise<BackupRelease[]> {
  const { repo } = env();
  const all: BackupRelease[] = [];
  for (let page = 1; ; page++) {
    const rows = (await (await gh(`/repos/${repo}/releases?per_page=100&page=${page}`)).json()) as Array<{
      id: number; tag_name: string; created_at: string; assets: Array<{ size: number }>;
    }>;
    for (const r of rows) {
      const m = /^backup-(\d{4}-\d{2}-\d{2})$/.exec(r.tag_name);
      if (m) all.push({ id: r.id, tag: r.tag_name, date: m[1], size: r.assets.reduce((s, a) => s + a.size, 0), createdAt: r.created_at });
    }
    if (rows.length < 100) break;
  }
  return all.sort((a, b) => a.date.localeCompare(b.date));
}

export async function deleteBackup(r: BackupRelease): Promise<void> {
  const { repo } = env();
  await gh(`/repos/${repo}/releases/${r.id}`, { method: 'DELETE' });
  await gh(`/repos/${repo}/git/refs/tags/${r.tag}`, { method: 'DELETE' });
}

// 같은 날 다시 돌리면 그날 것을 바꿔 넣는다
export async function uploadBackup(date: string, file: string, assetName: string, body: string): Promise<void> {
  const { repo } = env();
  const tag = `backup-${date}`;
  const old = await gh(`/repos/${repo}/releases/tags/${tag}`);
  if (old.status === 200) {
    const o = (await old.json()) as { id: number };
    await deleteBackup({ id: o.id, tag, date, size: 0, createdAt: '' });
  }
  const created = (await (await gh(`/repos/${repo}/releases`, {
    method: 'POST',
    body: JSON.stringify({ tag_name: tag, name: `백업 ${date}`, body, draft: false, prerelease: false }),
  })).json()) as { id: number };
  const size = statSync(file).size;
  await gh(
    `/repos/${repo}/releases/${created.id}/assets?name=${encodeURIComponent(assetName)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream', 'content-length': String(size) },
      body: Readable.toWeb(createReadStream(file)) as unknown as BodyInit,
      // @ts-expect-error Node fetch는 스트림 본문에 duplex가 필요하다
      duplex: 'half',
    },
    'https://uploads.github.com',
  );
}

/** 백업 파일을 받을 짧은 주소(GitHub가 몇 분만 열어 두는 서명 주소) — 통합설정 › 데이터베이스 백업의 내려받기. 토큰은 서버 밖으로 나가지 않는다 */
export async function backupDownloadUrl(releaseId: number): Promise<{ url: string; name: string } | null> {
  const { repo } = env();
  const rel = await gh(`/repos/${repo}/releases/${releaseId}`);
  if (rel.status !== 200) return null;
  const r = (await rel.json()) as { tag_name: string; assets: Array<{ id: number; name: string }> };
  const a = /^backup-\d{4}-\d{2}-\d{2}$/.test(r.tag_name) ? r.assets[0] : undefined;
  if (!a) return null;
  const res = await gh(`/repos/${repo}/releases/assets/${a.id}`, { headers: { accept: 'application/octet-stream' }, redirect: 'manual' });
  const url = res.headers.get('location');
  return url ? { url, name: a.name } : null;
}

export const backupConfigured = () => Boolean(process.env.BACKUP_REPO && process.env.BACKUP_GITHUB_TOKEN);

/** 백업 파일을 내려받을 수 있는 사람 — 시스템관리자(사번 admin) 한 계정만 (2026-10-18 의뢰인: 다른 사람은 내려받기 불가) */
export const BACKUP_DOWNLOADER_NO = 'admin';
export const canDownloadBackup = (me: { employeeNo: string | null } | null) => me?.employeeNo === BACKUP_DOWNLOADER_NO;
