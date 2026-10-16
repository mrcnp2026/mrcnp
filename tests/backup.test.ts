// 백업 보관 규칙 · 암호화 (src/lib/backup)
import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { classify, toDelete } from '@/lib/backup/retention';
import { encryptFile, decryptFile } from '@/lib/backup/crypto';

// 2024-01-07부터 매주 일요일, 3년치
function sundays(n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(new Date(Date.UTC(2024, 0, 7 + i * 7)).toISOString().slice(0, 10));
  return out;
}

describe('보관 규칙', () => {
  it('3년치 주간 백업 → 매주 8 · 매월 12 · 매년 3, 나머지는 지운다', () => {
    const all = sundays(156);
    const gone = new Set(toDelete(all));
    const kept = all.filter((d) => !gone.has(d));
    const cls = classify(kept);
    expect([...cls.values()].filter((v) => v.weekly)).toHaveLength(8);
    expect([...cls.values()].filter((v) => v.monthly)).toHaveLength(12);
    expect([...cls.values()].filter((v) => v.yearly)).toHaveLength(3);
    expect(kept.length).toBeLessThanOrEqual(8 + 12 + 3);
    expect(kept).toContain('2024-01-07'); // 첫해 첫 백업은 영구
    expect(kept.at(-1)).toBe(all.at(-1)); // 방금 만든 것은 남는다
  });

  it('한 번 남긴 매월 · 매년 백업은 다음 주에도 지워지지 않는다 (그달 · 그해 첫 백업 기준)', () => {
    const all = sundays(100);
    const kept1 = all.filter((d) => !toDelete(all).includes(d));
    const next = [...kept1, sundays(101).at(-1)!];
    const kept2 = next.filter((d) => !toDelete(next).includes(d));
    const yearly = (ds: string[]) => [...classify(ds)].filter(([, v]) => v.yearly).map(([d]) => d);
    expect(yearly(kept2)).toEqual(yearly(kept1));
  });

  it('백업이 몇 개 없으면 아무것도 지우지 않는다', () => {
    expect(toDelete(sundays(5))).toEqual([]);
  });
});

describe('암호화', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bk-test-'));
  const plain = join(dir, 'a.bin');
  const enc = join(dir, 'a.enc');
  const back = join(dir, 'a.out');
  const data = randomBytes(300_000);
  writeFileSync(plain, data);

  it('같은 비밀번호로 풀면 원본과 같다', async () => {
    await encryptFile(plain, enc, 'correct horse battery');
    expect(readFileSync(enc).subarray(0, 6).toString()).toBe('ATTBK1');
    await decryptFile(enc, back, 'correct horse battery');
    expect(readFileSync(back).equals(data)).toBe(true);
  });

  it('비밀번호가 틀리면 풀리지 않는다', async () => {
    await expect(decryptFile(enc, back, 'wrong password!!')).rejects.toThrow();
  });

  it('파일이 한 바이트라도 바뀌면 풀리지 않는다', async () => {
    const buf = readFileSync(enc);
    buf[1000] ^= 1;
    writeFileSync(enc, buf);
    await expect(decryptFile(enc, back, 'correct horse battery')).rejects.toThrow();
    rmSync(dir, { recursive: true, force: true });
  });

  it('짧은 비밀번호는 거절한다', async () => {
    await expect(encryptFile(plain, enc, 'short')).rejects.toThrow('backup_password_too_short');
  });
});
