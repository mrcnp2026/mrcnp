// 서버 사용량 지킴이 — 2026-11-04 Vercel 무료 한도 초과로 운영이 멈췄던 원인이 코드에 다시 들어오면 여기서 실패한다.
// 원인: 화면이 열려 있기만 해도 서버를 자주 부르던 것(알림 숫자 1분 · 관리자 홈 30초 · 보이는 링크 모두 미리 받기),
// 로고가 캐시 없이 서버를 탐, pc-4 · main 이중 배포로 배포 기록이 쌓임. 실패하면 「정말 서버를 더 불러야 하나」부터 보고 고친다.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.join(import.meta.dirname, '..');
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|mjs|js)$/.test(n) ? [p] : [];
  });
const files = walk(path.join(root, 'src')).map((p) => ({ rel: path.relative(root, p).replaceAll('\\', '/'), src: readFileSync(p, 'utf8') }));
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

/** `<Link` 태그 하나의 글자(중괄호 안의 `>`는 건너뛴다) */
const tagAt = (s: string, i: number) => {
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === '{') depth++;
    else if (s[j] === '}') depth--;
    else if (s[j] === '>' && depth === 0) return s.slice(i, j + 1);
  }
  return s.slice(i);
};

describe('서버 사용량 지킴이 (2026-11-04 한도 초과 재발 막기)', () => {
  it('모든 <Link>는 prefetch={false} — 보이기만 해도 미리 받으면 화면마다 서버를 수십 번 부른다', () => {
    const bad = files.filter(({ src }) => !/IntentLink as Link/.test(src)).flatMap(({ rel, src }) =>
      [...src.matchAll(/<Link\b/g)].filter((m) => !tagAt(src, m.index).includes('prefetch={false}')).map((m) => `${rel}:${src.slice(0, m.index).split('\n').length}`),
    );
    expect(bad).toEqual([]);
  });

  it('router.prefetch는 IntentLink(손이 닿을 때만)에서만', () => {
    expect(files.filter((f) => /router\.prefetch\(/.test(f.src)).map((f) => f.rel)).toEqual(['src/components/IntentLink.tsx']);
  });

  it('주기 타이머(setInterval)는 정해 둔 곳에만 — 새로 쓰려면 서버를 부르는지 보고 여기 목록에 넣는다', () => {
    const known = ['src/app/admin/AutoRefresh.tsx', 'src/app/punch/TodayCard.tsx', 'src/components/Alerts.tsx', 'src/components/LiveClock.tsx', 'src/components/NoticeSheet.tsx'];
    expect(files.filter((f) => /setInterval\(/.test(f.src)).map((f) => f.rel).sort()).toEqual(known);
  });

  it('서버를 부르는 주기: 알림 숫자 · 공지 3분 이상, 관리자 화면 새로고침 2분 이상', () => {
    expect(read('src/components/Alerts.tsx')).toMatch(/setInterval\(maybeReload, 180_000\)/);
    expect(read('src/components/NoticeSheet.tsx')).toMatch(/const POLL_MS = 180_000;/);
    const secs = files.flatMap((f) => [...f.src.matchAll(/<AutoRefresh seconds=\{(\d+)\}/g)].map((m) => +m[1]));
    expect(secs.length).toBeGreaterThan(0);
    expect(secs.filter((s) => s < 120)).toEqual([]);
  });

  it('로고 · 아이콘은 CDN이 저장(s-maxage)하고, 미들웨어를 태우지 않는다', () => {
    for (const r of ['src/app/api/brand/logo/route.ts', 'src/app/api/brand/icon/route.ts']) expect(read(r)).toMatch(/s-maxage=\d+/);
    const mw = read('src/middleware.ts');
    for (const p of ['api/brand/', 'api/cron/', 'api/health']) expect(mw).toContain(`|${p}`);
  });

  it('maxDuration은 300초 이하(무료 요금제 한도)', () => {
    const over = files.flatMap((f) => [...f.src.matchAll(/export const maxDuration = (\d+)/g)].filter((m) => +m[1] > 300).map(() => f.rel));
    expect(over).toEqual([]);
  });

  it('vercel.json: pc-4 · 작업 사본 자동 배포 끔, 크론은 하루 한 번 이하(무료 요금제는 그보다 잦으면 배포가 막힌다)', () => {
    const v = JSON.parse(read('vercel.json')) as { git: { deploymentEnabled: Record<string, boolean> }; crons: { path: string; schedule: string }[] };
    expect(v.git.deploymentEnabled).toMatchObject({ 'pc-4': false, 'worktree-*': false });
    const often = v.crons.filter((c) => !/^\d+ \d+ /.test(c.schedule)).map((c) => c.path);
    expect(often).toEqual([]);
  });
});
